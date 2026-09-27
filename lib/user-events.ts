/**
 * Personal calendar events (ลงกิจกรรม on /calendar) — shared by the API and
 * the page. See migrations/062_user_events.sql.
 */
import { isDay } from '@/lib/diary';

export type EventKind = 'me' | 'study' | 'meet' | 'trip';

export type UserEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  ts: string;
  te: string;
  kind: EventKind;
  note: string;
};

export const EVENT_KINDS: { key: EventKind; label: string; bg: string; fg: string; c: string }[] = [
  { key: 'me', label: 'ส่วนตัว', bg: '#ede5cf', fg: '#4a4231', c: '#b9a67a' },
  { key: 'study', label: 'เรียน', bg: '#dce5f1', fg: '#3d5478', c: '#7f95b8' },
  { key: 'meet', label: 'นัดหมาย', bg: '#f5dbe3', fg: '#8a3d52', c: '#d98fa2' },
  { key: 'trip', label: 'เดินทาง', bg: '#e4def0', fg: '#4f4270', c: '#9b86c2' },
];
export const EVENT_KIND: Record<EventKind, (typeof EVENT_KINDS)[number]> = Object.fromEntries(EVENT_KINDS.map((k) => [k.key, k])) as Record<
  EventKind,
  (typeof EVENT_KINDS)[number]
>;

export const MAX_TITLE = 120;
export const MAX_NOTE = 500;
/** Longest span one event may cover, in days. */
export const MAX_SPAN_DAYS = 62;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isKind = (v: unknown): v is EventKind => v === 'me' || v === 'study' || v === 'meet' || v === 'trip';

export type EventRow = {
  id: string;
  title: string;
  start_day: string;
  end_day: string;
  all_day: number;
  time_start: string | null;
  time_end: string | null;
  kind: string;
  note: string | null;
};

export function eventFromRow(r: EventRow): UserEvent {
  return {
    id: r.id,
    title: r.title,
    start: r.start_day,
    end: r.end_day,
    allDay: !!r.all_day,
    ts: r.time_start || '',
    te: r.time_end || '',
    kind: isKind(r.kind) ? r.kind : 'me',
    note: r.note || '',
  };
}

/** Validates a create/update body. Error messages are shown to the user. */
export function cleanEvent(raw: unknown): { ok: true; value: Omit<UserEvent, 'id'> } | { ok: false; error: string } {
  const b = (raw || {}) as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, MAX_TITLE) : '';
  if (!title) return { ok: false, error: 'ใส่ชื่อกิจกรรมก่อนนะ' };
  if (!isDay(b.start) || !isDay(b.end)) return { ok: false, error: 'วันที่ไม่ถูกต้อง' };
  const start = b.start as string;
  const end = b.end as string;
  if (end < start) return { ok: false, error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' };
  const span = (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000;
  if (span > MAX_SPAN_DAYS) return { ok: false, error: `กิจกรรมหนึ่งยาวได้ไม่เกิน ${MAX_SPAN_DAYS} วัน` };
  const allDay = !!b.allDay;
  let ts = '';
  let te = '';
  if (!allDay) {
    ts = typeof b.ts === 'string' && TIME_RE.test(b.ts) ? b.ts : '';
    te = typeof b.te === 'string' && TIME_RE.test(b.te) ? b.te : '';
    if (!ts) return { ok: false, error: 'ใส่เวลาเริ่ม หรือเลือก "ทั้งวัน"' };
    if (te && start === end && te < ts) return { ok: false, error: 'เวลาจบต้องไม่ก่อนเวลาเริ่ม' };
  }
  const kind = isKind(b.kind) ? b.kind : 'me';
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, MAX_NOTE) : '';
  return { ok: true, value: { title, start, end, allDay, ts, te, kind, note } };
}
