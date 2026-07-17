/**
 * Centralized date/time formatting — military (24-hour) time everywhere.
 *
 * The whole site shows clock time in 24-hour notation (ISO 8601 style, no
 * AM/PM). We pin `hourCycle: 'h23'` and a 24-hour locale so output stays
 * military regardless of the user's OS locale. Dates remain localized
 * (th-TH / en-GB) but the time component is always HH:MM.
 *
 * Workshop `time_start`/`time_end` are already stored as 24-hour "HH:MM"
 * strings and can be rendered raw.
 */

type Lang = 'th' | 'en';

function localeFor(lang: Lang): string {
  // Both are 24-hour locales; en-GB avoids the US AM/PM default.
  return lang === 'th' ? 'th-TH' : 'en-GB';
}

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date + 24-hour time, e.g. "30 มิ.ย. 2026 13:00" / "30 Jun 2026, 13:00". */
export function fmtDateTime(
  value: string | number | Date | null | undefined,
  lang: Lang,
  dateStyle: 'short' | 'medium' | 'long' = 'medium'
): string {
  if (value == null) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString(localeFor(lang), { dateStyle, timeStyle: 'short', hourCycle: 'h23' });
}

/** Date only (no time), localized. */
export function fmtDate(
  value: string | number | Date | null | undefined,
  lang: Lang,
  dateStyle: 'short' | 'medium' | 'long' = 'medium'
): string {
  if (value == null) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(localeFor(lang), { dateStyle });
}

/**
 * Parse a SQLite datetime (from `datetime('now', ...)`) to epoch ms.
 * SQLite returns UTC as "YYYY-MM-DD HH:MM:SS" with NO timezone marker; the JS
 * Date constructor would treat that as LOCAL time, shifting it by the tz offset
 * (e.g. -7h in Thailand). Normalize to explicit UTC so countdowns are correct.
 */
export function sqliteToMs(v: string | null | undefined): number {
  if (!v) return NaN;
  const s = v.trim();
  // "YYYY-MM-DD HH:MM[:SS]" or ISO-without-tz → mark as UTC.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z').getTime();
  }
  return new Date(s).getTime();
}

/** 24-hour clock time only, e.g. "13:00". */
export function fmtTime(value: string | number | Date | null | undefined, lang: Lang): string {
  if (value == null) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString(localeFor(lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
