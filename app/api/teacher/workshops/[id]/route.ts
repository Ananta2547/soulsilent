import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { computePayout, canAccessTeacherDashboard } from '@/lib/workshop-utils';
import { settleSelection } from '@/lib/selection';
import type { Workshop } from '@/lib/types';

// GET /api/teacher/workshops/[id] — workshop (owned), paid bookings with their
// application + per-day attendance, and the payout finance summary.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['teacher'])) {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDB();

  const workshop = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(id).first<Workshop>();
  if (!workshop) return NextResponse.json({ error: 'ไม่พบเวิร์กชอป' }, { status: 404 });
  // Owner, or a co-facilitator the admin ticked (migration 046).
  if (!u.roles.includes('admin') && !canAccessTeacherDashboard(workshop, u.sub)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  // Keep selection rounds current (view-only — teacher never edits decisions).
  if (workshop.admission_type === 'selection') {
    await settleSelection(db, workshop);
  }

  // For selection workshops, the teacher gets view-only access to ALL live
  // applications (not just paid). For direct workshops, only paid participants.
  const bookingsRes = await db
    .prepare(
      `SELECT b.id, b.user_id, b.amount, b.payment_status, b.status, b.attended,
              b.attendance_json, b.application_json, b.facilitator_note, b.created_at,
              b.app_status, b.waitlist_rank, b.confirmed_at,
              us.name AS user_name, us.email AS user_email,
              sn.nickname AS teacher_nickname
         FROM bookings b
         LEFT JOIN users us ON b.user_id = us.id
         LEFT JOIN student_nicknames sn ON sn.teacher_id = ? AND sn.student_id = b.user_id
        WHERE b.workshop_id = ?
          AND (
            b.payment_status = 'paid' OR b.status = 'confirmed'
            OR (? = 'selection' AND b.status != 'cancelled')
          )
        ORDER BY b.created_at ASC`,
    )
    .bind(workshop.instructor_id, id, workshop.admission_type || 'direct')
    .all();

  const bookings = bookingsRes.results || [];
  // Finance counts only money actually collected.
  const gross = bookings
    .filter((b) => {
      const r = b as { payment_status?: string; status?: string };
      return r.payment_status === 'paid' || r.status === 'confirmed';
    })
    .reduce((s, b) => s + (((b as { amount?: number }).amount) || 0), 0);
  const { deduction, net } = computePayout(gross, workshop.payout_deduction_type, workshop.payout_deduction_value);

  return NextResponse.json({ workshop, bookings, finance: { gross, deduction, net } });
}
