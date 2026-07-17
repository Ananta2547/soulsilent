import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { expireStaleHolds } from '@/lib/holds';
import type { ImageMeta, WorkshopMaster } from '@/lib/types';

/** Seats counted as taken (paid + live holds); mirrors bookings route. */
const SEAT_TAKEN = `
  status != 'cancelled' AND (
    payment_status = 'paid' OR status = 'confirmed'
    OR (payment_status = 'pending' AND expires_at IS NOT NULL AND datetime(expires_at) > datetime('now'))
  )`;

/** GET /api/workshop-masters/[id] — master overview + its upcoming sessions. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    await expireStaleHolds(db);

    const master = await db
      .prepare(
        `SELECT m.*, u.name AS organizer_name
         FROM workshop_masters m LEFT JOIN users u ON m.organizer = u.id
         WHERE m.id = ?`
      )
      .bind(id)
      .first<WorkshopMaster>();
    if (!master) {
      return NextResponse.json({ error: 'ไม่พบข้อมูล Workshop' }, { status: 404 });
    }

    const sessions = await db
      .prepare(
        `SELECT w.*, (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND ${SEAT_TAKEN}) AS booked
         FROM workshops w
         WHERE w.master_id = ? AND w.status = 'active' AND w.date >= date('now')
         ORDER BY w.date ASC`
      )
      .bind(id)
      .all();

    return NextResponse.json({ master, sessions: sessions.results || [] });
  } catch (error) {
    console.error('Get master error:', error);
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

/** PUT /api/workshop-masters/[id] — admin updates a master. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Body;
    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อกิจกรรม' }, { status: 400 });
    }
    const db = await getDB();
    await db
      .prepare(
        `UPDATE workshop_masters SET
           title = ?, description = ?, organizer = ?, cover_image_url = ?, cover_image_meta = ?,
           target_json = ?, takeaways_json = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(
        body.title.trim(),
        body.description || null,
        body.organizer || null,
        body.cover_image_url || null,
        body.cover_image_meta ? JSON.stringify(body.cover_image_meta) : null,
        JSON.stringify((body.target || []).filter((s) => s.trim())),
        JSON.stringify((body.takeaways || []).filter((s) => s.trim())),
        id
      )
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Update master error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** DELETE /api/workshop-masters/[id] — admin removes a master (sessions keep
 *  running; their master_id is cleared). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    await db.prepare('UPDATE workshops SET master_id = NULL WHERE master_id = ?').bind(id).run();
    await db.prepare('DELETE FROM workshop_masters WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
