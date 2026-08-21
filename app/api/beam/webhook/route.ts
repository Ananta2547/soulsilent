import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { verifyBeamSignature, refundCharge, fetchPaymentLink, findChargeId } from '@/lib/beam';

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

    const event = JSON.parse(raw) as {
      eventType?: string;
      type?: string;
      data?: Record<string, unknown>;
    };
    const type = event.eventType || event.type || '';
    // Some gateways nest the resource under `data`, some send it flat.
    const data = (event.data || (event as Record<string, unknown>)) as Record<string, unknown>;
    const db = await getDB();

    // Our booking id, sent as order.referenceId when the link was created.
    const order = (data.order || {}) as Record<string, unknown>;
    const bookingId = pick(data, 'referenceId') || pick(order, 'referenceId');
    const linkId = pick(data, 'paymentLinkId', 'id', 'linkId');
    // Beam publishes no payload schema, so search the whole object rather than
    // trusting one spelling — the first live payment carried no top-level
    // `chargeId` and left the booking with nothing to refund against.
    let chargeId = findChargeId(event);

    // Second chance: the event may not carry the charge, but the payment link
    // does once it is PAID. Without an id we can never refund this money.
    if (!chargeId && linkId && (type === 'payment_link.paid' || type === 'charge.succeeded')) {
      const link = await fetchPaymentLink(linkId);
      chargeId = findChargeId(link.raw);
    }
    if (!chargeId && (type === 'payment_link.paid' || type === 'charge.succeeded')) {
      // Log the shape once so the next real payment tells us where it hides.
      console.warn(`Beam webhook ${type}: no charge id found. payload=`, raw.slice(0, 800));
    }

    console.log(
      `Beam webhook ${type} booking=${bookingId ?? '-'} link=${linkId ?? '-'} charge=${chargeId ?? '-'}`,
    );

    switch (type) {
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
        const amount = pickNum(data, 'amount', 'netAmount');
        const email = pick(data, 'email', 'receiptEmail', 'customerEmail');

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
          if (chargeId) {
            try {
              await refundCharge(chargeId);
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
        if (chargeId) {
          await db
            .prepare("UPDATE bookings SET payment_status='refunded' WHERE beam_charge_id = ?")
            .bind(chargeId)
            .run();
          await db
            .prepare(
              "UPDATE orphan_payments SET resolved = 1, resolved_note = 'refunded by Beam webhook' WHERE id = ?",
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
