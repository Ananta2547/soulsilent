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

  // master_kind tells the roster page where "back" goes: a round belongs to
  // the session manager, a one-day workshop to its own list.
  const workshop = await db
    .prepare('SELECT w.*, m.kind AS master_kind FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id WHERE w.id = ?')
    .bind(id)
    .first<Workshop>();
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
              b.group_size, b.parent_booking_id, b.booking_tier_label,
              (SELECT COUNT(*) FROM bookings m WHERE m.parent_booking_id = b.id AND m.status != 'cancelled') AS group_claimed,
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

  // Members sit right after the booking that brought them, so a group reads
  // as one block on the roster.
  type R = { id: string; parent_booking_id?: string | null; created_at?: string };
  const raw = (bookingsRes.results || []) as R[];
  const parents = raw.filter((r) => !r.parent_booking_id);
  const members = raw.filter((r) => r.parent_booking_id);
  const bookings: R[] = [];
  for (const p of parents) {
    bookings.push(p, ...members.filter((m) => m.parent_booking_id === p.id));
  }
  // Orphans (parent cancelled or missing) still show, at the end.
  for (const m of members) if (!bookings.includes(m)) bookings.push(m);
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
