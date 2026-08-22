import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { sqliteToMs } from '@/lib/datetime';
import { requireAuth } from '@/lib/auth';
import { fetchCheckoutSession, refundPaymentIntent } from '@/lib/stripe';
import { fetchPaymentLink } from '@/lib/beam';

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
    const { session_id, booking_id } = (await request.json()) as {
      session_id?: string;
      booking_id?: string;
    };

    // Beam path. Beam has no {SESSION_ID} placeholder, so the redirect carries
    // the booking id and the link id is read back from the row.
    if (booking_id) {
      return await verifyBeamBooking(booking_id, user.sub);
    }

    if (!session_id) {
      return NextResponse.json({ error: 'missing session_id or booking_id' }, { status: 400 });
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

/**
 * Verify a Beam booking after the shopper is redirected back.
 *
 * Ownership is checked against the booking row (Beam carries no metadata of
 * ours beyond `referenceId`), then the payment link's live status decides the
 * outcome. A late payment is NOT refunded here: the refund needs a charge id,
 * which only arrives with the `charge.succeeded` webhook, so that path owns it.
 */
async function verifyBeamBooking(bookingId: string, userId: string) {
  const db = await getDB();
  const booking = await db
    .prepare(
      'SELECT user_id, status, payment_status, expires_at, beam_payment_link_id FROM bookings WHERE id = ?',
    )
    .bind(bookingId)
    .first<{
      user_id: string | null;
      status: string;
      payment_status: string;
      expires_at: string | null;
      beam_payment_link_id: string | null;
    }>();

  if (!booking) {
    return NextResponse.json({ ok: false, error: 'booking not found' }, { status: 404 });
  }
  // Defence in depth: only the user who created the booking can verify it.
  if (booking.user_id !== userId) {
    return NextResponse.json({ error: 'booking does not belong to you' }, { status: 403 });
  }
  if (!booking.beam_payment_link_id) {
    return NextResponse.json({ ok: false, error: 'no payment link on this booking' }, { status: 400 });
  }

  const link = await fetchPaymentLink(booking.beam_payment_link_id);
  if (!link.paid) {
    return NextResponse.json({
      ok: false,
      payment_status: link.status,
      message: 'Payment not completed yet',
    });
  }

  // Paid, but the hold already lapsed and the seat went back to the pool.
  //
  // `expires_at` decides, not the status flags: the sweep that sets them runs
  // lazily on reads and on a cron a minute apart, so a row can still read
  // "pending" well after its deadline. Going by the flags alone handed a seat
  // to a payment that arrived too late.
  const holdMs = booking.expires_at ? sqliteToMs(booking.expires_at) : NaN;
  const lapsed =
    booking.status === 'cancelled' ||
    booking.payment_status === 'expired' ||
    (Number.isFinite(holdMs) && holdMs <= Date.now());

  if (lapsed) {
    // Close it here too — the webhook refunds off this same state, and a row
    // still reading "pending" is a seat waiting to be handed out by mistake.
    if (booking.status !== 'cancelled') {
      await db
        .prepare(
          "UPDATE bookings SET status='cancelled', payment_status='expired', expires_at=NULL, cancel_reason=COALESCE(cancel_reason,'payment_timeout') WHERE id = ?",
        )
        .bind(bookingId)
        .run();
    }
    return NextResponse.json({
      ok: false,
      expired: true,
      message: 'หมดเวลาชำระเงิน ระบบจะคืนเงินให้อัตโนมัติ',
    });
  }

  await db
    .prepare("UPDATE bookings SET status = 'confirmed', payment_status = 'paid' WHERE id = ?")
    .bind(bookingId)
    .run();
  return NextResponse.json({ ok: true, type: 'workshop', booking_id: bookingId });
}
