import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { applicantName } from '@/lib/applicant';
import { seatTakenSql, seatsOfRowSql, seatsHeldSubquery } from '@/lib/seats';
import { getWorkshopStart } from '@/lib/workshop-utils';
import { platformLabel } from '@/lib/online-platform';
import { sendPushToUser } from '@/lib/push';
import type { Workshop } from '@/lib/types';

/* A host cancels a round that people have paid for. Every paid party
 * (a seat, a group with its members, or a whole-round booking) either moves
 * to another round of the same activity — an existing one with room, or a
 * new one opened on the spot at the same time and venue — or is refunded.
 * Refunds are not paid here: the party is cancelled with 'workshop_changed'
 * and lands on the admin's refund list, the same as any cancelled event.
 * Holds still waiting for payment are simply cancelled. Moved parties keep
 * their booking row, payment and coupon; only the round changes. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Party = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  seats: number;
  kind: 'seat' | 'group' | 'private';
  amount: number;
  members: string[];
};

type Target = {
  id: string;
  date: string;
  time_start: string;
  time_end: string;
  venue: string;
  max: number;
  free: number;
  empty: boolean;
};

async function loadOwned(id: string) {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['session_host'])) {
    return { error: NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 }) };
  }
  const db = await getDB();
  const w = await db
    .prepare('SELECT w.*, m.organizer AS m_organizer FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id WHERE w.id = ?')
    .bind(id)
    .first<Workshop & { m_organizer: string | null }>();
  if (!w || !w.master_id) return { error: NextResponse.json({ error: 'ไม่พบรอบนี้' }, { status: 404 }) };
  if (!u.roles.includes('admin') && w.m_organizer !== u.sub) {
    return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 }) };
  }
  return { u, db, w };
}

const venueOf = (r: { is_online?: number | null; online_platform?: string | null; online_platform_other?: string | null; location?: string | null }) =>
  r.is_online ? `ออนไลน์ · ${platformLabel(r.online_platform, r.online_platform_other)}` : r.location || '—';

/** Paid parties of the round, members folded into their group. */
async function partiesOf(db: Awaited<ReturnType<typeof getDB>>, roundId: string): Promise<Party[]> {
  const rows =
    (
      await db
        .prepare(
          `SELECT b.id, b.user_id, b.parent_booking_id, b.booking_kind, b.amount, b.application_json,
                  ${seatsOfRowSql('b', 'w.max_participants')} AS seats,
                  COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS user_name, u.email AS user_email
             FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN users u ON u.id = b.user_id
            WHERE b.workshop_id = ? AND b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')
            ORDER BY b.created_at ASC`,
        )
        .bind(roundId)
        .all<{
          id: string;
          user_id: string | null;
          parent_booking_id: string | null;
          booking_kind: string | null;
          amount: number;
          application_json: string | null;
          seats: number;
          user_name: string | null;
          user_email: string | null;
        }>()
    ).results || [];
  const parties: Party[] = rows
    .filter((r) => !r.parent_booking_id)
    .map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: applicantName(r.application_json, r.user_name),
      email: r.user_email,
      seats: Number(r.seats) || 1,
      kind: r.booking_kind === 'private' ? 'private' : (Number(r.seats) || 1) > 1 ? 'group' : 'seat',
      amount: Number(r.amount) || 0,
      members: [],
    }));
  for (const m of rows.filter((r) => r.parent_booking_id)) {
    const p = parties.find((x) => x.id === m.parent_booking_id);
    if (p) p.members.push(applicantName(m.application_json, m.user_name));
  }
  return parties;
}

/** Other upcoming rounds of the same activity, with the seats still free. */
async function targetsOf(db: Awaited<ReturnType<typeof getDB>>, w: Workshop): Promise<Target[]> {
  const rows =
    (
      await db
        .prepare(
          `SELECT w.*, ${seatsHeldSubquery('w')} AS held
             FROM workshops w
            WHERE w.master_id = ? AND w.id != ? AND w.status = 'active'
            ORDER BY w.date ASC, w.time_start ASC`,
        )
        .bind(w.master_id, w.id)
        .all<Workshop & { held: number }>()
    ).results || [];
  const now = Date.now();
  return rows
    .filter((r) => getWorkshopStart(r).getTime() > now)
    .map((r) => {
      const held = Number(r.held) || 0;
      return {
        id: r.id,
        date: r.date,
        time_start: r.time_start,
        time_end: r.time_end,
        venue: venueOf(r),
        max: r.max_participants,
        free: Math.max(0, r.max_participants - held),
        empty: held === 0,
      };
    });
}

/** GET — who holds a seat in this round and where they could go. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await loadOwned(id);
  if ('error' in g) return g.error;
  const { db, w } = g;
  const [parties, targets, pending] = await Promise.all([
    partiesOf(db, id),
    targetsOf(db, w),
    db
      .prepare(`SELECT COUNT(*) AS n FROM bookings b WHERE b.workshop_id = ? AND b.payment_status = 'pending' AND ${seatTakenSql('b')}`)
      .bind(id)
      .first<{ n: number }>(),
  ]);
  return NextResponse.json({
    round: {
      id: w.id,
      title: w.title,
      date: w.date,
      time_start: w.time_start,
      time_end: w.time_end,
      venue: venueOf(w),
      max: w.max_participants,
      status: w.status,
      started: getWorkshopStart(w).getTime() <= Date.now(),
    },
    parties,
    pending: Number(pending?.n) || 0,
    targets,
  });
}

/** POST { moves: [{ id, round_id } | { id, date }] } — cancel the round,
 *  move each listed party to its own round (an existing one, or a new one
 *  opened on that date; parties sent to the same new date share it) and send
 *  everyone else to the refund list. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await loadOwned(id);
  if ('error' in g) return g.error;
  const { db, w, u } = g;
  if (w.status === 'cancelled') return NextResponse.json({ error: 'รอบนี้ถูกยกเลิกไปแล้ว' }, { status: 400 });
  if (getWorkshopStart(w).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'รอบนี้เริ่มไปแล้ว — ยกเลิกไม่ได้ ติดต่อ Admin' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { moves?: { id?: string; round_id?: string; date?: string }[] };
  const parties = await partiesOf(db, id);
  const moves = (body.moves || []).filter((m) => m && m.id);
  const ids = moves.map((m) => String(m.id));
  if (new Set(ids).size !== ids.length || moves.some((m) => !parties.some((p) => p.id === m.id))) {
    return NextResponse.json({ error: 'รายชื่อที่จะย้ายไม่ตรงกับผู้จองในรอบนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง' }, { status: 409 });
  }

  // Group the moves by destination, then check each destination once.
  type Dest = { key: string; roundId: string; date: string; time: string; open: boolean; parties: Party[] };
  const dests = new Map<string, Dest>();
  const targets = moves.length ? await targetsOf(db, w) : [];
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  for (const m of moves) {
    const p = parties.find((x) => x.id === m.id)!;
    let key: string;
    if (m.round_id) {
      key = `r:${m.round_id}`;
      if (!dests.has(key)) {
        const t = targets.find((x) => x.id === m.round_id);
        if (!t) return NextResponse.json({ error: 'ไม่พบรอบปลายทาง หรือรอบนั้นเริ่มไปแล้ว' }, { status: 400 });
        dests.set(key, { key, roundId: t.id, date: t.date, time: t.time_start, open: false, parties: [] });
      }
    } else if (m.date && DATE_RE.test(m.date)) {
      key = `d:${m.date}`;
      if (!dests.has(key)) {
        if (m.date < today) return NextResponse.json({ error: 'เปิดรอบย้อนหลังไม่ได้' }, { status: 400 });
        if (m.date === w.date) return NextResponse.json({ error: 'เลือกวันอื่นที่ไม่ใช่วันเดิม' }, { status: 400 });
        const dup = await db
          .prepare("SELECT id FROM workshops WHERE master_id = ? AND date = ? AND time_start = ? AND status != 'cancelled'")
          .bind(w.master_id, m.date, w.time_start)
          .first<{ id: string }>();
        if (dup) return NextResponse.json({ error: `วันที่ ${m.date} มีรอบเวลาเดียวกันอยู่แล้ว — เลือกรอบนั้นจากรายการแทน` }, { status: 409 });
        dests.set(key, { key, roundId: uuid(), date: m.date, time: w.time_start, open: true, parties: [] });
      }
    } else {
      return NextResponse.json({ error: `เลือกรอบหรือวันที่จะย้าย ${p.name} ไป` }, { status: 400 });
    }
    dests.get(key)!.parties.push(p);
  }
  for (const d of dests.values()) {
    const hasPrivate = d.parties.some((p) => p.kind === 'private');
    if (hasPrivate && d.parties.length > 1) {
      return NextResponse.json({ error: 'การจองเหมารอบต้องย้ายไปรอบของตัวเอง ไม่รวมกับคนอื่น' }, { status: 400 });
    }
    if (d.open) continue;
    const t = targets.find((x) => x.id === d.roundId)!;
    const need = d.parties.reduce((a, p) => a + p.seats, 0);
    if (hasPrivate && !t.empty) {
      return NextResponse.json({ error: 'การจองเหมารอบย้ายได้เฉพาะไปรอบที่ยังไม่มีใครจอง' }, { status: 400 });
    }
    if (!hasPrivate && t.free < need) {
      return NextResponse.json({ error: `รอบ ${t.date} ${t.time_start} เหลือ ${t.free} ที่ แต่ต้องย้าย ${need} ที่` }, { status: 400 });
    }
  }

  const stmts = [];
  for (const d of dests.values()) {
    const pids = d.parties.map((p) => p.id);
    const ph = pids.map(() => '?').join(',');
    if (d.open) {
      // Same activity, time, venue and room as the cancelled round, on the new day.
      const need = d.parties.reduce((a, p) => a + p.seats, 0);
      stmts.push(
        db
          .prepare(
            `INSERT INTO workshops (
               id, title, description, instructor_id, instructor_ids_json, workshop_type, date, dates_json, time_start, time_end,
               location, location_id, schedule_json, learn_json, target_json, tags_json, map_url, max_participants, price,
               image_url, image_meta, status, admission_type, payment_type, deposit_amount, require_consent, master_id,
               day_times_json, is_online, online_platform, online_platform_other, online_url, dashboard_access_json, created_by)
             SELECT ?, title, description, instructor_id, instructor_ids_json, workshop_type, ?, '[]', time_start, time_end,
               location, location_id, schedule_json, learn_json, target_json, tags_json, map_url, MAX(max_participants, ?), price,
               image_url, image_meta, 'active', admission_type, payment_type, deposit_amount, require_consent, master_id,
               '[]', is_online, online_platform, online_platform_other, online_url, dashboard_access_json, ?
               FROM workshops WHERE id = ?`,
          )
          .bind(d.roundId, d.date, need, u.sub, id),
      );
    }
    stmts.push(
      db
        .prepare(
          `UPDATE bookings SET workshop_id = ?, moved_from = ?, moved_at = datetime('now'), attended = NULL, attendance_json = NULL
            WHERE status != 'cancelled' AND (id IN (${ph}) OR parent_booking_id IN (${ph}))`,
        )
        .bind(d.roundId, id, ...pids, ...pids),
      db.prepare(`UPDATE ticket_transfers SET workshop_id = ? WHERE booking_id IN (${ph})`).bind(d.roundId, ...pids),
    );
  }
  // Everyone left — refunded parties, their members and unpaid holds.
  stmts.push(
    db
      .prepare(
        `UPDATE ticket_transfers SET status = 'cancelled'
          WHERE status = 'pending' AND booking_id IN (SELECT id FROM bookings WHERE workshop_id = ? AND status != 'cancelled')`,
      )
      .bind(id),
    db
      .prepare(`UPDATE bookings SET status = 'cancelled', cancel_reason = COALESCE(cancel_reason, 'workshop_changed') WHERE workshop_id = ? AND status != 'cancelled'`)
      .bind(id),
    db.prepare("UPDATE workshops SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id),
  );
  await db.batch(stmts);

  // Tell the people who moved where their seat is now. Refunded seats hear
  // from the push cron, which announces every cancelled round.
  if (dests.size > 0) {
    const env = (await getEnv()) as unknown as Parameters<typeof sendPushToUser>[1];
    for (const d of dests.values()) {
      const pids = d.parties.map((p) => p.id);
      const ph = pids.map(() => '?').join(',');
      const who =
        (
          await db
            .prepare(`SELECT DISTINCT user_id FROM bookings WHERE user_id IS NOT NULL AND (id IN (${ph}) OR parent_booking_id IN (${ph}))`)
            .bind(...pids, ...pids)
            .all<{ user_id: string }>()
        ).results || [];
      const when = new Date(d.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      for (const x of who) {
        try {
          await sendPushToUser(
            db,
            env,
            x.user_id,
            {
              title: `ย้ายรอบ: ${w.title}`,
              body: `ผู้จัดย้ายที่นั่งของคุณไปรอบ ${when} ${d.time} น. — ไม่สะดวกขอคืนเงินได้ที่หน้าการจอง`,
              url: '/me/bookings',
              tag: `moved-${x.user_id}-${id}`,
            },
            { urgency: 'high' },
          );
        } catch {}
      }
    }
  }

  const refunded = parties.filter((p) => !ids.includes(p.id) && p.amount > 0).length;
  return NextResponse.json({ ok: true, moved: moves.length, refunded, opened: [...dests.values()].filter((d) => d.open).length });
}
