import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasWorkshopEnded, canAccessTeacherDashboard } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

// PUT /api/teacher/bookings/[id] — per-day check-in by the owning teacher.
// Body: { dayIndex: number, value: 1 | 0 | null } (present / absent / unmarked).
// Locked once the event ends.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (u.role !== 'teacher' && u.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as { dayIndex?: number; value?: number | null };
  const dayIndex = Number(body.dayIndex);
  if (!Number.isInteger(dayIndex) || dayIndex < 0) {
    return NextResponse.json({ error: 'dayIndex ไม่ถูกต้อง' }, { status: 400 });
  }

  const db = await getDB();
  const row = await db
    .prepare(
      `SELECT b.attendance_json AS attendance_json,
              w.id AS w_id, w.instructor_id AS instructor_id,
              w.instructor_ids_json AS instructor_ids_json,
              w.dashboard_access_json AS dashboard_access_json,
              w.workshop_type AS workshop_type,
              w.date AS date, w.end_date AS end_date, w.dates_json AS dates_json, w.time_end AS time_end
         FROM bookings b JOIN workshops w ON b.workshop_id = w.id
        WHERE b.id = ?`,
    )
    .bind(id)
    .first<
      { attendance_json: string | null } & Pick<
        Workshop,
        | 'instructor_id'
        | 'instructor_ids_json'
        | 'dashboard_access_json'
        | 'workshop_type'
        | 'date'
        | 'end_date'
        | 'dates_json'
        | 'time_end'
      >
    >();

  if (!row) return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
  // Owner, or a co-facilitator the admin ticked (migration 046) — otherwise a
  // co-facilitator could open the roster but not check anyone in.
  if (u.role !== 'admin' && !canAccessTeacherDashboard(row, u.sub)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }
  if (hasWorkshopEnded(row)) {
    return NextResponse.json({ error: 'กิจกรรมจบแล้ว — ปิดการเช็คชื่อ' }, { status: 409 });
  }

  let map: Record<string, number> = {};
  try {
    map = row.attendance_json ? (JSON.parse(row.attendance_json) as Record<string, number>) : {};
  } catch {
    map = {};
  }
  if (body.value === 1) map[String(dayIndex)] = 1;
  else if (body.value === 0) map[String(dayIndex)] = 0;
  else delete map[String(dayIndex)];
  const anyPresent = Object.values(map).some((v) => v === 1) ? 1 : 0;

  await db
    .prepare('UPDATE bookings SET attendance_json = ?, attended = ? WHERE id = ?')
    .bind(JSON.stringify(map), anyPresent, id)
    .run();

  return NextResponse.json({ ok: true, attendance: map });
}
