import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { cleanEvent, eventFromRow, type EventRow } from '@/lib/user-events';

/**
 * /api/me/events — the signed-in user's own calendar entries (ลงกิจกรรม).
 * Private: every query is scoped to the caller.
 *   GET              → { events }
 *   POST   body      → create, returns { event }
 *   PUT    ?id= body → replace, returns { event }
 *   DELETE ?id=      → remove
 */

const MAX_EVENTS = 2000;
const COLS = 'id, title, start_day, end_day, all_day, time_start, time_end, kind, note';

function fail(e: unknown) {
  if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  console.error('Events error:', e);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}

export async function GET() {
  try {
    const user = await requireAuth();
    const db = await getDB();
    const res = await db.prepare(`SELECT ${COLS} FROM user_events WHERE user_id = ? ORDER BY start_day ASC, time_start ASC`).bind(user.sub).all<EventRow>();
    return NextResponse.json({ events: (res.results || []).map(eventFromRow) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const parsed = cleanEvent(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;
    const db = await getDB();
    const count = await db.prepare('SELECT COUNT(*) AS n FROM user_events WHERE user_id = ?').bind(user.sub).first<{ n: number }>();
    if ((Number(count?.n) || 0) >= MAX_EVENTS) return NextResponse.json({ error: 'กิจกรรมเต็มจำนวนที่เก็บได้แล้ว' }, { status: 400 });
    const id = uuid();
    await db
      .prepare(
        `INSERT INTO user_events (id, user_id, title, start_day, end_day, all_day, time_start, time_end, kind, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.sub, v.title, v.start, v.end, v.allDay ? 1 : 0, v.ts || null, v.te || null, v.kind, v.note || null)
      .run();
    return NextResponse.json({ event: { id, ...v } });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuth();
    const id = new URL(request.url).searchParams.get('id') || '';
    const parsed = cleanEvent(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;
    const db = await getDB();
    const res = await db
      .prepare(
        `UPDATE user_events
            SET title = ?, start_day = ?, end_day = ?, all_day = ?, time_start = ?, time_end = ?, kind = ?, note = ?, updated_at = datetime('now')
          WHERE id = ? AND user_id = ?`,
      )
      .bind(v.title, v.start, v.end, v.allDay ? 1 : 0, v.ts || null, v.te || null, v.kind, v.note || null, id, user.sub)
      .run();
    if (!res.meta?.changes) return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    return NextResponse.json({ event: { id, ...v } });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const id = new URL(request.url).searchParams.get('id') || '';
    const db = await getDB();
    const res = await db.prepare('DELETE FROM user_events WHERE id = ? AND user_id = ?').bind(id, user.sub).run();
    if (!res.meta?.changes) return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
