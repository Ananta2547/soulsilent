import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import type { Workshop, WorkshopMaster } from '@/lib/types';

/* The teacher's session manager. A master is the activity the admin wrote up
 * and handed to a teacher (workshop_masters.organizer); a round is one row in
 * `workshops` the teacher opens under it — its own date, time, venue, seats,
 * bookings and payout. The row copies what the master says so every public
 * page keeps reading the workshop it always did. */

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Opening rounds takes the 'ผู้จัดรอบ' role (session_host); admin passes. */
async function requireTeacher() {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['session_host'])) {
    return { error: NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 }) };
  }
  return { u };
}

/** GET /api/teacher/sessions — masters this teacher may open rounds for, the
 *  rounds already opened under them, and the venues to choose from. */
export async function GET() {
  const g = await requireTeacher();
  if ('error' in g) return g.error;
  const { u } = g;
  const db = await getDB();
  const isAdmin = u.roles.includes('admin');

  const masters = await db
    .prepare(
      `SELECT m.*, u.name AS organizer_name
         FROM workshop_masters m LEFT JOIN users u ON m.organizer = u.id
        ${isAdmin ? '' : 'WHERE m.organizer = ?'}
        ORDER BY m.title ASC`
    )
    .bind(...(isAdmin ? [] : [u.sub]))
    .all<WorkshopMaster>();

  const rounds = await db
    .prepare(
      `SELECT w.id, w.master_id, w.title, w.date, w.time_start, w.time_end, w.location_id, w.max_participants,
              w.status, w.created_by, l.name AS loc_name,
              (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id
                 AND b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')) AS booked
         FROM workshops w LEFT JOIN locations l ON w.location_id = l.id
        WHERE w.master_id IS NOT NULL
          ${isAdmin ? '' : 'AND w.master_id IN (SELECT id FROM workshop_masters WHERE organizer = ?)'}
        ORDER BY w.date ASC, w.time_start ASC`
    )
    .bind(...(isAdmin ? [] : [u.sub]))
    .all();

  const locations = await db
    .prepare('SELECT id, name, province, district FROM locations ORDER BY name ASC')
    .all<{ id: string; name: string; province: string | null; district: string | null }>();

  return NextResponse.json({
    masters: masters.results || [],
    rounds: rounds.results || [],
    locations: locations.results || [],
  });
}

type Body = {
  master_id: string;
  /** First (or only) day. */
  date: string;
  time_start: string;
  time_end: string;
  location_id: string;
  max_participants?: number;
  /** 'once' (default) opens the one day; 'daily' / 'weekly' open every
   *  matching day from `date` through `end_date`. */
  repeat?: 'once' | 'daily' | 'weekly';
  end_date?: string;
  /** For 'weekly': days of the week to open, 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
};

/** How many rounds one request may open — a daily pattern over a quarter. */
const MAX_ROUNDS = 92;

/** Every day the pattern lands on, in order. */
function expandDates(b: Body): string[] {
  const repeat = b.repeat || 'once';
  if (repeat === 'once') return [b.date];
  const end = b.end_date && DATE_RE.test(b.end_date) ? b.end_date : b.date;
  const wanted = new Set((b.weekdays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  const out: string[] = [];
  const cur = new Date(b.date + 'T00:00:00Z');
  const stop = new Date(end + 'T00:00:00Z');
  while (cur <= stop && out.length < MAX_ROUNDS) {
    const ymd = cur.toISOString().slice(0, 10);
    if (repeat === 'daily' || wanted.has(cur.getUTCDay())) out.push(ymd);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** POST /api/teacher/sessions — open one round, or a repeating run of them,
 *  under a master. Days that already have a round at that hour are skipped. */
export async function POST(request: Request) {
  const g = await requireTeacher();
  if ('error' in g) return g.error;
  const { u } = g;
  const body = (await request.json()) as Body;

  if (!body.master_id) return NextResponse.json({ error: 'กรุณาเลือก Workshop' }, { status: 400 });
  if (!DATE_RE.test(body.date || '')) return NextResponse.json({ error: 'กรุณาเลือกวันที่' }, { status: 400 });
  if (!TIME_RE.test(body.time_start || '') || !TIME_RE.test(body.time_end || '')) {
    return NextResponse.json({ error: 'กรุณากรอกเวลาเริ่มและเวลาจบ' }, { status: 400 });
  }
  if (body.time_end <= body.time_start) {
    return NextResponse.json({ error: 'เวลาจบต้องหลังเวลาเริ่ม' }, { status: 400 });
  }
  if (!body.location_id) return NextResponse.json({ error: 'กรุณาเลือกสถานที่' }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  if (body.date < today) return NextResponse.json({ error: 'เปิดรอบย้อนหลังไม่ได้' }, { status: 400 });
  const repeat = body.repeat || 'once';
  if (repeat !== 'once') {
    if (!body.end_date || !DATE_RE.test(body.end_date) || body.end_date < body.date) {
      return NextResponse.json({ error: 'กรุณาเลือกวันสิ้นสุดของรอบซ้ำ' }, { status: 400 });
    }
    if (repeat === 'weekly' && !(body.weekdays || []).length) {
      return NextResponse.json({ error: 'กรุณาเลือกวันในสัปดาห์อย่างน้อย 1 วัน' }, { status: 400 });
    }
  }
  const dates = expandDates(body);
  if (dates.length === 0) return NextResponse.json({ error: 'รูปแบบซ้ำนี้ไม่ตรงกับวันไหนเลย' }, { status: 400 });

  const db = await getDB();
  const master = await db
    .prepare('SELECT * FROM workshop_masters WHERE id = ?')
    .bind(body.master_id)
    .first<WorkshopMaster>();
  if (!master) return NextResponse.json({ error: 'ไม่พบ Workshop' }, { status: 404 });
  if (!u.roles.includes('admin') && master.organizer !== u.sub) {
    return NextResponse.json({ error: 'คุณไม่ได้เป็นผู้สอนของ Workshop นี้' }, { status: 403 });
  }
  if (master.price_group == null) {
    return NextResponse.json({ error: 'Admin ยังไม่ได้ตั้งราคาให้ Workshop นี้' }, { status: 400 });
  }
  const loc = await db
    .prepare('SELECT id, name, map_url FROM locations WHERE id = ?')
    .bind(body.location_id)
    .first<{ id: string; name: string; map_url: string | null }>();
  if (!loc) return NextResponse.json({ error: 'ไม่พบสถานที่' }, { status: 400 });

  const seats = Math.max(1, Math.round(Number(body.max_participants) || master.default_max_participants || 20));

  // Two rounds of the same activity on the same day at the same hour would
  // be one round twice — those days are skipped, not errors, so a repeating
  // run can be widened later without re-entering it.
  const taken = new Set(
    (
      await db
        .prepare("SELECT date FROM workshops WHERE master_id = ? AND time_start = ? AND status != 'cancelled'")
        .bind(master.id, body.time_start)
        .all<{ date: string }>()
    ).results.map((r) => r.date)
  );
  const toOpen = dates.filter((d) => !taken.has(d));
  if (toOpen.length === 0) {
    return NextResponse.json({ error: repeat === 'once' ? 'มีรอบวันและเวลานี้อยู่แล้ว' : 'ทุกวันในช่วงนี้มีรอบเวลานี้อยู่แล้ว' }, { status: 409 });
  }

  const ids: string[] = [];
  for (const date of toOpen) {
    const id = uuid();
    ids.push(id);
    await insertRound(db, id, master, loc, date, body, seats, u.sub);
  }

  const first = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(ids[0]).first<Workshop>();
  return NextResponse.json({ round: first, created: ids.length, skipped: dates.length - toOpen.length, ids }, { status: 201 });
}

async function insertRound(
  db: Awaited<ReturnType<typeof getDB>>,
  id: string,
  master: WorkshopMaster,
  loc: { id: string; name: string; map_url: string | null },
  date: string,
  body: Body,
  seats: number,
  createdBy: string
) {
  await db
    .prepare(
      `INSERT INTO workshops (
        id, title, description, instructor_id, instructor_ids_json,
        workshop_type, date, dates_json, time_start, time_end, location, location_id,
        schedule_json, learn_json, target_json, tags_json, map_url,
        max_participants, price, image_url, image_meta, status,
        admission_type, payment_type, deposit_amount, require_consent, master_id,
        day_times_json, is_online, dashboard_access_json, created_by
       ) VALUES (?, ?, ?, ?, ?, 'one_day', ?, '[]', ?, ?, ?, ?, '[]', ?, ?, '[]', ?, ?, ?, ?, ?, 'active',
                 'direct', 'paid', 0, 0, ?, '[]', 0, '[]', ?)`
    )
    .bind(
      id,
      master.title,
      master.description,
      master.organizer,
      JSON.stringify(master.organizer ? [master.organizer] : []),
      date,
      body.time_start,
      body.time_end,
      loc.name,
      loc.id,
      master.takeaways_json || '[]',
      master.target_json || '[]',
      loc.map_url,
      seats,
      master.price_group,
      master.cover_image_url,
      master.cover_image_meta,
      master.id,
      createdBy
    )
    .run();
}
