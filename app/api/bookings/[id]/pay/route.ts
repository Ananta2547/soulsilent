import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createWorkshopCheckout, reusableCheckoutUrl, BeamError } from '@/lib/beam';
import type { Workshop, Booking } from '@/lib/types';

/**
 * Resume payment for an existing unpaid booking — used when the user submitted
 * the application but abandoned the Stripe checkout. Re-checks availability,
 * refreshes the seat hold, and returns a fresh checkout URL.
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
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'การจองนี้ถูกยกเลิกแล้ว' }, { status: 400 });
    }
    if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
      return NextResponse.json({ error: 'คุณชำระเงินไปแล้ว' }, { status: 400 });
    }
    // 10-min window elapsed → auto-cancel and refuse. (Self-heals if a GET
    // hasn't run the sweep yet.)
    if (booking.expires_at && new Date(booking.expires_at).getTime() <= Date.now()) {
      await db.prepare("UPDATE bookings SET status='cancelled' WHERE id = ?").bind(id).run();
      return NextResponse.json({ error: 'หมดเวลาชำระเงินแล้ว การจองถูกยกเลิก' }, { status: 400 });
    }

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(booking.workshop_id)
      .first<Workshop>();
    if (!workshop || workshop.status !== 'active') {
      return NextResponse.json({ error: 'Workshop นี้ไม่เปิดรับแล้ว' }, { status: 400 });
    }

    // Selection apps can only pay after being approved AND confirming their seat.
    if (workshop.admission_type === 'selection' && !booking.confirmed_at) {
      return NextResponse.json({ error: 'ยังไม่สามารถชำระเงินได้' }, { status: 400 });
    }

    // Capacity: count seats taken by OTHER bookings (paid or still-live holds).
    const taken = await db
      .prepare(
        `SELECT COUNT(*) as count FROM bookings
         WHERE workshop_id = ? AND id != ? AND status != 'cancelled' AND (
           payment_status = 'paid'
           OR status = 'confirmed'
           OR (payment_status = 'pending' AND expires_at IS NOT NULL AND datetime(expires_at) > datetime('now'))
         )`
      )
      .bind(booking.workshop_id, id)
      .first<{ count: number }>();
    if ((taken?.count || 0) >= workshop.max_participants) {
      return NextResponse.json({ error: 'ที่นั่งเต็มแล้ว' }, { status: 400 });
    }

    const amount = booking.amount || 0;
    if (amount <= 0) {
      // Nothing to pay (e.g. free) → just finalize.
      await db
        .prepare("UPDATE bookings SET status='confirmed', payment_status='paid', expires_at=NULL WHERE id = ?")
        .bind(id)
        .run();
      return NextResponse.json({ paid: true });
    }

    // Keep the original deadline (do not extend) — the auto-cancel window is
    // fixed at submit/confirm. The new link must expire WITH the seat rather
    // than on the default full window: an hour-long link over a hold with 20
    // minutes left is exactly the gap where someone pays for a released seat.
    const remainingMs = booking.expires_at
      ? new Date(booking.expires_at.replace(' ', 'T') + 'Z').getTime() - Date.now()
      : 0;
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';

    // Reuse the link this booking already has, if it is still payable.
    //
    // Minting a new one on every visit is how a booking ended up with two live
    // QR codes: the user opens checkout, goes back, opens it again, and the
    // first QR stays valid while the booking only remembers the second. Pay the
    // first, and the purchase-shaped webhook — which carries no referenceId —
    // cannot find the booking from a link id we no longer store, so the money
    // arrives and nothing updates.
    //
    // Handing back the same link keeps one QR per booking, so whichever image
    // the user kept is the one we know about.
    const reuse = await reusableCheckoutUrl(booking.beam_payment_link_id);
    if (reuse) {
      return NextResponse.json({ checkoutUrl: reuse, amount, reused: true });
    }

    const { url: checkoutUrl, sessionId } = await createWorkshopCheckout({
      holdMinutes: remainingMinutes,
      workshopTitle: workshop.title,
      amount,
      bookingId: id,
      userId: user.sub,
      // Beam has no {SESSION_ID} placeholder like Stripe, so carry the booking
      // id instead — /api/payments/verify looks the link id up from the row.
      successUrl: `${siteUrl}/me/bookings?paid=1&booking=${id}`,
      cancelUrl: `${siteUrl}/me/bookings`,
    });
    await db
      .prepare('UPDATE bookings SET beam_payment_link_id = ? WHERE id = ?')
      .bind(sessionId, id)
      .run();

    return NextResponse.json({ checkoutUrl, amount });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    if (error instanceof BeamError && error.retryable) {
      console.error('Resume payment: Beam unavailable', error.status);
      return NextResponse.json(
        { error: 'ระบบชำระเงินขัดข้องชั่วคราว กรุณากดอีกครั้ง', retryable: true },
        { status: 503 },
      );
    }
    console.error('Resume payment error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
