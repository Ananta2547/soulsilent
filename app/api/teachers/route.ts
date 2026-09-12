import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { roleSql } from '@/lib/roles';

/** GET /api/teachers — every active teacher (primary or extra role), with
 *  how many open rounds each has from today on. Public fields only. */
export async function GET() {
  try {
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT u.id, u.name, u.nickname, u.avatar_url, u.bio,
                (SELECT COUNT(*) FROM workshops w
                   LEFT JOIN workshop_masters m ON m.id = w.master_id
                  WHERE w.status = 'active' AND w.date >= date('now')
                    AND (w.instructor_id = u.id
                         OR EXISTS (SELECT 1 FROM json_each(COALESCE(w.instructor_ids_json, '[]')) WHERE json_each.value = u.id)
                         OR m.organizer = u.id)) AS upcoming
           FROM users u
          WHERE ${roleSql('u', 'teacher')}
            AND u.role != 'admin'
            AND (u.account_status IS NULL OR u.account_status = 'active')
          ORDER BY upcoming DESC, u.name ASC`
      )
      .all();
    return NextResponse.json({ teachers: rows.results || [] });
  } catch (error) {
    console.error('List teachers error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
