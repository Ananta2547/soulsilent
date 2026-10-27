/**
 * Settings of a round activity that reach every round (migration 077):
 * its status, the age limit, when booking closes, and the AAR survey.
 *
 * Rounds are copies of the master, so each setting is written into the
 * rounds that have not happened yet — the booking, invite, transfer and
 * card code already read the round's own min_age / max_age / close_at.
 */
import type { MasterStatus } from '@/lib/types';
import { sanitizeQuestions, type SurveyQuestion } from '@/lib/survey';

type DB = D1Database;

export const MASTER_STATUSES: { key: MasterStatus; label: string; hint: string }[] = [
  { key: 'open', label: 'เปิด', hint: 'แสดงบนเว็บ จองได้ ผู้จัดเปิดรอบได้' },
  { key: 'paused', label: 'ปิดรับชั่วคราว', hint: 'ยังแสดงบนเว็บแต่จองไม่ได้ ผู้จัดเปิดรอบใหม่ไม่ได้' },
  { key: 'draft', label: 'ฉบับร่าง', hint: 'ซ่อนจากหน้าเว็บ ผู้จัดเตรียมรอบไว้ก่อนได้' },
  { key: 'archived', label: 'เก็บถาวร', hint: 'ซ่อนทุกที่ เปิดรอบใหม่ไม่ได้ รอบที่มีคนจองแล้วยังจัดตามเดิม' },
];
export const STATUS_LABEL: Record<MasterStatus, string> = Object.fromEntries(MASTER_STATUSES.map((s) => [s.key, s.label])) as Record<MasterStatus, string>;

export const statusOf = (v: unknown): MasterStatus => (v === 'paused' || v === 'draft' || v === 'archived' ? v : 'open');
/** Not on the public site (listing, activity page). */
export const isHiddenStatus = (s: string | null | undefined) => s === 'draft' || s === 'archived';
/** The host may open new rounds. */
export const canOpenRounds = (s: string | null | undefined) => !s || s === 'open' || s === 'draft';

/** SQL (alias of workshop_masters) that keeps hidden activities off the public site. */
export const visibleMasterSql = (m: string) => `COALESCE(${m}.activity_status, 'open') NOT IN ('draft', 'archived')`;

/** A close_at long past: booking reads "ปิดรับ" while the activity is not open. */
export const CLOSED_AT = '2000-01-01T00:00';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** { days, time } from a form, or an error. days empty = no early close. */
export function cleanCloseRule(days: unknown, time: unknown): { days: number | null; time: string | null } | { error: string } {
  if (days === null || days === undefined || days === '') return { days: null, time: null };
  const n = Number(days);
  if (!Number.isInteger(n) || n < 0 || n > 365) return { error: 'จำนวนวันปิดรับต้องเป็น 0–365' };
  const t = typeof time === 'string' && time ? time : '23:59';
  if (!TIME_RE.test(t)) return { error: 'เวลาปิดรับไม่ถูกต้อง' };
  return { days: n, time: t };
}

/** When booking for a round on `date` closes ("YYYY-MM-DDTHH:MM", Thai time), or null. */
export function roundCloseAt(date: string, rule: { activity_status?: string | null; close_days_before?: number | null; close_time?: string | null }): string | null {
  if (rule.activity_status && rule.activity_status !== 'open') return CLOSED_AT;
  if (rule.close_days_before == null) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - rule.close_days_before);
  return `${d.toISOString().slice(0, 10)}T${rule.close_time || '23:59'}`;
}

/** The close rule in words, for forms. */
export function closeRuleText(days: string | number | null | undefined, time: string | null | undefined): string {
  if (days === null || days === undefined || String(days).trim() === '') return 'เปิดรับจองจนรอบเริ่ม';
  const n = Number(days);
  return `${n === 0 ? 'ปิดรับจองวันกิจกรรม' : `ปิดรับจอง ${n} วันก่อนวันกิจกรรม`} เวลา ${time || '23:59'} น.`;
}

/** Ages from a form: whole years 0–120, empty = no limit. */
export function cleanAges(min: unknown, max: unknown): { min: number | null; max: number | null } | { error: string } {
  const one = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const a = one(min);
  const b = one(max);
  for (const v of [a, b]) if (v !== null && (!Number.isInteger(v) || v < 0 || v > 120)) return { error: 'อายุต้องเป็นจำนวนเต็ม 0–120' };
  if (a !== null && b !== null && a > b) return { error: 'อายุต่ำสุดต้องไม่มากกว่าอายุสูงสุด' };
  return { min: a, max: b };
}

/** Rounds the settings still reach: not cancelled, today (Thai) or later. */
const UPCOMING = "master_id = ? AND status != 'cancelled' AND date >= date('now', '+7 hours')";

/** Write the activity's status + close rule + ages into its upcoming rounds. */
export async function syncRounds(db: DB, masterId: string): Promise<void> {
  const m = await db
    .prepare('SELECT activity_status, close_days_before, close_time, age_min, age_max FROM workshop_masters WHERE id = ?')
    .bind(masterId)
    .first<{ activity_status: string | null; close_days_before: number | null; close_time: string | null; age_min: number | null; age_max: number | null }>();
  if (!m) return;
  const closes =
    m.activity_status && m.activity_status !== 'open'
      ? db.prepare(`UPDATE workshops SET close_at = ? WHERE ${UPCOMING}`).bind(CLOSED_AT, masterId)
      : m.close_days_before == null
        ? db.prepare(`UPDATE workshops SET close_at = NULL WHERE ${UPCOMING}`).bind(masterId)
        : db
            .prepare(`UPDATE workshops SET close_at = date(date, ?) || 'T' || ? WHERE ${UPCOMING}`)
            .bind(`-${m.close_days_before} days`, m.close_time || '23:59', masterId);
  await db.batch([closes, db.prepare(`UPDATE workshops SET min_age = ?, max_age = ? WHERE ${UPCOMING}`).bind(m.age_min, m.age_max, masterId)]);
}

// ---- the activity's AAR survey -------------------------------------------

export type MasterSurvey = { title: string | null; intro: string | null; questions: SurveyQuestion[] };

export function parseMasterSurvey(json: string | null | undefined): MasterSurvey | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as { title?: unknown; intro?: unknown; questions?: unknown };
    const { questions, error } = sanitizeQuestions(v.questions);
    if (error) return null;
    return { title: typeof v.title === 'string' ? v.title : null, intro: typeof v.intro === 'string' ? v.intro : null, questions };
  } catch {
    return null;
  }
}

/** Give a round the activity's survey if it has none yet (open for answers). */
export async function ensureRoundSurvey(db: DB, workshopId: string, surveyJson: string | null | undefined, createdBy: string | null): Promise<void> {
  const s = parseMasterSurvey(surveyJson);
  if (!s) return;
  await db
    .prepare(
      `INSERT INTO surveys (id, workshop_id, title, intro, questions_json, is_open, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(workshop_id) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), workshopId, s.title, s.intro, JSON.stringify(s.questions), createdBy)
    .run();
}
