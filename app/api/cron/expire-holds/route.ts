import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { expireCheckoutSession, fetchCheckoutSession, refundPaymentIntent } from '@/lib/stripe';

/**
 * Sweep unpaid bookings whose 10-minute hold has lapsed and expire their Stripe
 * Checkout Sessions — voiding the PromptPay QR even for users who closed the
 * tab (so a saved QR fails when scanned) — then mark the bookings EXPIRED.
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
        `SELECT id, stripe_session_id FROM bookings
         WHERE payment_status = 'pending'
           AND status != 'cancelled'
           AND expires_at IS NOT NULL
           AND datetime(expires_at) <= datetime('now')
         LIMIT 100`
      )
      .all<{ id: string; stripe_session_id: string | null }>();

    let expired = 0;
    let paid = 0;
    for (const b of rows.results) {
      let becamePaid = false;
      if (b.stripe_session_id) {
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
        `SELECT stripe_session_id AS sid FROM bookings
         WHERE payment_status = 'expired'
           AND stripe_session_id IS NOT NULL
           AND datetime(created_at) >= datetime('now', '${staleWindow}')
         LIMIT 50`
      )
      .all<{ sid: string }>();
    let cleaned = 0;
    let refunded = 0;
    for (const r of stale.results) {
      try {
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
      } catch (e) {
        console.error('cron retroactive cleanup failed', r.sid, e);
      }
    }

    return NextResponse.json({ ok: true, scanned: rows.results.length, expired, paid, cleaned, refunded });
  } catch (error) {
    console.error('Cron expire-holds error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
