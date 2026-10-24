import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

type Cat = { id: string; name: string; sort: number; active: number };

const fail = (error: unknown) => {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
};

/** GET — every expense category (hidden ones too, flagged by `active`). */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const rows = (await db.prepare('SELECT id, name, sort, active FROM expense_categories ORDER BY sort, name').all<Cat>()).results || [];
    return NextResponse.json({ items: rows });
  } catch (error) {
    return fail(error);
  }
}

/** POST { name } adds; { id, name?, active? } renames, hides or shows.
 *  Categories are never deleted — old ledger rows keep pointing at them. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { id?: string; name?: string; active?: boolean };
    const db = await getDB();
    const name = (body.name || '').trim().slice(0, 60);
    if (!body.id) {
      if (!name) return NextResponse.json({ error: 'ใส่ชื่อหมวด' }, { status: 400 });
      const max = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM expense_categories WHERE sort < 99').first<{ m: number }>();
      const id = crypto.randomUUID();
      await db.prepare('INSERT INTO expense_categories (id, name, sort) VALUES (?, ?, ?)').bind(id, name, (max?.m || 0) + 1).run();
      return NextResponse.json({ id });
    }
    const sets: string[] = [];
    const args: (string | number)[] = [];
    if (name) { sets.push('name = ?'); args.push(name); }
    if (typeof body.active === 'boolean') { sets.push('active = ?'); args.push(body.active ? 1 : 0); }
    if (!sets.length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    await db.prepare(`UPDATE expense_categories SET ${sets.join(', ')} WHERE id = ?`).bind(...args, body.id).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return fail(error);
  }
}
