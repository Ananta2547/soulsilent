import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
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
      return NextResponse.json({ error: 'กิจกรรมนี้ไม่เปิดรับแล้ว' }, { status: 400 });
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

    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';

    // Back to OUR payment page, which serves the booking's single stored QR.
    // Sending them to Beam's hosted page instead is what let one booking collect
    // several live QR images: every flip of the payment method there mints
    // another, and all of them stay payable.
    return NextResponse.json({ checkoutUrl: `${siteUrl}/pay/${id}`, amount });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Resume payment error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
