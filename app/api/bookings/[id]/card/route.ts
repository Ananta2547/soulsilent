import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { sqliteToMs } from '@/lib/datetime';
import { requireAuth } from '@/lib/auth';
import { createWorkshopCheckout, reusableCheckoutUrl, BeamError } from '@/lib/beam';
import type { Workshop, Booking } from '@/lib/types';

/**
 * POST /api/bookings/{id}/card — a hosted Beam checkout for the card lane.
 *
 * PromptPay is served as a QR from our own page (see /api/bookings/{id}/qr).
 * Cards cannot be: Beam offers no hosted card element, only a raw
 * POST /client/v1/card-tokens, so collecting the number ourselves would mean
 * building the form, handling 3DS and taking on PCI scope. The hosted link does
 * all of that — with `qrPromptPay` disabled, so it cannot mint a second QR for
 * a booking that already has one.
 *
 * Created lazily, only when the user actually asks for the card lane, so the
 * common PromptPay path never touches the Payment Links API at all.
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
    if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
      return NextResponse.json({ error: 'คุณชำระเงินไปแล้ว' }, { status: 400 });
    }

    // `expires_at` decides, not the status flags — those are set by a lazy sweep
    // and a cron a minute apart, so a row can read "pending" past its deadline.
    const holdMs = booking.expires_at ? sqliteToMs(booking.expires_at) : NaN;
    if (
      booking.status === 'cancelled' ||
      booking.payment_status === 'expired' ||
      (Number.isFinite(holdMs) && holdMs <= Date.now())
    ) {
      return NextResponse.json({ error: 'หมดเวลาชำระเงินแล้ว' }, { status: 400 });
    }
    // Same guard as the QR route: no hold means not payable yet (a selection
    // application awaiting its announcement).
    if (!booking.expires_at) {
      return NextResponse.json({ error: 'ยังไม่สามารถชำระเงินได้' }, { status: 400 });
    }

    const amount = booking.amount || 0;
    if (amount <= 0) {
      return NextResponse.json({ error: 'ไม่มียอดที่ต้องชำระ' }, { status: 400 });
    }

    // Same link every time while it is payable. Minting one per click would put
    // several live checkouts on one seat, which is the mistake the QR side was
    // built to avoid.
    const reuse = await reusableCheckoutUrl(booking.beam_payment_link_id);
    if (reuse) {
      return NextResponse.json({ checkoutUrl: reuse, amount, reused: true });
    }

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(booking.workshop_id)
      .first<Workshop>();
    if (!workshop || workshop.status !== 'active') {
      return NextResponse.json({ error: 'Workshop นี้ไม่เปิดรับแล้ว' }, { status: 400 });
    }

    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';

    // The link must die with the seat, not on the default window: an hour-long
    // checkout over a hold with four minutes left is exactly the gap where
    // someone pays for a seat that has already gone back to the pool.
    const remainingMinutes = Number.isFinite(holdMs)
      ? Math.max(1, Math.ceil((holdMs - Date.now()) / 60000))
      : 1;

    const { url: checkoutUrl, sessionId } = await createWorkshopCheckout({
      workshopTitle: workshop.title,
      amount,
      bookingId: id,
      userId: user.sub,
      // Beam has no {SESSION_ID} placeholder, so the redirect carries the
      // booking id and /api/payments/verify reads the link id off the row.
      successUrl: `${siteUrl}/me/bookings?paid=1&booking=${id}`,
      cancelUrl: `${siteUrl}/pay/${id}`,
      holdMinutes: remainingMinutes,
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
      console.error('Card checkout: Beam unavailable', error.status);
      return NextResponse.json(
        { error: 'ระบบชำระเงินขัดข้องชั่วคราว กรุณากดอีกครั้ง', retryable: true },
        { status: 503 },
      );
    }
    console.error('Card checkout error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
