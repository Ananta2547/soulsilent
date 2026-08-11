import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { expireCheckoutSession } from '@/lib/stripe';

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

    return NextResponse.json({ ok: true, scanned: rows.results.length, expired, paid });
  } catch (error) {
    console.error('Cron expire-holds error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
