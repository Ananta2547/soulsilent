/**
 * Writing a workshop_masters row (an activity: round or single) from the
 * activity form's body — shared by admin (api/workshop-masters) and hosts
 * submitting their own round activity (api/teacher/submissions). Callers
 * decide who may write and which fields they may set.
 */
import { cleanAges, cleanCloseRule, statusOf, syncRounds } from '@/lib/round-rules';
import { cardPrice, normalizeTiers, seatPrice } from '@/lib/pricing';
import type { ImageMeta } from '@/lib/types';

export type MasterBody = {
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
export const kindOf = (v: unknown): 'round' | 'single' => (v === 'single' ? 'single' : 'round');
const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const lines = (v: string[] | undefined) => JSON.stringify((v || []).filter((s) => s.trim()));

/** Validate the body; the error is shown to whoever filled the form. */
function prepare(body: MasterBody) {
  if (!body.title || !body.title.trim()) return { error: 'กรุณากรอกชื่อกิจกรรม' } as const;
  const ages = cleanAges(body.age_min, body.age_max);
  if ('error' in ages) return { error: ages.error } as const;
  const rule = cleanCloseRule(body.close_days_before, body.close_time);
  if ('error' in rule) return { error: rule.error } as const;
  // Prices are tiers; price_group is the per-seat one. A single master (no
  // tiers) still takes the price it was sent.
  const tiers = normalizeTiers(body.price_tiers);
  const priceGroup = tiers.length ? seatPrice(tiers) : money(body.price_group);
  return { ages, rule, tiers, priceGroup };
}

export async function insertMaster(db: D1Database, id: string, body: MasterBody): Promise<{ error?: string }> {
  const p = prepare(body);
  if ('error' in p) return { error: p.error };
  await db
    .prepare(
      `INSERT INTO workshop_masters
        (id, title, description, organizer, cover_image_url, cover_image_meta, target_json, takeaways_json,
         price_group, price_private, default_max_participants, kind, location_ids_json,
         price_group_booking, price_tiers_json, activity_status, age_min, age_max, close_days_before, close_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      body.title.trim(),
      body.description || null,
      body.organizer || null,
      body.cover_image_url || null,
      body.cover_image_meta ? JSON.stringify(body.cover_image_meta) : null,
      lines(body.target),
      lines(body.takeaways),
      p.priceGroup,
      money(body.price_private),
      Math.max(1, Math.round(Number(body.default_max_participants) || 20)),
      kindOf(body.kind),
      locIds(body.location_ids),
      money(body.price_group_booking),
      JSON.stringify(p.tiers),
      statusOf(body.activity_status),
      p.ages.min,
      p.ages.max,
      p.rule.days,
      p.rule.time,
    )
    .run();
  return {};
}

export async function updateMaster(db: D1Database, id: string, body: MasterBody): Promise<{ error?: string }> {
  const p = prepare(body);
  if ('error' in p) return { error: p.error };
  // Status, age limit and booking close (migration 077) — only when sent,
  // so an older caller does not clear them.
  const settings = 'activity_status' in body;
  if (settings) {
    await db
      .prepare('UPDATE workshop_masters SET activity_status = ?, age_min = ?, age_max = ?, close_days_before = ?, close_time = ? WHERE id = ?')
      .bind(statusOf(body.activity_status), p.ages.min, p.ages.max, p.rule.days, p.rule.time, id)
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
       WHERE id = ?`,
    )
    .bind(
      body.title.trim(),
      body.description || null,
      body.organizer || null,
      body.cover_image_url || null,
      body.cover_image_meta ? JSON.stringify(body.cover_image_meta) : null,
      lines(body.target),
      lines(body.takeaways),
      p.priceGroup,
      money(body.price_private),
      Math.max(1, Math.round(Number(body.default_max_participants) || 20)),
      kindOf(body.kind),
      locIds(body.location_ids),
      money(body.price_group_booking),
      JSON.stringify(p.tiers),
      id,
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
         WHERE master_id = ? AND status != 'cancelled'`,
      )
      .bind(
        body.title.trim(),
        body.description || null,
        body.organizer || null,
        JSON.stringify(body.organizer ? [body.organizer] : []),
        body.cover_image_url || null,
        body.cover_image_meta ? JSON.stringify(body.cover_image_meta) : null,
        lines(body.takeaways),
        lines(body.target),
        (p.tiers.length ? cardPrice(p.tiers) : p.priceGroup) ?? 0,
        id,
      )
      .run();
    if (settings) await syncRounds(db, id);
  }
  return {};
}
