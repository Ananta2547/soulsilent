import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireRoles } from '@/lib/auth';
import { partiesOf } from '@/lib/booking-parties';
import { getWorkshopStart, safeParseArray } from '@/lib/workshop-utils';
import { sendPushToUser } from '@/lib/push';
import { isLive, routeError, type SubKind } from '@/lib/submissions';
import { tellAdmins } from '@/lib/host-verification';
import type { DayTime, Workshop, WorkshopMaster } from '@/lib/types';

/*
 * A host closes or reschedules an activity they made themselves. Nothing is
 * deleted here — a cancelled activity is only hidden (workshops.status
 * 'cancelled', masters.activity_status 'archived'); admin alone deletes.
 *
 *   single · cancel    every booking goes to admin's refund list
 *                      ('workshop_changed'); the push cron tells the bookers
 *   single · postpone  new date and time at once, no approval. Each paid party
 *                      either moves with it (keeps the booking; the cron tells
 *                      them of the change) or is refunded, as when a round moves
 *   round  · cancel    only while no round has a booking; its rounds close too
 *                      (a round with bookings is cancelled or moved on the
 *                      หน้าจัดรอบ first)
 */

type Ctx = { params: Promise<{ kind: string; id: string }> };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

async function own(kind: string, id: string) {
  const me = await requireRoles('self_publisher');
  const db = await getDB();
  if (kind !== 'single' && kind !== 'round') return { error: NextResponse.json({ error: 'ไม่รู้จักประเภทกิจกรรม' }, { status: 400 }) };
  const row =
    kind === 'single'
      ? await db.prepare('SELECT * FROM workshops WHERE id = ? AND master_id IS NULL').bind(id).first<Workshop & { created_by?: string | null; pending_json?: string | null }>()
      : await db.prepare("SELECT * FROM workshop_masters WHERE id = ? AND kind = 'round'").bind(id).first<WorkshopMaster & { created_by?: string | null }>();
  if (!row || row.created_by !== me.sub) return { error: NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 }) };
  return { me, db, kind: kind as SubKind, row };
}

/** "YYYY-MM-DD…" moved by `days`; anything else left alone. */
function shift(s: string | null | undefined, days: number): string | null {
  if (!s) return s ?? null;
  const m = /^(\d{4}-\d{2}-\d{2})(.*)$/.exec(s);
  if (!m) return s;
  const d = new Date(`${m[1]}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) + m[2];
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const thDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

/** GET — who holds a seat (single activities), to choose move or refund. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { kind, id } = await params;
    const o = await own(kind, id);
    if ('error' in o) return o.error;
    if (o.kind === 'round') {
      const n = await o.db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled' AND workshop_id IN (SELECT id FROM workshops WHERE master_id = ?)")
        .bind(id)
        .first<{ n: number }>();
      return NextResponse.json({ kind: 'round', booked: n?.n || 0 });
    }
    const w = o.row as Workshop;
    const parties = await partiesOf(o.db, id);
    return NextResponse.json({
      kind: 'single',
      workshop: { id, title: w.title, date: w.date, end_date: w.end_date, time_start: w.time_start, time_end: w.time_end, workshop_type: w.workshop_type, status: w.status },
      started: getWorkshopStart(w).getTime() <= Date.now(),
      parties,
    });
  } catch (e) {
    return routeError(e, 'Cancel info');
  }
}

/** POST { action: 'cancel' } | { action: 'postpone', date, time_start, time_end, refund: [partyId] } */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { kind, id } = await params;
    const o = await own(kind, id);
    if ('error' in o) return o.error;
    const { db, me } = o;
    const body = (await request.json().catch(() => ({}))) as { action?: string; date?: string; time_start?: string; time_end?: string; refund?: string[] };
    const env = (await getEnv()) as unknown as Parameters<typeof sendPushToUser>[1];
    const host = await db.prepare("SELECT COALESCE(NULLIF(TRIM(nickname), ''), name) AS n FROM users WHERE id = ?").bind(me.sub).first<{ n: string | null }>();
    const who = host?.n || 'ผู้จัด';

    // ---- round activity: close the whole thing, only while nobody is booked ----
    if (o.kind === 'round') {
      if (body.action !== 'cancel') return NextResponse.json({ error: 'กิจกรรมจองรอบเลื่อนได้ทีละรอบที่หน้าจัดรอบ' }, { status: 400 });
      const m = o.row as WorkshopMaster;
      if (m.activity_status === 'archived') return NextResponse.json({ error: 'กิจกรรมนี้ยกเลิกไปแล้ว' }, { status: 400 });
      const n = await db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled' AND workshop_id IN (SELECT id FROM workshops WHERE master_id = ?)")
        .bind(id)
        .first<{ n: number }>();
      if (n?.n) return NextResponse.json({ error: 'ยังมีรอบที่มีคนจอง — ยกเลิกหรือย้ายรอบนั้นที่หน้าจัดรอบก่อน' }, { status: 409 });
      const wasLive = isLive('round', m);
      await db.batch([
        db.prepare("UPDATE workshops SET status = 'cancelled', updated_at = datetime('now') WHERE master_id = ? AND status != 'cancelled'").bind(id),
        db.prepare("UPDATE workshop_masters SET activity_status = 'archived', pending_json = NULL, updated_at = datetime('now') WHERE id = ?").bind(id),
      ]);
      if (wasLive)
        await tellAdmins(db, env, {
          title: `ผู้จัดยกเลิกกิจกรรม: ${m.title}`,
          body: `${who} ยกเลิกกิจกรรมจองรอบ (ไม่มีผู้จอง)`,
          band: 'ADMIN · ผู้จัดยกเลิก',
          url: '/admin/submissions?tab=cancelled',
          rows: [
            { k: 'ผู้จัด', v: who },
            { k: 'แบบ', v: 'กิจกรรมจองรอบ' },
          ],
          cta: 'ดูรายการ',
        });
      return NextResponse.json({ ok: true });
    }

    // ---- single activity ----
    const w = o.row as Workshop & { pending_json?: string | null };
    if (w.status === 'cancelled') return NextResponse.json({ error: 'กิจกรรมนี้ยกเลิกไปแล้ว' }, { status: 400 });
    if (isLive('single', w) && getWorkshopStart(w).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'กิจกรรมเริ่มไปแล้ว — ยกเลิกหรือเลื่อนไม่ได้ ติดต่อทีมงาน' }, { status: 400 });
    }
    const parties = await partiesOf(db, id);

    if (body.action === 'cancel') {
      await db.batch([
        db
          .prepare(
            `UPDATE ticket_transfers SET status = 'cancelled'
              WHERE status = 'pending' AND booking_id IN (SELECT id FROM bookings WHERE workshop_id = ? AND status != 'cancelled')`,
          )
          .bind(id),
        db.prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = COALESCE(cancel_reason, 'workshop_changed') WHERE workshop_id = ? AND status != 'cancelled'").bind(id),
        db.prepare("UPDATE workshops SET status = 'cancelled', pending_json = NULL, updated_at = datetime('now') WHERE id = ?").bind(id),
      ]);
      // With paid seats the push cron tells the bookers and admin (refund list).
      if (isLive('single', w) && !parties.length)
        await tellAdmins(db, env, {
          title: `ผู้จัดยกเลิกกิจกรรม: ${w.title}`,
          body: `${who} ยกเลิกกิจกรรม ${thDay(w.date)} (ไม่มีผู้จอง)`,
          band: 'ADMIN · ผู้จัดยกเลิก',
          url: '/admin/submissions?tab=cancelled',
          rows: [
            { k: 'ผู้จัด', v: who },
            { k: 'วันที่', v: thDay(w.date) },
          ],
          cta: 'ดูรายการ',
        });
      return NextResponse.json({ ok: true, refunded: parties.filter((p) => p.amount > 0).length });
    }

    if (body.action !== 'postpone') return NextResponse.json({ error: 'ไม่รู้จักคำสั่ง' }, { status: 400 });
    // Without bookings a new date is an ordinary edit, which admin approves.
    if (!parties.length) return NextResponse.json({ error: 'ยังไม่มีผู้จอง — เปลี่ยนวันได้ที่ปุ่มแก้ไข (ทีมงานอนุมัติ)' }, { status: 400 });
    const date = String(body.date || '');
    const ts = String(body.time_start || w.time_start);
    const te = String(body.time_end || w.time_end);
    if (!DATE_RE.test(date) || !TIME_RE.test(ts) || !TIME_RE.test(te)) return NextResponse.json({ error: 'กรุณาเลือกวันและเวลาใหม่' }, { status: 400 });
    if (te <= ts) return NextResponse.json({ error: 'เวลาจบต้องหลังเวลาเริ่ม' }, { status: 400 });
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (date < today) return NextResponse.json({ error: 'เลื่อนไปวันที่ผ่านมาแล้วไม่ได้' }, { status: 400 });
    if (date === w.date && ts === w.time_start && te === w.time_end) return NextResponse.json({ error: 'วันและเวลาใหม่เหมือนเดิม' }, { status: 400 });
    const refund = [...new Set((body.refund || []).map(String))];
    if (refund.some((r) => !parties.some((p) => p.id === r))) {
      return NextResponse.json({ error: 'รายชื่อไม่ตรงกับผู้จอง — โหลดหน้าใหม่แล้วลองอีกครั้ง' }, { status: 409 });
    }

    // Every day of the activity moves by the same number of days; a day with
    // the activity's usual hours takes the new hours.
    const delta = dayDiff(w.date, date);
    const dates = safeParseArray<string>(w.dates_json, []).map((d) => shift(d, delta) as string);
    const dayTimes = safeParseArray<DayTime>(w.day_times_json, []).map((d) => ({
      date: shift(d.date, delta) as string,
      time_start: d.time_start === w.time_start ? ts : d.time_start,
      time_end: d.time_end === w.time_end ? te : d.time_end,
    }));
    const x = w as Workshop & { announce_at?: string | null; close_at?: string | null; confirm_main_by?: string | null; confirm_waitlist_by?: string | null };
    // A date change waiting for admin is overtaken by this one.
    let pending: Record<string, unknown> | null = null;
    try {
      pending = w.pending_json ? (JSON.parse(w.pending_json) as Record<string, unknown>) : null;
    } catch {}
    if (pending) for (const k of ['date', 'end_date', 'dates', 'time_start', 'time_end', 'day_times', 'workshop_type']) delete pending[k];

    const stmts = [
      db
        .prepare(
          `UPDATE workshops SET date = ?, end_date = ?, dates_json = ?, day_times_json = ?, time_start = ?, time_end = ?,
             announce_at = ?, close_at = ?, confirm_main_by = ?, confirm_waitlist_by = ?, pending_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          date,
          shift(w.end_date, delta),
          JSON.stringify(dates),
          JSON.stringify(dayTimes),
          ts,
          te,
          shift(x.announce_at, delta),
          shift(x.close_at, delta),
          shift(x.confirm_main_by, delta),
          shift(x.confirm_waitlist_by, delta),
          pending && Object.keys(pending).length ? JSON.stringify(pending) : null,
          id,
        ),
    ];
    if (refund.length) {
      const ph = refund.map(() => '?').join(',');
      stmts.push(
        db.prepare(`UPDATE ticket_transfers SET status = 'cancelled' WHERE status = 'pending' AND booking_id IN (${ph})`).bind(...refund),
        db
          .prepare(
            `UPDATE bookings SET status = 'cancelled', cancel_reason = COALESCE(cancel_reason, 'workshop_changed')
              WHERE status != 'cancelled' AND (id IN (${ph}) OR parent_booking_id IN (${ph}))`,
          )
          .bind(...refund, ...refund),
      );
    }
    await db.batch(stmts);
    if (pending && !Object.keys(pending).length) await db.prepare("UPDATE workshops SET review_status = 'approved' WHERE id = ? AND review_status = 'pending'").bind(id).run();

    // Those refunded hear now; those who move hear from the push cron, which
    // tells every booker (and admin) of a changed date.
    const oldWhen = `${thDay(w.date)} ${w.time_start} น.`;
    const newWhen = `${thDay(date)} ${ts} น.`;
    for (const p of parties.filter((q) => refund.includes(q.id) && q.user_id)) {
      try {
        await sendPushToUser(db, env, p.user_id as string, {
          title: `เลื่อนกิจกรรม: ${w.title}`,
          body: `ผู้จัดเลื่อนกิจกรรมไป ${newWhen} — การจองของคุณถูกยกเลิกและจะได้รับเงินคืน`,
          url: '/me/bookings',
          tag: `postponed-${p.id}`,
          card: {
            topic: 'cancel',
            title: `เลื่อนกิจกรรม: ${w.title}`,
            sub: 'การจองของคุณถูกยกเลิก ทีมงานจะคืนเงินตามนโยบาย',
            rows: [
              { k: 'วันเดิม', v: oldWhen, color: '#9aaba8' },
              { k: 'วันใหม่', v: newWhen },
            ],
            cta: { label: 'ดูการจองและการคืนเงิน', url: '/me/bookings', dark: true },
          },
        });
      } catch {}
    }
    const refunded = parties.filter((p) => refund.includes(p.id) && p.amount > 0).length;
    if (refunded)
      await tellAdmins(db, env, {
        title: `ผู้จัดเลื่อนกิจกรรม: ${w.title}`,
        body: `${who} เลื่อนเป็น ${newWhen} · ต้องคืนเงิน ${refunded} รายการ`,
        band: 'ADMIN · ตรวจการคืนเงิน',
        url: '/admin/ledger',
        rows: [
          { k: 'วันเดิม', v: oldWhen },
          { k: 'วันใหม่', v: newWhen },
          { k: 'คืนเงิน', v: `${refunded} รายการ` },
        ],
        cta: 'เปิดบัญชีการเงิน',
      });
    return NextResponse.json({ ok: true, moved: parties.length - refund.length, refunded });
  } catch (e) {
    return routeError(e, 'Cancel / postpone');
  }
}
