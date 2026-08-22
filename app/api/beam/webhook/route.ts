import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { verifyBeamSignature, refundCharge, findChargeId, parseReference } from '@/lib/beam';

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
          .prepare('SELECT status, payment_status FROM bookings WHERE id = ?')
          .bind(bookingId)
          .first<{ status: string; payment_status: string }>();
        if (!booking) break;
        // A lapsed hold stays cancelled — the seat is gone. charge.succeeded
        // handles giving the money back.
        if (booking.status === 'cancelled' || booking.payment_status === 'expired') break;

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
              .prepare('SELECT id, status, payment_status, beam_charge_id FROM bookings WHERE id = ?')
              .bind(bookingId)
              .first<{
                id: string;
                status: string;
                payment_status: string;
                beam_charge_id: string | null;
              }>()
          : null;

        // Money we should not be holding. Refund it and log it either way, so
        // the admin reconcile page shows anything the refund could not fix.
        let reason: string | null = null;
        if (!booking) reason = 'unknown';
        else if (booking.status === 'cancelled' || booking.payment_status === 'expired')
          reason = 'late_cancelled';
        else if (booking.beam_charge_id && booking.beam_charge_id !== chargeId) reason = 'duplicate';

        if (reason) {
          // Beam re-delivers the same charge several times, so the refund has
          // to fire once. The reconcile row is keyed by charge id: if it is
          // already there, this charge has been handled, and a second refund
          // would only collect a 400 for having nothing left to refund.
          const seen = chargeId
            ? await db
                .prepare('SELECT id FROM orphan_payments WHERE id = ?')
                .bind(chargeId)
                .first<{ id: string }>()
            : null;

          // Refund only money we can positively tie to one of our own bookings.
          // `unknown` means no matching row — which, on a shared Beam account,
          // is most likely somebody else's legitimate payment. Refunding on a
          // guess moves real money, so it goes to the reconcile page for a
          // human instead.
          const refundable = reason !== 'unknown';
          if (chargeId && refundable && !seen) {
            try {
              await refundCharge(
                chargeId,
                reason === 'duplicate'
                  ? 'Duplicate payment for the same booking'
                  : 'Payment received after the seat hold expired',
              );
            } catch (e) {
              console.error('Beam late/duplicate refund failed', chargeId, e);
            }
          }
          // Recorded whether or not the refund went through — without a charge
          // id we cannot refund automatically and a human must chase it.
          await db
            .prepare(
              `INSERT OR IGNORE INTO orphan_payments (id, payment_intent, booking_id, amount, currency, email, reason)
               VALUES (?, ?, ?, ?, 'thb', ?, ?)`,
            )
            .bind(chargeId || uuid(), linkId, bookingId, amount, email, reason)
            .run();
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
          await db
            .prepare(
              "UPDATE bookings SET payment_status='refunded' WHERE id = ? AND payment_status = 'paid'",
            )
            .bind(bookingId)
            .run();
          await db
            .prepare(
              "UPDATE orphan_payments SET resolved = 1, resolved_note = 'refunded — confirmed by Beam' WHERE booking_id = ? AND resolved = 0",
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
