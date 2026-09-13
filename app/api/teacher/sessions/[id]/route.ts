import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Who may touch this round: its master's organizer, or admin. */
async function loadOwned(id: string) {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['session_host'])) {
    return { error: NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 }) };
  }
  const db = await getDB();
  const w = await db
    .prepare(
      `SELECT w.id, w.master_id, w.date, w.time_start, m.organizer, m.location_ids_json,
              (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.status != 'cancelled') AS live
         FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id
        WHERE w.id = ?`
    )
    .bind(id)
    .first<{ id: string; master_id: string | null; date: string; time_start: string; organizer: string | null; location_ids_json: string | null; live: number }>();
  if (!w || !w.master_id) return { error: NextResponse.json({ error: 'ไม่พบรอบนี้' }, { status: 404 }) };
  if (!u.roles.includes('admin') && w.organizer !== u.sub) {
    return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 }) };
  }
  return { u, db, w };
}

/** PUT /api/teacher/sessions/[id] — change a round's day, time, venue or
 *  seats. Day and time stay fixed once someone holds a seat; venue and seats
 *  may still change (seats never below what is booked). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await loadOwned(id);
  if ('error' in g) return g.error;
  const { db, w } = g;
  const body = (await request.json()) as { date?: string; time_start?: string; time_end?: string; location_id?: string; max_participants?: number };

  const date = body.date ?? w.date;
  const time_start = body.time_start ?? w.time_start;
  const time_end = body.time_end;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'วันที่ไม่ถูกต้อง' }, { status: 400 });
  if (!TIME_RE.test(time_start) || (time_end != null && !TIME_RE.test(time_end))) {
    return NextResponse.json({ error: 'เวลาไม่ถูกต้อง' }, { status: 400 });
  }
  if (time_end != null && time_end <= time_start) {
    return NextResponse.json({ error: 'เวลาจบต้องหลังเวลาเริ่ม' }, { status: 400 });
  }
  const movesTime = date !== w.date || time_start !== w.time_start;
  if (movesTime && w.live > 0) {
    return NextResponse.json({ error: 'รอบนี้มีผู้จองแล้ว — เปลี่ยนวัน/เวลาไม่ได้ (แก้สถานที่และที่นั่งได้)' }, { status: 409 });
  }
  if (movesTime) {
    const dup = await db
      .prepare("SELECT id FROM workshops WHERE master_id = ? AND date = ? AND time_start = ? AND status != 'cancelled' AND id != ?")
      .bind(w.master_id, date, time_start, id)
      .first<{ id: string }>();
    if (dup) return NextResponse.json({ error: 'มีรอบวันและเวลานี้อยู่แล้ว' }, { status: 409 });
  }

  let loc: { id: string; name: string; map_url: string | null } | null = null;
  if (body.location_id) {
    loc = await db.prepare('SELECT id, name, map_url FROM locations WHERE id = ?').bind(body.location_id).first();
    if (!loc) return NextResponse.json({ error: 'ไม่พบสถานที่' }, { status: 400 });
    let allowed: string[] = [];
    try {
      const a = w.location_ids_json ? (JSON.parse(w.location_ids_json) as unknown) : [];
      allowed = Array.isArray(a) ? (a as string[]) : [];
    } catch {
      allowed = [];
    }
    if (allowed.length > 0 && !allowed.includes(loc.id)) {
      return NextResponse.json({ error: 'สถานที่นี้ไม่อยู่ในรายการที่ Admin กำหนดให้ Workshop นี้' }, { status: 400 });
    }
  }
  let seats: number | null = null;
  if (body.max_participants != null) {
    seats = Math.max(1, Math.round(Number(body.max_participants) || 0));
    if (seats < w.live) return NextResponse.json({ error: `ที่นั่งต้องไม่น้อยกว่าที่จองแล้ว (${w.live})` }, { status: 400 });
  }

  const sets: string[] = ['date = ?', 'time_start = ?', "updated_at = datetime('now')"];
  const vals: unknown[] = [date, time_start];
  if (time_end != null) { sets.push('time_end = ?'); vals.push(time_end); }
  if (loc) { sets.push('location = ?', 'location_id = ?', 'map_url = ?'); vals.push(loc.name, loc.id, loc.map_url); }
  if (seats != null) { sets.push('max_participants = ?'); vals.push(seats); }
  vals.push(id);
  await db.prepare(`UPDATE workshops SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  const round = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(id).first();
  return NextResponse.json({ round });
}

/** DELETE /api/teacher/sessions/[id] — cancel a round the teacher opened, as
 *  long as nobody holds a seat in it. With bookings it is the admin's call. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['session_host'])) {
    return NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDB();
  const w = await db
    .prepare(
      `SELECT w.id, w.master_id, m.organizer,
              (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.status != 'cancelled') AS live
         FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id
        WHERE w.id = ?`
    )
    .bind(id)
    .first<{ id: string; master_id: string | null; organizer: string | null; live: number }>();
  if (!w || !w.master_id) return NextResponse.json({ error: 'ไม่พบรอบนี้' }, { status: 404 });
  if (!u.roles.includes('admin') && w.organizer !== u.sub) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }
  if (w.live > 0) {
    return NextResponse.json({ error: 'รอบนี้มีผู้จองแล้ว — ติดต่อ Admin เพื่อยกเลิก' }, { status: 409 });
  }
  await db.prepare("UPDATE workshops SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return NextResponse.json({ ok: true });
}
