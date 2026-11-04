import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { WorkshopMaster } from '@/lib/types';
import { insertMaster, type MasterBody } from '@/lib/master-write';

/** GET /api/workshop-masters — list all masters (public read; used by the
 *  admin list + the session form's master dropdown). */
export async function GET() {
  try {
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT m.*, u.name AS organizer_name
         FROM workshop_masters m LEFT JOIN users u ON m.organizer = u.id
         ORDER BY m.created_at DESC`
      )
      .all<WorkshopMaster>();
    return NextResponse.json({ masters: rows.results || [] });
  } catch (error) {
    console.error('List masters error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

 /** POST /api/workshop-masters — admin creates a master. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as MasterBody;
    const db = await getDB();
    const id = uuid();
    const r = await insertMaster(db, id, body);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Create master error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
