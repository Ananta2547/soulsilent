import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { ageFromDob } from '@/lib/transfers';
import { loadInvite } from '@/lib/invites';
import { hasWorkshopStarted } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/**
 * POST /api/invites/{token}/claim — a friend takes one of the group's seats.
 *
 * The seats were paid for on the parent booking, so the member gets a row of
 * their own with nothing owed (amount 0, confirmed) that points back at the
 * parent. That row is what check-in, the roster and My Journey see. The
 * parent keeps counting the seats; the member row counts none.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireAuth();
    const { token } = await params;
    const { application } = (await request.json()) as { application?: unknown };
    const db = await getDB();

    const parent = await loadInvite(db, token);
    if (!parent) return NextResponse.json({ error: 'ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว' }, { status: 404 });
    if (parent.status === 'cancelled') {
      return NextResponse.json({ error: 'การจองกลุ่มนี้ถูกยกเลิกแล้ว' }, { status: 400 });
    }
    const secured = parent.payment_status === 'paid' || parent.status === 'confirmed';
    if (!secured) {
      return NextResponse.json({ error: 'กลุ่มนี้ยังชำระเงินไม่สำเร็จ จึงยังรับสิทธิ์ไม่ได้' }, { status: 400 });
    }
    if (parent.user_id === user.sub) {
      return NextResponse.json({ error: 'คุณเป็นผู้จองกลุ่มนี้เอง ที่นั่งของคุณอยู่ในกลุ่มแล้ว' }, { status: 400 });
    }
    const slots = Math.max(0, (parent.group_size || 1) - 1);
    if (parent.claimed >= slots) {
      return NextResponse.json({ error: 'ลิงก์นี้ถูกใช้ครบตามจำนวนแล้ว' }, { status: 400 });
    }

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(parent.workshop_id)
      .first<Workshop>();
    if (!workshop || workshop.status !== 'active') {
      return NextResponse.json({ error: 'กิจกรรมนี้ไม่เปิดรับแล้ว' }, { status: 400 });
    }
    if (hasWorkshopStarted(workshop)) {
      return NextResponse.json({ error: 'กิจกรรมเริ่มแล้ว ไม่สามารถรับสิทธิ์ได้' }, { status: 400 });
    }

    // One person, one seat on the day.
    const own = await db
      .prepare(`SELECT id FROM bookings WHERE workshop_id = ? AND user_id = ? AND status != 'cancelled' LIMIT 1`)
      .bind(parent.workshop_id, user.sub)
      .first<{ id: string }>();
    if (own) {
      return NextResponse.json({ error: 'คุณมีที่นั่งของกิจกรรมนี้อยู่แล้ว' }, { status: 400 });
    }

    // The age limit follows the seat, so it is checked against whoever ends
    // up sitting in it — here, the friend.
    if (workshop.min_age != null || workshop.max_age != null) {
      const account = await db
        .prepare('SELECT vault_json, date_of_birth FROM users WHERE id = ?')
        .bind(user.sub)
        .first<{ vault_json: string | null; date_of_birth: string | null }>();
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
    const bookingId = uuid();
    // The quota is re-checked inside the insert so two friends racing for the
    // last seat cannot both get it.
    const res = await db
      .prepare(
        `INSERT INTO bookings (id, workshop_id, user_id, status, payment_status, amount, app_status,
                               application_json, booking_kind, booking_tier_label, parent_booking_id, expires_at)
         SELECT ?, ?, ?, 'confirmed', 'paid', 0, 'approved', ?, 'group', ?, ?, NULL
          WHERE (SELECT COUNT(*) FROM bookings m WHERE m.parent_booking_id = ? AND m.status != 'cancelled') < ?`,
      )
      .bind(bookingId, parent.workshop_id, user.sub, applicationJson, parent.booking_tier_label, parent.id, parent.id, slots)
      .run();
    if (!res.meta.changes) {
      return NextResponse.json({ error: 'ลิงก์นี้ถูกใช้ครบตามจำนวนแล้ว' }, { status: 400 });
    }

    return NextResponse.json({ claimed: true, bookingId, workshopId: parent.workshop_id });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Claim invite error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
