import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/** DELETE /api/teacher/sessions/[id] — cancel a round the teacher opened, as
 *  long as nobody holds a seat in it. With bookings it is the admin's call. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (u.role !== 'teacher' && u.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDB();
  const w = await db
    .prepare(
      `SELECT w.id, w.master_id, m.organizer,
              (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.status != 'cancelled') AS live
         FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id
        WHERE w.id = ?`
    )
    .bind(id)
    .first<{ id: string; master_id: string | null; organizer: string | null; live: number }>();
  if (!w || !w.master_id) return NextResponse.json({ error: 'ไม่พบรอบนี้' }, { status: 404 });
  if (u.role !== 'admin' && w.organizer !== u.sub) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }
  if (w.live > 0) {
    return NextResponse.json({ error: 'รอบนี้มีผู้จองแล้ว — ติดต่อ Admin เพื่อยกเลิก' }, { status: 409 });
  }
  await db.prepare("UPDATE workshops SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return NextResponse.json({ ok: true });
}
