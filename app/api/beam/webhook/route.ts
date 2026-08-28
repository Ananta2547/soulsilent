import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { sqliteToMs } from '@/lib/datetime';
import {
  verifyBeamSignature,
  refundCharge,
  findChargeId,
  parseReference,
  fetchPaymentLink,
} from '@/lib/beam';

/**
 * POST /api/beam/webhook — Beam event receiver.
 *
 * Register this URL in Lighthouse → Webhook Settings; the signing key shown
 * there goes into BEAM_WEBHOOK_SECRET.
 *
 * Events we act on:
 *   payment_link.paid  — the seat is paid for; confirm the booking.
 *   charge.succeeded   — money actually moved. Records the charge id (needed to
 *                        refund) and catches money that should never have
 *                        arrived: a saved QR paid after the hold lapsed, or the
 *                        same QR scanned twice. PromptPay is a push payment so
 *                        neither can be blocked at the bank — the same reality
 *                        that drove the Stripe-era orphan reconcile.
 *   refund.succeeded   — mark the booking refunded.
 *
 * Anything else is acknowledged and ignored: a 200 stops Beam retrying an event
 * we have no use for.
 */

/**
 * Find the event name in a Beam payload.
 *
 * The first live payments arrived with neither `eventType` nor `type` set, so
 * every event fell through to the default branch and nothing was processed —
 * bookings only looked correct because the redirect-time verify was quietly
 * doing the work. Match on any key that reads like an event name, and accept
 * the value only if it looks like one ("charge.succeeded", "payment_link.paid").
 */
function readEventType(event: Record<string, unknown>): string {
  for (const [key, v] of Object.entries(event)) {
    if (typeof v !== 'string' || !v) continue;
    const k = key.toLowerCase().replace(/[_-]/g, '');
    if (k === 'eventtype' || k === 'type' || k === 'event' || k === 'eventname' || k === 'name') {
      return v;
    }
  }
  // Some senders put the name one level down, next to the resource.
  const data = event.data;
  if (data && typeof data === 'object') {
    for (const [key, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v !== 'string' || !v) continue;
      const k = key.toLowerCase().replace(/[_-]/g, '');
      if (k === 'eventtype' || k === 'type' || k === 'event' || k === 'eventname') return v;
    }
  }
  return '';
}

/**
 * Has this booking's payment window closed?
 *
 * `expires_at` is the authority, NOT the status flags. Those flags are set by a
 * sweep that runs lazily when someone reads the bookings list, plus a cron a
 * minute apart — so a hold can be well past its deadline while the row still
 * reads "pending". Trusting the flags alone let a payment arriving after the
 * window confirm the booking and take a seat that had already been released.
 */
function isLate(b: { status: string; payment_status: string; expires_at: string | null }): boolean {
  if (b.status === 'cancelled' || b.payment_status === 'expired') return true;
  if (b.payment_status === 'paid') return false;
  if (!b.expires_at) return false; // selection applications carry no hold
  const ms = sqliteToMs(b.expires_at);
  return Number.isFinite(ms) && ms <= Date.now();
}

/** Beam's payload field names are not published; read the usual spellings. */
function pick(o: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!o) return null;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}
function pickNum(o: Record<string, unknown> | undefined, ...keys: string[]): number {
  if (!o) return 0;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number') return v;
  }
  return 0;
}

export async function POST(request: Request) {
  try {
    // The RAW body must be used for the signature — re-serialising parsed JSON
    // changes the bytes and verification fails.
    const raw = await request.text();
    const signature = request.headers.get('x-beam-signature');
    const env = await getEnv();
    const secret = env.BEAM_WEBHOOK_SECRET || '';

    if (!signature || !secret) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
    }
    if (!(await verifyBeamSignature(raw, signature, secret))) {
      console.error('Beam webhook: bad signature');
      return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(raw) as Record<string, unknown> & {
      data?: Record<string, unknown>;
    };
    const type = readEventType(event);
    // Some gateways nest the resource under `data`, some send it flat.
    const data = (event.data || (event as Record<string, unknown>)) as Record<string, unknown>;
    const db = await getDB();

    // Field names taken from real deliveries — the docs publish no payload
    // schema, and none of the names they imply are the ones actually sent.
    // Two shapes arrive, neither carrying an event name:
    //
    //   transaction  { transactionId: "ch_…", sourceId: <linkId>,
    //                  referenceId: <bookingId>, chargeSource: "PAYMENT_LINK",
    //                  transactionType: "PAYMENT" | "REFUND",
    //                  grossAmount, netAmount, feeAmount }
    //   purchase     { purchaseId: <linkId>, state: "complete",
    //                  customer: { email, contactNumber } }
    //
    // The purchase shape has no referenceId, so its booking is found through
    // the stored link id instead.
    //
    // Since migration 048 PromptPay charges are created by us through the
    // Charges API rather than by a payment link. Those report `source: "API"`
    // with an EMPTY `sourceId`, and there is no purchase-shaped event at all —
    // `pick` skips empty strings, so `linkId` comes out null and the booking is
    // found by `referenceId`, which is the only route those charges need.
    const order = (data.order || {}) as Record<string, unknown>;
    const customer = (data.customer || {}) as Record<string, unknown>;

    const linkId = pick(data, 'sourceId', 'purchaseId', 'paymentLinkId', 'linkId');
    // `transactionId` is the charge (it carries the ch_ prefix); findChargeId
    // stays as a backstop for any future naming.
    const chargeId =
      pick(data, 'transactionId', 'chargeId', 'charge_id') || findChargeId(event);
    const transactionType = (pick(data, 'transactionType') || '').toUpperCase();
    const state = (pick(data, 'state', 'status') || '').toUpperCase();

    // Preview and production share one Beam account, and Beam delivers every
    // event to every registered endpoint — so much of what arrives here belongs
    // to the other site. The reference carries the host that created it.
    const reference = pick(data, 'referenceId') || pick(order, 'referenceId');
    const { host: refHost, bookingId: refBookingId } = parseReference(reference);
    const ourHost = (() => {
      try {
        return new URL(env.SITE_URL || '').host;
      } catch {
        return '';
      }
    })();
    if (refHost && ourHost && refHost !== ourHost) {
      console.log(`Beam webhook: ignoring event for ${refHost} (we are ${ourHost})`);
      return NextResponse.json({ received: true, ignored: 'other-environment' });
    }

    let bookingId = refBookingId;
    if (!bookingId && linkId) {
      const row = await db
        .prepare('SELECT id FROM bookings WHERE beam_payment_link_id = ?')
        .bind(linkId)
        .first<{ id: string }>();
      bookingId = row?.id ?? null;

      // The link we hold is only the newest one. If a booking ever had an
      // earlier link — the user opened checkout, went back, opened it again —
      // paying that older QR arrives here with a link id the row no longer
      // stores. Ask Beam who the link belongs to: its referenceId names the
      // booking, so the payment is still honoured instead of silently ignored.
      if (!bookingId) {
        const link = await fetchPaymentLink(linkId);
        const linkOrder = (link.raw?.order || {}) as Record<string, unknown>;
        const fromLink = parseReference(
          typeof linkOrder.referenceId === 'string' ? linkOrder.referenceId : null,
        );
        if (fromLink.host && ourHost && fromLink.host !== ourHost) {
          console.log(`Beam webhook: ignoring event for ${fromLink.host} (we are ${ourHost})`);
          return NextResponse.json({ received: true, ignored: 'other-environment' });
        }
        bookingId = fromLink.bookingId;
        if (bookingId) {
          console.log(`Beam webhook: recovered booking ${bookingId} from link ${linkId}`);
        }
      }
    }

    // Classify by shape, since there is no name to switch on. A refund must be
    // checked first: it is a transaction too, and would otherwise be booked as
    // an incoming payment.
    // Money going back out is a transaction too, so it has to be recognised
    // before the incoming-payment branch — otherwise a refund reads as fresh
    // suspicious money and the system tries to refund the refund. Beam labels
    // it VOID rather than REFUND, and its transactionId is the refund's own
    // `re_…` id, not the charge it reverses.
    const isRefund =
      transactionType === 'REFUND' ||
      transactionType === 'VOID' ||
      (chargeId?.startsWith('re_') ?? false);

    let effective = type;
    if (!effective) {
      if (isRefund) effective = 'refund.succeeded';
      else if (chargeId) effective = 'charge.succeeded';
      else if (linkId && (state === 'COMPLETE' || state === 'PAID')) {
        effective = 'payment_link.paid';
      }
    }

    console.log(
      `Beam webhook ${effective || 'ignored'} booking=${bookingId ?? '-'} link=${linkId ?? '-'} charge=${chargeId ?? '-'} txType=${transactionType || '-'} state=${state || '-'}`,
    );
    if (!effective) {
      // Shape we don't recognise — log it rather than dropping a payment
      // silently, which is exactly what the first live tests did.
      console.warn('Beam webhook: unclassified payload=', raw.slice(0, 800));
    }

    switch (effective) {
      case 'payment_link.paid': {
        if (!bookingId) break;
        const booking = await db
          .prepare('SELECT status, payment_status, expires_at FROM bookings WHERE id = ?')
          .bind(bookingId)
          .first<{ status: string; payment_status: string; expires_at: string | null }>();
        if (!booking) break;
        // A lapsed hold stays cancelled — the seat is gone. charge.succeeded
        // handles giving the money back.
        if (isLate(booking)) break;

        // Store the charge id here too: whichever event lands first should
        // leave the booking refundable. COALESCE keeps an id already set by
        // charge.succeeded rather than blanking it.
        await db
          .prepare(
            "UPDATE bookings SET status='confirmed', payment_status='paid', expires_at=NULL, beam_charge_id = COALESCE(beam_charge_id, ?) WHERE id = ?",
          )
          .bind(chargeId, bookingId)
          .run();
        break;
      }

      case 'charge.succeeded': {
        // grossAmount is what the payer was charged; netAmount is after Beam's
        // fee. Record the gross, since that is what has to be given back.
        const amount = pickNum(data, 'grossAmount', 'amount', 'netAmount');
        const email =
          pick(data, 'email', 'receiptEmail', 'customerEmail') || pick(customer, 'email');

        const booking = bookingId
          ? await db
              .prepare(
                'SELECT id, status, payment_status, expires_at, beam_charge_id FROM bookings WHERE id = ?',
              )
              .bind(bookingId)
              .first<{
                id: string;
                status: string;
                payment_status: string;
                expires_at: string | null;
                beam_charge_id: string | null;
              }>()
          : null;

        // Money we should not be holding. Refund it and log it either way, so
        // the admin reconcile page shows anything the refund could not fix.
        let reason: string | null = null;
        if (!booking) reason = 'unknown';
        else if (isLate(booking)) reason = 'late_cancelled';
        else if (booking.beam_charge_id && booking.beam_charge_id !== chargeId) reason = 'duplicate';

        // The row may still read "pending" simply because nothing has swept it
        // yet — the sweep is lazy and the cron runs a minute apart. Close it here
        // so the seat is not handed out by a later code path.
        if (booking && reason === 'late_cancelled' && booking.status !== 'cancelled') {
          await db
            .prepare(
              "UPDATE bookings SET status='cancelled', payment_status='expired', expires_at=NULL, cancel_reason=COALESCE(cancel_reason,'payment_timeout') WHERE id = ?",
            )
            .bind(booking.id)
            .run();
        }

        if (reason) {
          // Claim this charge BEFORE touching the money.
          //
          // Beam re-delivers the same charge, and the deliveries can arrive
          // CONCURRENTLY — two did, in the same second, during the late-payment
          // test. Both read the reconcile table before either had written to
          // it, both passed the "have we handled this?" check, and both fired a
          // refund. Beam refused the second, so nothing went out twice, but the
          // two handlers then wrote different values for `cancel_reason` and
          // whichever landed last won. The booking's story was decided by a
          // coin toss.
          //
          // The INSERT is the claim instead of a SELECT before it. `id` is the
          // charge id and the primary key, so exactly one delivery can create
          // the row; a delivery that inserted nothing is a re-delivery and has
          // nothing left to do. Recorded whether or not the refund goes through
          // — without a charge id we cannot refund automatically and a human
          // must chase it.
          const claim = await db
            .prepare(
              `INSERT OR IGNORE INTO orphan_payments (id, payment_intent, booking_id, amount, currency, email, reason)
               VALUES (?, ?, ?, ?, 'thb', ?, ?)`,
            )
            .bind(chargeId || uuid(), linkId, bookingId, amount, email, reason)
            .run();
          if (claim.meta.changes !== 1) {
            console.log(`Beam webhook: charge ${chargeId} already claimed, nothing to do`);
            break;
          }

          // Refund only money we can positively tie to one of our own bookings.
          // `unknown` means no matching row — which, on a shared Beam account,
          // is most likely somebody else's legitimate payment. Refunding on a
          // guess moves real money, so it goes to the reconcile page for a
          // human instead.
          const refundable = reason !== 'unknown';
          let refunded = false;
          if (chargeId && refundable) {
            try {
              await refundCharge(
                chargeId,
                reason === 'duplicate'
                  ? 'Duplicate payment for the same booking'
                  : 'Payment received after the seat hold expired',
              );
              refunded = true;
            } catch (e) {
              console.error('Beam late/duplicate refund failed', chargeId, e);
            }
          }

          // Leave a mark on the booking so the site can tell the user what
          // became of their money. Without it they see only "cancelled" and
          // have no idea a refund is coming — which is how someone pays again,
          // or contacts support in a panic.
          //
          // ONLY for a lapsed hold. A duplicate is the opposite situation: the
          // seat is confirmed and it is the SECOND payment going back. Marking
          // it here put "your payment arrived too late, the seat is gone" in
          // front of people who did get their seat, because `cancel_reason`
          // drives both the red remark and the popup on /me/bookings.
          if (bookingId && reason === 'late_cancelled') {
            await db
              .prepare('UPDATE bookings SET cancel_reason = ? WHERE id = ?')
              .bind(refunded ? 'late_refunded' : 'late_refund_pending', bookingId)
              .run();
          }
          break;
        }

        // Legitimate payment — keep the charge id so a refund stays possible.
        await db
          .prepare(
            "UPDATE bookings SET beam_charge_id = ?, status='confirmed', payment_status='paid', expires_at=NULL WHERE id = ?",
          )
          .bind(chargeId, booking!.id)
          .run();
        break;
      }

      case 'refund.succeeded': {
        // The payload identifies the refund, not the charge it reverses, so
        // close the reconcile entry by booking rather than by charge id.
        if (bookingId) {
          // A refund does NOT always mean this booking's own money went back.
          // When someone pays twice, the refund is of the SECOND charge while
          // the first still holds a confirmed seat — and closing by booking id
          // marked that live booking "refunded", so a paid-up attendee saw
          // "↩ คืนเงินแล้ว" on a seat they still have.
          //
          // Only a booking whose seat is already gone can have been refunded in
          // the sense the UI means.
          await db
            .prepare(
              "UPDATE bookings SET payment_status='refunded' WHERE id = ? AND payment_status = 'paid' AND status = 'cancelled'",
            )
            .bind(bookingId)
            .run();
          await db
            .prepare(
              "UPDATE orphan_payments SET resolved = 1, resolved_note = 'refunded — confirmed by Beam' WHERE booking_id = ? AND resolved = 0",
            )
            .bind(bookingId)
            .run();
          // Tell the booking too. Beam has just confirmed the money went back,
          // yet only the cron sweep ever moved this flag on — so the site kept
          // saying "your refund is being processed" for up to a minute after it
          // had landed, and forever anywhere the cron does not run.
          await db
            .prepare(
              "UPDATE bookings SET cancel_reason = 'late_refunded' WHERE id = ? AND cancel_reason = 'late_refund_pending'",
            )
            .bind(bookingId)
            .run();
        } else if (chargeId) {
          await db
            .prepare(
              "UPDATE orphan_payments SET resolved = 1, resolved_note = 'refunded — confirmed by Beam' WHERE id = ?",
            )
            .bind(chargeId)
            .run();
        }
        break;
      }

      default:
        // Acknowledged, nothing to do.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Beam webhook error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
