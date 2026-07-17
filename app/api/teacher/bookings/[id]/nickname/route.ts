import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PUT /api/teacher/bookings/[id]/nickname — owning teacher sets a nickname for
// the booking's student. Stored per (workshop owner, student) so it follows the
// student into future bookings of that teacher. Body: { nickname }.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (u.role !== 'teacher' && u.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as { nickname?: string };
  const nickname = (body.nickname || '').trim() || null;

  const db = await getDB();
  const row = await db
    .prepare(
      `SELECT b.user_id AS student_id, w.instructor_id AS teacher_id
         FROM bookings b JOIN workshops w ON b.workshop_id = w.id
        WHERE b.id = ?`,
    )
    .bind(id)
    .first<{ student_id: string | null; teacher_id: string | null }>();

  if (!row || !row.student_id || !row.teacher_id) {
    return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
  }
  if (row.teacher_id !== u.sub && u.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }

  await db
    .prepare(
      `INSERT INTO student_nicknames (id, teacher_id, student_id, nickname, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(teacher_id, student_id)
       DO UPDATE SET nickname = excluded.nickname, updated_at = datetime('now')`,
    )
    .bind(uuid(), row.teacher_id, row.student_id, nickname)
    .run();

  return NextResponse.json({ ok: true, nickname });
}
