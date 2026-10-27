import { NextResponse } from 'next/server';
import { seatsHeldSubquery } from '@/lib/seats';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles, requireAdmin } from '@/lib/auth';
import { cleanAges, cleanCloseRule, isHiddenStatus, statusOf, syncRounds } from '@/lib/round-rules';
import { expireStaleHolds } from '@/lib/holds';
import type { ImageMeta, WorkshopMaster } from '@/lib/types';
import { cardPrice, normalizeTiers, seatPrice } from '@/lib/pricing';
import { ownRoleSql } from '@/lib/roles';

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

    let master = await db
      .prepare(
        `SELECT m.*, u.name AS organizer_name,
                -- the public page links the organizer only while they hold the host role
                CASE WHEN u.id IS NOT NULL AND ${ownRoleSql('u', 'teacher')} THEN 1 ELSE 0 END AS organizer_is_host
         FROM workshop_masters m LEFT JOIN users u ON m.organizer = u.id
         WHERE m.id = ?`
      )
      .bind(id)
      .first<WorkshopMaster>();
    // A draft or archived activity is off the public site: only admin and
    // its own host still open it.
    if (master && isHiddenStatus(master.activity_status)) {
      const u = await getCurrentUserWithRoles();
      if (!u || (!u.roles.includes('admin') && u.sub !== master.organizer)) master = null;
    }
    if (!master) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลกิจกรรม' }, { status: 404 });
    }

    const sessions = await db
      .prepare(
        `SELECT w.*, ${seatsHeldSubquery('w')} AS booked,
                (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.booking_kind = 'private' AND ${SEAT_TAKEN}) AS private_taken
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
  price_group?: number | null;
  price_private?: number | null;
  default_max_participants?: number | null;
  kind?: 'round' | 'single';
  location_ids?: string[];
  price_group_booking?: number | null;
  price_tiers?: unknown;
  activity_status?: unknown;
  age_min?: unknown;
  age_max?: unknown;
  close_days_before?: unknown;
  close_time?: unknown;
};
const locIds = (v: unknown): string => JSON.stringify(Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
const kindOf = (v: unknown): 'round' | 'single' => (v === 'single' ? 'single' : 'round');

const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

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
    // Prices are tiers; price_group is the per-seat one, and the rounds
    // carry the card price (per seat, else whole round). A single master (no
    // tiers) still takes the price it was sent.
    const tiers = normalizeTiers(body.price_tiers);
    const priceGroup = tiers.length ? seatPrice(tiers) : money(body.price_group);
    // Status, age limit and booking close (migration 077) — only when sent,
    // so an older caller does not clear them.
    const settings = 'activity_status' in body;
    const ages = cleanAges(body.age_min, body.age_max);
    if ('error' in ages) return NextResponse.json({ error: ages.error }, { status: 400 });
    const rule = cleanCloseRule(body.close_days_before, body.close_time);
    if ('error' in rule) return NextResponse.json({ error: rule.error }, { status: 400 });
    if (settings) {
      await db
        .prepare('UPDATE workshop_masters SET activity_status = ?, age_min = ?, age_max = ?, close_days_before = ?, close_time = ? WHERE id = ?')
        .bind(statusOf(body.activity_status), ages.min, ages.max, rule.days, rule.time, id)
        .run();
    }
    await db
      .prepare(
        `UPDATE workshop_masters SET
           title = ?, description = ?, organizer = ?, cover_image_url = ?, cover_image_meta = ?,
           target_json = ?, takeaways_json = ?,
           price_group = ?, price_private = ?, default_max_participants = ?, kind = ?, location_ids_json = ?,
           price_group_booking = ?, price_tiers_json = ?,
           updated_at = datetime('now')
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
        priceGroup,
        money(body.price_private),
        Math.max(1, Math.round(Number(body.default_max_participants) || 20)),
        kindOf(body.kind),
        locIds(body.location_ids),
        money(body.price_group_booking),
        JSON.stringify(tiers),
        id
      )
      .run();
    // Rounds are copies of the master taken when the teacher opened them, so
    // an edit here has to reach them too — otherwise the public cards keep
    // showing the old poster and title. Bookings keep their own amount, so
    // re-syncing the price does not touch money already agreed.
    if (kindOf(body.kind) === 'round') {
      await db
        .prepare(
          `UPDATE workshops SET
             title = ?, description = ?, instructor_id = ?, instructor_ids_json = ?,
             image_url = ?, image_meta = ?, learn_json = ?, target_json = ?, price = ?
           WHERE master_id = ? AND status != 'cancelled'`
        )
        .bind(
          body.title.trim(),
          body.description || null,
          body.organizer || null,
          JSON.stringify(body.organizer ? [body.organizer] : []),
          body.cover_image_url || null,
          body.cover_image_meta ? JSON.stringify(body.cover_image_meta) : null,
          JSON.stringify((body.takeaways || []).filter((s) => s.trim())),
          JSON.stringify((body.target || []).filter((s) => s.trim())),
          (tiers.length ? cardPrice(tiers) : priceGroup) ?? 0,
          id
        )
        .run();
      if (settings) await syncRounds(db, id);
    }
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
