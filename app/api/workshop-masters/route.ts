import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { ImageMeta, WorkshopMaster } from '@/lib/types';

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

type Body = {
  title: string;
  description?: string;
  organizer?: string;
  cover_image_url?: string | null;
  cover_image_meta?: ImageMeta | null;
  target?: string[];
  takeaways?: string[];
};

/** POST /api/workshop-masters — admin creates a master. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Body;
    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อกิจกรรม' }, { status: 400 });
    }
    const db = await getDB();
    const id = uuid();
    await db
      .prepare(
        `INSERT INTO workshop_masters
          (id, title, description, organizer, cover_image_url, cover_image_meta, target_json, takeaways_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.title.trim(),
        body.description || null,
        body.organizer || null,
        body.cover_image_url || null,
        body.cover_image_meta ? JSON.stringify(body.cover_image_meta) : null,
        JSON.stringify((body.target || []).filter((s) => s.trim())),
        JSON.stringify((body.takeaways || []).filter((s) => s.trim()))
      )
      .run();
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
