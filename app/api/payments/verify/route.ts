import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { fetchCheckoutSession, refundPaymentIntent } from '@/lib/stripe';

/**
 * POST /api/payments/verify { session_id }
 *
 * Pulls the Checkout Session from Stripe and (if paid) marks the booking /
 * enrollment as `paid`. Idempotent — safe to call multiple times.
 *
 * This is the backup path for when the Stripe webhook never fires
 * (typical on local dev without `stripe listen --forward-to ...`).
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { session_id } = (await request.json()) as { session_id?: string };

    if (!session_id) {
      return NextResponse.json({ error: 'missing session_id' }, { status: 400 });
    }

    const session = await fetchCheckoutSession(session_id);

    // Defence in depth: only the user who created the booking can verify it.
    const metadata = (session.metadata || {}) as Record<string, string>;
    if (metadata.user_id && metadata.user_id !== user.sub) {
      return NextResponse.json({ error: 'session does not belong to you' }, { status: 403 });
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({
        ok: false,
        payment_status: session.payment_status,
        message: 'Payment not completed yet',
      });
    }

    const db = await getDB();
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (metadata.type === 'workshop' && metadata.booking_id) {
      const booking = await db
        .prepare('SELECT status, payment_status FROM bookings WHERE id = ?')
        .bind(metadata.booking_id)
        .first<{ status: string; payment_status: string }>();

      // Late payment: hold already expired and seat released → refund, keep cancelled.
      if (booking && (booking.status === 'cancelled' || booking.payment_status === 'expired')) {
        if (paymentIntentId) {
          try {
            await refundPaymentIntent(paymentIntentId);
          } catch (e) {
            console.error('Late-payment refund failed (verify)', e);
          }
        }
        return NextResponse.json({ ok: false, expired: true, message: 'หมดเวลาชำระเงิน ระบบได้คืนเงินให้แล้ว' });
      }

      await db
        .prepare(
          "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', stripe_payment_id = ? WHERE id = ?"
        )
        .bind(paymentIntentId, metadata.booking_id)
        .run();
      return NextResponse.json({ ok: true, type: 'workshop', booking_id: metadata.booking_id });
    }

    return NextResponse.json({ ok: false, error: 'unknown session type' }, { status: 400 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Verify payment error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
