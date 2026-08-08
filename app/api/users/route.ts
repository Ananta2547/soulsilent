import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const db = await getDB();
    const url = new URL(request.url);
    // `role` may be a single role or a comma-separated list (e.g. "teacher,admin").
    const roles = (url.searchParams.get('role') || '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const baseQuery =
      'SELECT id, email, name, nickname, role, avatar_url, account_status, deleted_at, is_team, created_at, updated_at FROM users';

    // `q` = typeahead search by name or email (used by the attendance
    // "add participant" picker). Case-insensitive substring, capped at 20.
    const q = (url.searchParams.get('q') || '').trim();
    let stmt;
    if (q) {
      const like = `%${q}%`;
      stmt = roles.length
        ? db
            .prepare(
              `${baseQuery} WHERE role IN (${roles.map(() => '?').join(',')}) AND (name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 20`,
            )
            .bind(...roles, like, like)
        : db.prepare(`${baseQuery} WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT 20`).bind(like, like);
    } else {
      stmt = roles.length
        ? db
            .prepare(`${baseQuery} WHERE role IN (${roles.map(() => '?').join(',')}) ORDER BY name`)
            .bind(...roles)
        : db.prepare(`${baseQuery} ORDER BY created_at DESC`);
    }

    const result = await stmt.all();
    return NextResponse.json({ users: result.results });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
