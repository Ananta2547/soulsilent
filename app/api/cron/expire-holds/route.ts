import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { expireCheckoutSession, fetchCheckoutSession, refundPaymentIntent } from '@/lib/stripe';
import { disablePaymentLink, refundCharge } from '@/lib/beam';

/**
 * Sweep unpaid bookings whose 10-minute hold has lapsed, close whatever hosted
 * checkout they carry, and mark the bookings EXPIRED.
 *
 * This does NOT kill a PromptPay QR any more. Since migration 048 the QR is our
 * own Charges API charge, and Beam has no endpoint to cancel a pending one, so
 * it stays scannable for its fixed 30 minutes. Late money is handled by the
 * refund retry further down instead.
 *
 * Intended to be hit every minute by an external scheduler (Cloudflare Cron
 * Trigger / cron-job.org / GitHub Actions) with the shared secret:
 *   GET /api/cron/expire-holds   header: x-cron-secret: <CRON_SECRET>
 */
export async function GET(request: Request) {
  try {
    const env = await getEnv();
    const secret = env.CRON_SECRET || '';
    if (!secret || request.headers.get('x-cron-secret') !== secret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = await getDB();
    // Lapsed holds still awaiting payment.
    const rows = await db
      .prepare(
        `SELECT id, stripe_session_id, beam_payment_link_id FROM bookings
         WHERE payment_status = 'pending'
           AND status != 'cancelled'
           AND expires_at IS NOT NULL
           AND datetime(expires_at) <= datetime('now')
         LIMIT 100`
      )
      .all<{ id: string; stripe_session_id: string | null; beam_payment_link_id: string | null }>();

    let expired = 0;
    let paid = 0;
    for (const b of rows.results) {
      let becamePaid = false;
      // Beam for rows booked since the switchover, Stripe for holds still in
      // flight from before it.
      if (b.beam_payment_link_id) {
        try {
          const r = await disablePaymentLink(b.beam_payment_link_id);
          becamePaid = r.paid;
        } catch (e) {
          console.error('cron disablePaymentLink failed', b.id, e);
        }
      } else if (b.stripe_session_id) {
        try {
          const r = await expireCheckoutSession(b.stripe_session_id);
          becamePaid = r.paid;
        } catch (e) {
          console.error('cron expireCheckoutSession failed', b.id, e);
        }
      }
      if (becamePaid) {
        await db
          .prepare("UPDATE bookings SET status='confirmed', payment_status='paid', expires_at=NULL WHERE id = ?")
          .bind(b.id)
          .run();
        paid++;
      } else {
        await db
          .prepare(
            "UPDATE bookings SET status='cancelled', payment_status='expired', expires_at=NULL, cancel_reason='payment_timeout' WHERE id = ?"
          )
          .bind(b.id)
          .run();
        expired++;
      }
    }

    // Retroactive cleanup: recently-expired bookings whose PaymentIntent may
    // still be live (e.g. expired by an older code path where session.expire
    // couldn't cancel a PromptPay PI in requires_action → the saved QR stayed
    // scannable). Re-run expire (now cancels the PI); if the customer already
    // paid the stale QR, refund. Bounded to 30 min so each row is only
    // re-checked a handful of times before it ages out.
    // ?deep=1 → one-off wide sweep (7 days) to clean up QRs left live by the
    // old code path. The scheduled cron uses the narrow 30-min window.
    const deep = new URL(request.url).searchParams.get('deep') === '1';
    const staleWindow = deep ? '-7 days' : '-30 minutes';
    const stale = await db
      .prepare(
        // Catch both post-fix rows (payment_status='expired') AND pre-fix rows
        // left by the old lazy path (status='cancelled' + payment_status still
        // 'pending') — those older bookings have a live PaymentIntent whose saved
        // QR is still scannable until swept here or Stripe's 24h session expiry.
        `SELECT id, stripe_session_id AS sid, beam_payment_link_id AS beam FROM bookings
         WHERE (stripe_session_id IS NOT NULL OR beam_payment_link_id IS NOT NULL)
           AND (payment_status = 'expired'
                OR (status = 'cancelled' AND payment_status = 'pending'))
           AND datetime(created_at) >= datetime('now', '${staleWindow}')
         LIMIT 50`
      )
      .all<{ id: string; sid: string | null; beam: string | null }>();
    let cleaned = 0;
    let refunded = 0;
    for (const r of stale.results) {
      try {
        if (r.beam) {
          // Beam: closing the link tells us whether money landed anyway. The
          // charge id needed for a refund comes from the charge.succeeded
          // webhook, so refunds for late Beam payments are issued there rather
          // than here.
          const res = await disablePaymentLink(r.beam);
          if (res.paid) {
            console.warn('cron: Beam link paid after expiry, refund via webhook', r.id);
          } else {
            cleaned++;
          }
        } else if (r.sid) {
          const res = await expireCheckoutSession(r.sid);
          if (res.paid) {
            const s = await fetchCheckoutSession(r.sid);
            const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
            if (pi) {
              await refundPaymentIntent(pi);
              refunded++;
            }
          } else {
            cleaned++;
          }
        }
      } catch (e) {
        console.error('cron retroactive cleanup failed', r.id, e);
      }
    }

    // ── Retry refunds that did not go through when the money arrived ─────────
    //
    // Refunding straight from the webhook fails: every automatic attempt, fired
    // a second or two after the charge, comes back 502, while the identical
    // request sent minutes later succeeds. Beam appears not to accept a refund
    // on a charge that fresh.
    //
    // Without this, one failed attempt left the money stranded until somebody
    // noticed and refunded it by hand. Anything still unresolved and older than
    // a couple of minutes gets another try, every minute, until it lands.
    //
    // `unknown` is never retried: that is money we could not tie to any booking
    // of ours, and refunding on a guess moves real money.
    let retried = 0;
    let retryOk = 0;
    const pending = await db
      .prepare(
        `SELECT id, booking_id, reason FROM orphan_payments
          WHERE resolved = 0
            AND reason != 'unknown'
            AND id LIKE 'ch_%'
            AND datetime(created_at) <= datetime('now', '-2 minutes')
            AND datetime(created_at) >= datetime('now', '-7 days')
          LIMIT 20`,
      )
      .all<{ id: string; booking_id: string | null; reason: string }>();

    for (const p of pending.results || []) {
      retried++;
      try {
        await refundCharge(
          p.id,
          p.reason === 'duplicate'
            ? 'Duplicate payment for the same booking'
            : 'Payment received after the seat hold expired',
        );
        retryOk++;
        await db
          .prepare(
            "UPDATE orphan_payments SET resolved = 1, resolved_note = 'refunded by cron retry' WHERE id = ?",
          )
          .bind(p.id)
          .run();
        // Tell the user the refund actually happened, so the notice on their
        // booking stops saying it is still being processed.
        if (p.booking_id) {
          await db
            .prepare(
              "UPDATE bookings SET cancel_reason = 'late_refunded' WHERE id = ? AND cancel_reason = 'late_refund_pending'",
            )
            .bind(p.booking_id)
            .run();
        }
      } catch (e) {
        console.error('cron refund retry failed', p.id, e);
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: rows.results.length,
      expired,
      paid,
      cleaned,
      refunded,
      refundRetries: retried,
      refundRetryOk: retryOk,
    });
  } catch (error) {
    console.error('Cron expire-holds error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
