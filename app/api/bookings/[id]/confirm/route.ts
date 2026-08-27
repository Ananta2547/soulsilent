import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { HOLD_MINUTES } from '@/lib/holds';
import { getEffectivePrice } from '@/lib/workshop-utils';
import { visibleAppStatus, confirmDeadlineFor } from '@/lib/selection';
import type { Workshop, Booking } from '@/lib/types';



/**
 * A selected (approved) user confirms their seat. For free workshops this
 * finalizes the booking; for deposit/paid it sets the confirmation and returns
 * our payment page so the user can pay within the round deadline.
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

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(booking.workshop_id)
      .first<Workshop>();
    if (!workshop) {
      return NextResponse.json({ error: 'ไม่พบ Workshop' }, { status: 404 });
    }

    // Only an announced, approved selection seat can be confirmed.
    if (workshop.admission_type !== 'selection') {
      return NextResponse.json({ error: 'การจองนี้ไม่ต้องยืนยันสิทธิ์' }, { status: 400 });
    }
    if (visibleAppStatus(workshop, booking.app_status) !== 'approved') {
      return NextResponse.json({ error: 'ยังไม่สามารถยืนยันสิทธิ์ได้' }, { status: 400 });
    }
    if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
      return NextResponse.json({ error: 'คุณยืนยันสิทธิ์ไปแล้ว' }, { status: 400 });
    }

    // Enforce the round deadline.
    const deadline = confirmDeadlineFor(workshop, booking);
    if (deadline && Date.now() > new Date(deadline).getTime()) {
      return NextResponse.json({ error: 'หมดเวลายืนยันสิทธิ์แล้ว' }, { status: 400 });
    }

    const paymentType = workshop.payment_type || 'paid';

    // FREE → finalize immediately.
    if (paymentType === 'free') {
      await db
        .prepare(
          "UPDATE bookings SET confirmed_at = datetime('now'), status='confirmed', payment_status='paid', amount=0, expires_at=NULL WHERE id = ?"
        )
        .bind(id)
        .run();
      return NextResponse.json({ confirmed: true, mode: 'free' });
    }

    // DEPOSIT / PAID → record confirmation, hold the seat, send to checkout.
    const fullPrice = getEffectivePrice(workshop).price;
    const amount = paymentType === 'deposit' ? workshop.deposit_amount || 0 : fullPrice;
    await db
      .prepare(
        "UPDATE bookings SET confirmed_at = datetime('now'), amount = ?, expires_at = datetime('now', ?) WHERE id = ?"
      )
      .bind(amount, `+${HOLD_MINUTES} minutes`, id)
      .run();

    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';
    // Our own payment page, which serves this booking's single stored QR and
    // mints it on first open. Beam's hosted page cannot be used for PromptPay:
    // it issues a new QR on every switch of payment method and leaves them all
    // payable, so one seat could be paid for more than once.
    return NextResponse.json({
      confirmed: true,
      mode: paymentType,
      checkoutUrl: `${siteUrl}/pay/${id}`,
      amount,
    });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Confirm booking error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
