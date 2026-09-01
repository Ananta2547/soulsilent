import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/teacher/reviews — reviews left on the workshops this teacher leads.
//
// Read-only on purpose. /api/reviews exists, but it returns every review on the
// platform and lets an admin write and delete them; a teacher may read what was
// said about their own workshops and nothing more.
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (u.role !== 'teacher' && u.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }

  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.featured, r.created_at,
              us.name AS user_name,
              w.id AS workshop_id, w.title AS workshop_title
         FROM reviews r
         JOIN workshops w ON w.id = r.workshop_id
         LEFT JOIN users us ON us.id = r.user_id
        WHERE (w.instructor_id = ?
               OR EXISTS (
                    SELECT 1 FROM json_each(COALESCE(w.dashboard_access_json, '[]'))
                     WHERE json_each.value = ?
                  ))
        ORDER BY r.created_at DESC`,
    )
    .bind(u.sub, u.sub)
    .all();

  const reviews = rows.results || [];
  return NextResponse.json({ reviews, total: reviews.length });
}
