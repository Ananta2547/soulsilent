import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { ageFromDob, partyFromBooking, type TicketTransfer } from '@/lib/transfers';
import { hasWorkshopStarted } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/**
 * POST /api/transfers/{token}/claim — the receiver takes the seat.
 *
 * The seat does not move table: the booking keeps its payment, its amount and
 * its place in the workshop's count, and only changes hands. What the receiver
 * adds is the application, which is theirs and not the sender's.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireAuth();
    const { token } = await params;
    const { application } = (await request.json()) as { application?: unknown };
    const db = await getDB();

    const tr = await db
      .prepare('SELECT * FROM ticket_transfers WHERE token = ?')
      .bind(token)
      .first<TicketTransfer>();
    if (!tr) return NextResponse.json({ error: 'ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว' }, { status: 404 });
    if (tr.status === 'claimed') {
      return NextResponse.json({ error: 'ลิงก์นี้ถูกใช้รับสิทธิ์ไปแล้ว' }, { status: 400 });
    }
    if (tr.status !== 'pending') {
      return NextResponse.json({ error: 'ลิงก์นี้ถูกยกเลิกแล้ว' }, { status: 400 });
    }
    if (tr.from_user_id === user.sub) {
      return NextResponse.json({ error: 'คุณเป็นผู้ส่งสิทธิ์นี้เอง' }, { status: 400 });
    }

    const booking = await db
      .prepare('SELECT id, user_id, workshop_id, status, payment_status FROM bookings WHERE id = ?')
      .bind(tr.booking_id)
      .first<{ id: string; user_id: string; workshop_id: string; status: string; payment_status: string }>();
    const secured =
      !!booking &&
      booking.status !== 'cancelled' &&
      (booking.payment_status === 'paid' || booking.status === 'confirmed');
    if (!booking || !secured) {
      return NextResponse.json({ error: 'ที่นั่งนี้ยังไม่ได้ชำระเงิน จึงยังรับสิทธิ์ไม่ได้' }, { status: 400 });
    }

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(tr.workshop_id)
      .first<Workshop>();
    if (!workshop || workshop.status !== 'active') {
      return NextResponse.json({ error: 'กิจกรรมนี้ไม่เปิดรับแล้ว' }, { status: 400 });
    }
    if (hasWorkshopStarted(workshop)) {
      return NextResponse.json({ error: 'กิจกรรมเริ่มแล้ว ไม่สามารถรับสิทธิ์ได้' }, { status: 400 });
    }

    // One person, one seat: taking this one on top of a seat they already hold
    // would leave them booked twice on the same day.
    const own = await db
      .prepare(
        `SELECT id FROM bookings
          WHERE workshop_id = ? AND user_id = ? AND status != 'cancelled' AND id != ?
          LIMIT 1`,
      )
      .bind(tr.workshop_id, user.sub, booking.id)
      .first<{ id: string }>();
    if (own) {
      return NextResponse.json({ error: 'คุณมีที่นั่งของกิจกรรมนี้อยู่แล้ว' }, { status: 400 });
    }

    const account = await db
      .prepare('SELECT name, phone, vault_json, date_of_birth FROM users WHERE id = ?')
      .bind(user.sub)
      .first<{
        name: string | null;
        phone: string | null;
        vault_json: string | null;
        date_of_birth: string | null;
      }>();

    // The age limit follows the seat, so it is checked against whoever ends up
    // sitting in it — here, the receiver.
    if (workshop.min_age != null || workshop.max_age != null) {
      let dob: string | null = account?.date_of_birth ?? null;
      try {
        const v = account?.vault_json ? (JSON.parse(account.vault_json) as { dob?: string }) : null;
        if (v?.dob) dob = v.dob;
      } catch {
        /* keep the legacy column */
      }
      const age = ageFromDob(dob);
      if (age == null) {
        return NextResponse.json({ error: 'กรุณาระบุวันเกิดในโปรไฟล์ก่อนรับสิทธิ์' }, { status: 400 });
      }
      if (workshop.min_age != null && age < workshop.min_age) {
        return NextResponse.json(
          { error: `กิจกรรมนี้จำกัดอายุผู้เข้าร่วมสำหรับผู้ที่มีอายุ ${workshop.min_age} ปีขึ้นไปเท่านั้น` },
          { status: 400 },
        );
      }
      if (workshop.max_age != null && age > workshop.max_age) {
        return NextResponse.json(
          { error: `กิจกรรมนี้จำกัดอายุผู้เข้าร่วมไม่เกิน ${workshop.max_age} ปี` },
          { status: 400 },
        );
      }
    }

    const applicationJson = application != null ? JSON.stringify(application) : null;
    const to = partyFromBooking(applicationJson, account || {});

    // The seat changes hands. `facilitator_note` is staff's note about the
    // previous holder, and attendance belongs to whoever actually shows up, so
    // both are cleared with the handover.
    await db
      .prepare(
        `UPDATE bookings
            SET user_id = ?, application_json = COALESCE(?, application_json),
                facilitator_note = NULL, attended = NULL, attendance_json = NULL
          WHERE id = ?`,
      )
      .bind(user.sub, applicationJson, booking.id)
      .run();

    await db
      .prepare(
        `UPDATE ticket_transfers
            SET status = 'claimed', to_user_id = ?, to_name = COALESCE(?, to_name),
                to_phone = COALESCE(?, to_phone), claimed_at = datetime('now')
          WHERE id = ? AND status = 'pending'`,
      )
      .bind(user.sub, to.name, to.phone, tr.id)
      .run();

    return NextResponse.json({ claimed: true, bookingId: booking.id, workshopId: tr.workshop_id });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Claim transfer error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
