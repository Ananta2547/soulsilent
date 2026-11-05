/**
 * Writing a workshops row from the activity form's body — one copy shared by
 * admin (api/workshops) and hosts submitting their own activity
 * (api/teacher/submissions). Callers decide who may write and which fields
 * they may set; this only turns the body into the row.
 */
import { normalizeInstructorIds } from '@/lib/workshop-utils';
import { normalizeOnlineFields } from '@/lib/online-platform';
import { cleanQuestions } from '@/lib/application-form';
import type { ApplicationQuestion, DayTime, ImageMeta } from '@/lib/types';

export type WorkshopBody = {
  title: string;
  description?: string;
  short_description?: string;
  instructor_id?: string;
  /** Every facilitator, in display order. instructor_id = the first one. */
  instructor_ids?: string[];
  /** Co-facilitators allowed into the teacher dashboard. */
  dashboard_access?: string[];
  workshop_type?: 'one_day' | 'multi_day' | 'multi_part';
  date: string;
  end_date?: string | null;
  dates?: string[];
  time_start: string;
  time_end: string;
  day_times?: DayTime[];
  location?: string;
  location_id?: string;
  is_online?: boolean | number;
  online_platform?: string | null;
  online_platform_other?: string | null;
  online_url?: string | null;
  schedule?: { label: string; items: { time: string; detail: string }[] }[];
  learn_items?: string[];
  target_items?: string[];
  category?: string;
  tags?: string[];
  promo_price?: number | null;
  promo_start?: string | null;
  promo_end?: string | null;
  map_url?: string;
  theme_color?: string;
  max_participants?: number;
  min_age?: number | null;
  max_age?: number | null;
  price: number;
  image_url?: string;
  image_meta?: ImageMeta | null;
  status?: string;
  admission_type?: string;
  payment_type?: string;
  deposit_amount?: number;
  announce_at?: string | null;
  close_at?: string | null;
  confirm_main_by?: string | null;
  confirm_waitlist_by?: string | null;
  require_consent?: boolean | number;
  /** Questions asked before booking (migration 021). Left out = unchanged. */
  application_form?: ApplicationQuestion[];
  photos_drive_url?: string | null;
  master_id?: string | null;
};

/** The form's questions as stored: each well-formed one kept, a half-written
 *  one dropped (the form itself refuses to save those). null = not sent. */
function questionsJson(body: WorkshopBody): string | null {
  if (!Array.isArray(body.application_form)) return null;
  const all = cleanQuestions(body.application_form);
  if (!('error' in all)) return JSON.stringify(all.questions);
  const kept = body.application_form.flatMap((q) => {
    const one = cleanQuestions([q]);
    return 'error' in one ? [] : one.questions;
  });
  return JSON.stringify(kept);
}

/** The owner is the first facilitator; co-hosts with dashboard access exclude them. */
function people(body: WorkshopBody) {
  const instructorIds = normalizeInstructorIds(body.instructor_ids, body.instructor_id);
  const dashboardAccess = (body.dashboard_access || []).filter((uid) => instructorIds.includes(uid) && uid !== instructorIds[0]);
  return { instructorIds, dashboardAccess };
}

export async function insertWorkshop(db: D1Database, id: string, body: WorkshopBody): Promise<void> {
  const { instructorIds, dashboardAccess } = people(body);
  const online = normalizeOnlineFields(body);
  await db
    .prepare(
      `INSERT INTO workshops (
        id, title, description, short_description, instructor_id, instructor_ids_json,
        workshop_type, date, end_date, dates_json,
        time_start, time_end, location, location_id,
        schedule_json, learn_json, target_json, category, tags_json,
        promo_price, promo_start, promo_end, map_url, theme_color,
        max_participants, min_age, max_age, price, image_url, image_meta, status,
        admission_type, payment_type, deposit_amount, announce_at, close_at, confirm_main_by, confirm_waitlist_by,
        require_consent, master_id, day_times_json, photos_drive_url,
        is_online, online_platform, online_platform_other, online_url,
        dashboard_access_json, application_form
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      body.title,
      body.description || null,
      body.short_description || null,
      instructorIds[0] || null,
      JSON.stringify(instructorIds),
      body.workshop_type || 'one_day',
      body.date,
      body.end_date || null,
      JSON.stringify(body.dates || []),
      body.time_start,
      body.time_end,
      body.location || null,
      body.location_id || null,
      JSON.stringify(body.schedule || []),
      JSON.stringify(body.learn_items || []),
      JSON.stringify(body.target_items || []),
      body.category || null,
      JSON.stringify((body.tags || []).filter((t) => t.trim().length > 0)),
      body.promo_price ?? null,
      body.promo_start || null,
      body.promo_end || null,
      body.map_url || null,
      body.theme_color || null,
      body.max_participants || 20,
      body.min_age ?? null,
      body.max_age ?? null,
      body.price,
      body.image_url || null,
      body.image_meta ? JSON.stringify(body.image_meta) : null,
      body.status || 'active',
      body.admission_type || 'direct',
      body.payment_type || 'paid',
      body.deposit_amount || 0,
      body.announce_at || null,
      body.close_at || null,
      body.confirm_main_by || null,
      body.confirm_waitlist_by || null,
      body.require_consent ? 1 : 0,
      body.master_id || null,
      JSON.stringify(body.day_times || []),
      body.photos_drive_url || null,
      online.is_online,
      online.platform,
      online.platform_other,
      online.url,
      JSON.stringify(dashboardAccess),
      questionsJson(body) ?? '[]',
    )
    .run();
}

export async function updateWorkshop(db: D1Database, id: string, body: WorkshopBody): Promise<void> {
  const { instructorIds, dashboardAccess } = people(body);
  const online = normalizeOnlineFields(body);
  await db
    .prepare(
      `UPDATE workshops SET
         title = ?, description = ?, short_description = ?,
         instructor_id = ?, instructor_ids_json = ?,
         workshop_type = ?, date = ?, end_date = ?, dates_json = ?,
         time_start = ?, time_end = ?, day_times_json = ?, location = ?, location_id = ?,
         schedule_json = ?, learn_json = ?, target_json = ?, category = ?, tags_json = ?,
         promo_price = ?, promo_start = ?, promo_end = ?, map_url = ?, theme_color = ?,
         max_participants = ?, min_age = ?, max_age = ?, price = ?, image_url = ?, image_meta = ?, status = ?,
         admission_type = ?, payment_type = ?, deposit_amount = ?,
         announce_at = ?, close_at = ?, confirm_main_by = ?, confirm_waitlist_by = ?,
         require_consent = ?, photos_drive_url = ?, master_id = ?,
         is_online = ?, online_platform = ?, online_platform_other = ?, online_url = ?,
         dashboard_access_json = ?, application_form = COALESCE(?, application_form),
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      body.title,
      body.description || null,
      body.short_description || null,
      instructorIds[0] || null,
      JSON.stringify(instructorIds),
      body.workshop_type || 'one_day',
      body.date,
      body.end_date || null,
      JSON.stringify(body.dates || []),
      body.time_start,
      body.time_end,
      JSON.stringify(body.day_times || []),
      body.location || null,
      body.location_id || null,
      JSON.stringify(body.schedule || []),
      JSON.stringify(body.learn_items || []),
      JSON.stringify(body.target_items || []),
      body.category || null,
      JSON.stringify((body.tags || []).filter((t) => t.trim().length > 0)),
      body.promo_price ?? null,
      body.promo_start || null,
      body.promo_end || null,
      body.map_url || null,
      body.theme_color || null,
      body.max_participants || 20,
      body.min_age ?? null,
      body.max_age ?? null,
      body.price,
      body.image_url || null,
      body.image_meta ? JSON.stringify(body.image_meta) : null,
      body.status || 'active',
      body.admission_type || 'direct',
      body.payment_type || 'paid',
      body.deposit_amount || 0,
      body.announce_at || null,
      body.close_at || null,
      body.confirm_main_by || null,
      body.confirm_waitlist_by || null,
      body.require_consent ? 1 : 0,
      body.photos_drive_url || null,
      body.master_id || null,
      online.is_online,
      online.platform,
      online.platform_other,
      online.url,
      JSON.stringify(dashboardAccess),
      questionsJson(body),
      id,
    )
    .run();
}
