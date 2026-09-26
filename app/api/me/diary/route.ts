import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { cleanMoods, cleanNotes, hasContent, isDay, MAX_PAGES, paginate, parseEntry, todayBangkok, type DiaryEntry } from '@/lib/diary';

type Row = { day: string; moods_json: string; notes_json: string; updated_at: string | null };
type DB = Awaited<ReturnType<typeof getDB>>;

function fail(e: unknown) {
  if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  console.error('Diary error:', e);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}

async function readEntry(db: DB, userId: string, day: string): Promise<DiaryEntry | null> {
  const row = await db.prepare('SELECT day, moods_json, notes_json, updated_at FROM diary_entries WHERE user_id = ? AND day = ?').bind(userId, day).first<Row>();
  return row ? parseEntry(row) : null;
}

async function writeEntry(db: DB, userId: string, e: DiaryEntry) {
  if (!hasContent(e)) {
    await db.prepare('DELETE FROM diary_entries WHERE user_id = ? AND day = ?').bind(userId, e.day).run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO diary_entries (id, user_id, day, moods_json, notes_json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET moods_json = excluded.moods_json, notes_json = excluded.notes_json, updated_at = datetime('now')`,
    )
    .bind(uuid(), userId, e.day, JSON.stringify(e.moods), JSON.stringify(e.notes))
    .run();
}

/** Carries My Journey's old per-booking memory notes into the diary page of
 *  the workshop's first day, once per booking. A day that already has pages
 *  gets the note added after them. */
async function moveJourneyNotes(db: DB, userId: string) {
  const res = await db
    .prepare(
      `SELECT b.id, b.journey_note, w.date FROM bookings b JOIN workshops w ON w.id = b.workshop_id
        WHERE b.user_id = ? AND COALESCE(b.journey_note_moved, 0) = 0
          AND b.journey_note IS NOT NULL AND TRIM(b.journey_note) != ''`,
    )
    .bind(userId)
    .all<{ id: string; journey_note: string; date: string }>();
  for (const r of res.results || []) {
    if (isDay(r.date)) {
      const cur = await readEntry(db, userId, r.date);
      const note = r.journey_note.trim();
      if (!cur) await writeEntry(db, userId, { day: r.date, moods: [], notes: paginate(note) });
      else if (!cur.notes.join('').includes(note.slice(0, 60))) {
        const pages = cur.notes.some((t) => t.trim()) ? [...cur.notes, ...paginate(note)] : paginate(note);
        await writeEntry(db, userId, { ...cur, notes: cleanNotes(pages.slice(0, MAX_PAGES)) });
      }
    }
    await db.prepare('UPDATE bookings SET journey_note_moved = 1 WHERE id = ?').bind(r.id).run();
  }
}

/**
 * GET /api/me/diary — the signed-in user's whole diary: every written day and
 * the months whose summary they kept. Only ever the caller's own rows.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const db = await getDB();
    await moveJourneyNotes(db, user.sub);
    const [rows, months] = await db.batch([
      db.prepare('SELECT day, moods_json, notes_json, updated_at FROM diary_entries WHERE user_id = ? ORDER BY day ASC').bind(user.sub),
      db.prepare('SELECT month FROM diary_months WHERE user_id = ? ORDER BY month ASC').bind(user.sub),
    ]);
    return NextResponse.json({
      entries: ((rows.results || []) as Row[]).map(parseEntry).filter(hasContent),
      months: ((months.results || []) as { month: string }[]).map((m) => m.month),
      today: todayBangkok(),
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * PUT /api/me/diary — write one day. Body: { day, notes?, moods? }; a field
 * left out keeps what is saved. A day emptied of both is removed. Days after
 * today (Thailand, plus one for readers east of it) cannot be written.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { day?: unknown; notes?: unknown; moods?: unknown };
    if (!isDay(body.day)) return NextResponse.json({ error: 'วันที่ไม่ถูกต้อง' }, { status: 400 });
    const limit = new Date(todayBangkok() + 'T00:00:00Z');
    limit.setUTCDate(limit.getUTCDate() + 1);
    if (body.day > limit.toISOString().slice(0, 10)) return NextResponse.json({ error: 'เขียนล่วงหน้าไม่ได้' }, { status: 400 });
    const db = await getDB();
    const cur = (await readEntry(db, user.sub, body.day)) || { day: body.day, moods: [], notes: [''] };
    const next: DiaryEntry = {
      day: body.day,
      moods: body.moods === undefined ? cur.moods : cleanMoods(body.moods),
      notes: body.notes === undefined ? cur.notes : cleanNotes(body.notes),
    };
    await writeEntry(db, user.sub, next);
    return NextResponse.json({ entry: next });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/me/diary — keep (or drop) a month's summary in the book.
 *  Body: { month: 'YYYY-MM', keep: boolean }. */
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { month?: unknown; keep?: unknown };
    if (typeof body.month !== 'string' || !/^\d{4}-\d{2}$/.test(body.month)) return NextResponse.json({ error: 'เดือนไม่ถูกต้อง' }, { status: 400 });
    const db = await getDB();
    if (body.keep === false) await db.prepare('DELETE FROM diary_months WHERE user_id = ? AND month = ?').bind(user.sub, body.month).run();
    else await db.prepare('INSERT OR IGNORE INTO diary_months (user_id, month) VALUES (?, ?)').bind(user.sub, body.month).run();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
