import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { expireCheckoutSession } from '@/lib/stripe';
import type { Booking } from '@/lib/types';

/**
 * Expire an unpaid booking whose 10-minute payment hold has lapsed. Cancels the
 * Stripe Checkout Session (which voids its PaymentIntent, so the PromptPay QR
 * the user may have saved stops working) and marks the booking EXPIRED.
 *
 * Called by the front-end countdown when it reaches 0, and by the cron sweep.
 * Idempotent: a paid/already-cancelled booking is a no-op.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = await getDB();

    const booking = await db
      .prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?')
      .bind(id, user.sub)
      .first<Booking>();
    if (!booking) {
      return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
    }

    // Already settled → nothing to do.
    if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
      return NextResponse.json({ ok: true, paid: true });
    }
    if (booking.status === 'cancelled') {
      return NextResponse.json({ ok: true, expired: true });
    }

    // Guard: only expire once the hold has actually lapsed (2s skew for clock
    // drift). Prevents a client from voiding a still-live QR early.
    if (booking.expires_at) {
      const remaining = new Date(booking.expires_at.replace(' ', 'T') + 'Z').getTime() - Date.now();
      if (remaining > 2000) {
        return NextResponse.json({ ok: false, notYet: true, expiresAt: booking.expires_at });
      }
    }

    // Kill the QR by expiring the checkout session. If Stripe reports the user
    // paid in the race just before this, confirm the booking instead.
    if (booking.stripe_session_id) {
      try {
        const { paid } = await expireCheckoutSession(booking.stripe_session_id);
        if (paid) {
          await db
            .prepare("UPDATE bookings SET status='confirmed', payment_status='paid', expires_at=NULL WHERE id = ?")
            .bind(id)
            .run();
          return NextResponse.json({ ok: true, paid: true });
        }
      } catch (e) {
        // Session may be gone/already expired — proceed to mark the booking.
        console.error('expireCheckoutSession failed', e);
      }
    }

    await db
      .prepare(
        "UPDATE bookings SET status='cancelled', payment_status='expired', expires_at=NULL, cancel_reason='payment_timeout' WHERE id = ?"
      )
      .bind(id)
      .run();

    return NextResponse.json({ ok: true, expired: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Expire booking error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
