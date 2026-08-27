import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { expireCheckoutSession } from '@/lib/stripe';
import { disablePaymentLink } from '@/lib/beam';
import type { Booking } from '@/lib/types';

/**
 * Expire an unpaid booking whose 10-minute payment hold has lapsed, closing any
 * hosted checkout it has and marking the booking EXPIRED.
 *
 * NOTE — this no longer kills the PromptPay QR. Since migration 048 the QR is a
 * Charges API charge of ours, and Beam offers no way to cancel a pending one:
 * cancel, void, expire and disable all answer 404, and every QR lives a fixed 30
 * minutes. So a saved QR stays scannable for another 20 minutes after the seat
 * is released, and money that arrives then is refunded by the webhook + cron
 * path rather than blocked here. What is closed here is the card lane's payment
 * link (and, for holds still in flight from before the switchover, the Stripe
 * session, which does void its PaymentIntent).
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

    // Kill the QR by closing the checkout. Which gateway to talk to is decided
    // by whichever id the row carries: Beam for anything booked since the
    // switchover, Stripe for holds still in flight from before it. If the
    // gateway reports the user paid in the race just before this, confirm the
    // booking instead of cancelling it.
    const linkId = booking.beam_payment_link_id || booking.stripe_session_id;
    if (linkId) {
      try {
        const { paid } = booking.beam_payment_link_id
          ? await disablePaymentLink(booking.beam_payment_link_id)
          : await expireCheckoutSession(linkId);
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
