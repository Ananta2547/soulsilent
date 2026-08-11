import type { ScheduleDay, ScheduleItem, Workshop } from './types';

export function safeParseArray<T>(json: string | null | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function getWorkshopTags(w: Workshop): string[] {
  return safeParseArray<string>(w.tags_json, []);
}

type DateShape = Pick<Workshop, 'workshop_type' | 'date' | 'end_date' | 'dates_json' | 'time_end'>;

/** Ordered list of YYYY-MM-DD the workshop runs on (1 for one-day, a range for
 *  multi-day, the explicit list for multi-part). */
export function getWorkshopDays(w: DateShape): string[] {
  const t = w.workshop_type || 'one_day';
  if (t === 'multi_part') {
    const d = safeParseArray<string>(w.dates_json, []);
    return d.length ? [...new Set(d)].sort() : [w.date];
  }
  if (t === 'multi_day' && w.end_date && w.end_date >= w.date) {
    const out: string[] = [];
    const start = new Date(w.date + 'T00:00:00');
    const end = new Date(w.end_date + 'T00:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    // Format from LOCAL date parts — toISOString() would shift the day by one
    // for clients east of UTC (e.g. UTC+7 Bangkok), since the loop date sits at
    // local midnight.
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    return out.length ? out : [w.date];
  }
  return [w.date];
}

/** End moment of the whole workshop (last day at time_end).
 *  Times are Asia/Bangkok (UTC+7) — pin the offset so browser & UTC Worker agree. */
export function getWorkshopEnd(w: DateShape): Date {
  const days = getWorkshopDays(w);
  const last = days[days.length - 1] || w.date;
  return new Date(`${last}T${w.time_end || '23:59'}:00+07:00`);
}

/** True once the workshop has finished — used to lock check-in. */
export function hasWorkshopEnded(w: DateShape, now: Date = new Date()): boolean {
  const end = getWorkshopEnd(w);
  return !Number.isNaN(end.getTime()) && now > end;
}

/** Shape with per-day times, for precise start/end that honor day_times_json. */
type TimeShape = Pick<Workshop, 'workshop_type' | 'date' | 'end_date' | 'dates_json' | 'time_start' | 'time_end' | 'day_times_json'>;

function dayTime(w: TimeShape, dateStr: string, which: 'time_start' | 'time_end'): string {
  try {
    const dts = JSON.parse(w.day_times_json || '[]');
    if (Array.isArray(dts)) {
      const m = dts.find((d) => d && d.date === dateStr);
      if (m && m[which]) return m[which] as string;
    }
  } catch {}
  return (which === 'time_start' ? w.time_start : w.time_end) || (which === 'time_start' ? '00:00' : '23:59');
}

// Workshop date/time strings are venue-local = Asia/Bangkok (UTC+7, no DST).
// Pin the offset explicitly so the SAME absolute moment is computed on the
// browser (any timezone) AND the Cloudflare Worker (runs in UTC) — otherwise a
// Thai user sees "ongoing" while the UTC server thinks it's 7h off (→ 403).
const TH_OFFSET = '+07:00';

/** Start moment (first day) honoring per-day times. */
export function getWorkshopStart(w: TimeShape): Date {
  const days = getWorkshopDays(w);
  const first = days[0] || w.date;
  return new Date(`${first}T${dayTime(w, first, 'time_start')}:00${TH_OFFSET}`);
}

/** Precise final moment — the last day's own end time (multi-day aware). */
export function getWorkshopEndPrecise(w: TimeShape): Date {
  const days = getWorkshopDays(w);
  const last = days[days.length - 1] || w.date;
  return new Date(`${last}T${dayTime(w, last, 'time_end')}:00${TH_OFFSET}`);
}

/** True while the event is happening — from the start until the final day's end. */
export function isWorkshopOngoing(w: TimeShape, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= getWorkshopStart(w).getTime() && t <= getWorkshopEndPrecise(w).getTime();
}

/** Net organizer payout = gross minus a fixed amount or a percentage. */
export function computePayout(
  gross: number,
  type: 'none' | 'fixed' | 'percent',
  value: number,
): { deduction: number; net: number } {
  let deduction = 0;
  if (type === 'fixed') deduction = Math.max(0, value || 0);
  else if (type === 'percent') deduction = (gross * Math.max(0, Math.min(100, value || 0))) / 100;
  deduction = Math.min(deduction, gross);
  return { deduction: Math.round(deduction), net: Math.max(0, Math.round(gross - deduction)) };
}

/**
 * Normalize `schedule_json` into day-groups. Handles both shapes:
 *   - new: `[{ label, items: [{time, detail}] }]`
 *   - old: flat `[{time, detail}]` → wrapped into a single unlabeled day
 * Empty items/days are dropped so callers can rely on the result being clean.
 */
export function parseSchedule(json: string | null | undefined): ScheduleDay[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const first = raw[0] as Record<string, unknown>;
  const isGrouped = first && typeof first === 'object' && 'items' in first;

  const days: ScheduleDay[] = isGrouped
    ? (raw as ScheduleDay[]).map((d) => ({
        label: typeof d?.label === 'string' ? d.label : '',
        items: Array.isArray(d?.items) ? d.items : [],
      }))
    : [{ label: '', items: raw as ScheduleItem[] }];

  // Drop empty rows + empty days.
  return days
    .map((d) => ({
      label: d.label,
      items: d.items.filter((it) => it && (it.time?.trim() || it.detail?.trim())),
    }))
    .filter((d) => d.items.length > 0 || d.label.trim().length > 0);
}

/**
 * Extract lat/lng (and optional zoom) from a Google Maps URL.
 * Handles the common shapes:
 *   - `!3d13.7437!4d100.4886` inside `.../data=!4m...`  — the actual pin
 *   - `.../@13.7437,100.4886,17z/...`                    — viewport center
 *   - `?q=13.7437,100.4886`                              — search-by-coords
 *   - `?ll=13.7437,100.4886&z=15`                        — legacy params
 *
 * **Pin (`!3d!4d`) wins over viewport (`@`)** — on a /maps/place/ URL the @
 * coords are where the camera is parked, which can be hundreds of metres
 * away from the actual marker. The marker lives in the `!3d…!4d…` segment.
 *
 * Returns null if no coords can be found (e.g. short link `maps.app.goo.gl/...`
 * which only redirects to the real URL — server has to resolve those).
 */
export function parseMapCoords(url: string | null | undefined): {
  lat: number;
  lng: number;
  zoom?: number;
} | null {
  if (!url) return null;
  const u = url.trim();

  // 1) !3dLAT!4dLNG = real pin location. Try first so we don't get fooled by
  //    the @viewport coords that always accompany a place URL.
  const placeMatch = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (placeMatch) {
    // Pair with @ zoom if present — gives a sensible default level
    const zMatch = u.match(/@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,(\d+(?:\.\d+)?)z/);
    return {
      lat: parseFloat(placeMatch[1]),
      lng: parseFloat(placeMatch[2]),
      zoom: zMatch ? Math.round(parseFloat(zMatch[1])) : undefined,
    };
  }

  // 2) @LAT,LNG,ZOOMz — viewport center (used when no pin info exists)
  const atMatch = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/);
  if (atMatch) {
    return {
      lat: parseFloat(atMatch[1]),
      lng: parseFloat(atMatch[2]),
      zoom: atMatch[3] ? Math.round(parseFloat(atMatch[3])) : undefined,
    };
  }

  // 3) q=LAT,LNG or ll=LAT,LNG query params
  try {
    const parsed = new URL(u);
    const qVal = parsed.searchParams.get('q') || parsed.searchParams.get('ll');
    if (qVal) {
      const m = qVal.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (m) {
        const zParam = parsed.searchParams.get('z');
        return {
          lat: parseFloat(m[1]),
          lng: parseFloat(m[2]),
          zoom: zParam ? parseInt(zParam, 10) : undefined,
        };
      }
    }
  } catch {
    // not a valid URL — skip
  }

  return null;
}

/** Build an embed-iframe URL from coords. */
export function coordsToEmbedSrc(lat: number, lng: number, zoom = 16): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
}

/** Is this a Google Maps short link that needs server-side resolving? */
export function isShortMapLink(url: string): boolean {
  return /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url.trim());
}

/**
 * Returns the effective price + whether a promo is currently active.
 * A promo is active when: promo_price is set AND today is within [start, end]
 * (start/end optional — open-ended is allowed).
 */
export function getEffectivePrice(w: Workshop, now: Date = new Date()):
  | { price: number; isPromo: false; originalPrice: number }
  | { price: number; isPromo: true; originalPrice: number; promoEnd: string | null } {
  const original = w.price;

  if (w.promo_price == null || w.promo_price >= original) {
    return { price: original, isPromo: false, originalPrice: original };
  }

  // Compare in Thailand wall-clock (UTC+7). Bounds may be date-only (legacy,
  // "YYYY-MM-DD") or datetime ("YYYY-MM-DDTHH:MM"). A date-only start counts
  // from 00:00 of that day, a date-only end through 23:59 — so old records keep
  // their whole-day semantics while new records honour the chosen time.
  const nowStr = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16);
  const startBound = w.promo_start
    ? w.promo_start.length <= 10
      ? `${w.promo_start}T00:00`
      : w.promo_start
    : null;
  const endBound = w.promo_end
    ? w.promo_end.length <= 10
      ? `${w.promo_end}T23:59`
      : w.promo_end
    : null;
  const inRange =
    (!startBound || startBound <= nowStr) && (!endBound || endBound >= nowStr);

  if (!inRange) {
    return { price: original, isPromo: false, originalPrice: original };
  }

  return {
    price: w.promo_price,
    isPromo: true,
    originalPrice: original,
    promoEnd: w.promo_end,
  };
}

/** How long a freshly-created workshop wears the "ใหม่" (New) badge. */
export const NEW_WORKSHOP_DAYS = 7;

/** True for NEW_WORKSHOP_DAYS days after the workshop was created — but never
 *  once the event itself is over (a past event is never "new").
 *  created_at is stored UTC ("YYYY-MM-DD HH:MM:SS") — normalise to ISO/UTC. */
export function isNewWorkshop(
  w: { created_at?: string | null } & Partial<DateShape>,
  now: Date = new Date(),
): boolean {
  if (!w.created_at) return false;
  // Past event → drop the "New" ribbon regardless of how recently it was created.
  if (w.date && hasWorkshopEnded(w as DateShape, now)) return false;
  const iso = w.created_at.includes('T') ? w.created_at : w.created_at.replace(' ', 'T') + 'Z';
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return false;
  return now.getTime() - created.getTime() < NEW_WORKSHOP_DAYS * 24 * 60 * 60 * 1000;
}

/** True once the event's start moment has passed — booking auto-closes then. */
export function hasWorkshopStarted(w: TimeShape, now: Date = new Date()): boolean {
  const start = getWorkshopStart(w);
  return !Number.isNaN(start.getTime()) && now.getTime() >= start.getTime();
}

/** Seats are full when non-cancelled bookings reach the quota. Selection
 *  workshops admit by review (no seat race), so they're never "full" this way.
 *  Needs `booking_count` (present on list + detail API responses). */
export function isWorkshopFull(w: Workshop): boolean {
  if (w.admission_type === 'selection') return false;
  if (w.booking_count == null || !w.max_participants) return false;
  return w.booking_count >= w.max_participants;
}

/** Public booking-status badge. active = open (accent), everything else
 *  non-draft = closed (muted). Draft is never shown publicly. Once the event
 *  has STARTED, booking auto-closes → "ปิดรับ" regardless of the stored status. */
export function getWorkshopStatusBadge(w: Workshop, now: Date = new Date()): { label: string; open: boolean } {
  let open = w.status === 'active' && !hasWorkshopStarted(w, now);
  // Selection: booking (applications) close once the results are announced —
  // after that it's the confirm phase for the already-selected, not open to new
  // applicants. announce_at is Thai wall-clock ("YYYY-MM-DDTHH:MM").
  if (open && w.admission_type === 'selection' && w.announce_at) {
    const ann = new Date(`${w.announce_at}:00${TH_OFFSET}`).getTime();
    if (!Number.isNaN(ann) && now.getTime() >= ann) open = false;
  }
  return { label: open ? 'เปิดจอง' : 'ปิดรับ', open };
}

/** created_at (stored UTC "YYYY-MM-DD HH:MM:SS") as epoch ms, 0 if unparseable. */
function createdAtMs(w: { created_at?: string | null }): number {
  if (!w.created_at) return 0;
  const iso = w.created_at.includes('T') ? w.created_at : w.created_at.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Public listing order — three groups, each sorted differently:
 *   1. New (≤7d, not yet ended)  → newest created first (created_at DESC)
 *   2. Open (accepting bookings) → soonest event date first (start ASC)
 *   3. Closed (full / ended)     → most recently passed first (start DESC)
 *  "Open" uses the effective badge so a started (auto-closed) workshop sinks
 *  into the Closed group. */
export function compareWorkshopsForListing(a: Workshop, b: Workshop, now: Date = new Date()): number {
  const rank = (w: Workshop) => (isNewWorkshop(w, now) ? 0 : getWorkshopStatusBadge(w, now).open ? 1 : 2);
  const ra = rank(a);
  const diff = ra - rank(b);
  if (diff !== 0) return diff;
  if (ra === 0) return createdAtMs(b) - createdAtMs(a); // New: newest created first
  if (ra === 1) return getWorkshopStart(a).getTime() - getWorkshopStart(b).getTime(); // Open: soonest first
  return getWorkshopStart(b).getTime() - getWorkshopStart(a).getTime(); // Closed: latest date first
}
