'use client';

/* A month grid for picking one day. Used wherever a person has to point at a
 * date: the teacher opening a round, a visitor on a teacher's profile, the
 * booking popup, the check-in calendar. Days outside `enabled` (when given)
 * cannot be chosen — a round that was never opened is not a date to pick.
 * Dates are YYYY-MM-DD strings throughout, matching the workshops table. */

import { useState } from 'react';
import { useLang, tr } from '@/lib/i18n';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const EN_DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayYmd = () => ymd(new Date());

export function MonthPicker({
  value,
  onChange,
  enabled,
  min,
  marks,
  initialMonth,
  multi,
  sub,
}: {
  /** Selected day, or null. */
  value: string | null;
  onChange: (date: string) => void;
  /** When given, only these days can be picked; everything else is disabled. */
  enabled?: Set<string> | string[];
  /** Days before this cannot be picked (default: today). Pass '' for no floor. */
  min?: string;
  /** Small counts drawn under a day, e.g. how many rounds run that day. */
  marks?: Record<string, number>;
  /** Month to open on (YYYY-MM-DD); defaults to the value, else today. */
  initialMonth?: string;
  /** Extra days drawn as selected — for picking several at once. The caller
   *  toggles membership in onChange. */
  multi?: string[];
  /** A note drawn under the month name next to the year, e.g. "5 วันเปิดรอบ".
   *  Turns the header into a two-line title with the arrows on the right. */
  sub?: string;
}) {
  const { lang } = useLang();
  const enabledSet = enabled ? (enabled instanceof Set ? enabled : new Set(enabled)) : null;
  const floor = min === undefined ? todayYmd() : min;

  const seed = value || initialMonth || (multi && multi[0]) || todayYmd();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = seed.split('-').map(Number);
    return { y, m: m - 1 };
  });

  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);

  const today = todayYmd();
  const step = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const monthName = lang === 'th' ? TH_MONTHS[cursor.m] : EN_MONTHS[cursor.m];
  const year = lang === 'th' ? cursor.y + 543 : cursor.y;
  const prev = (
    <button type="button" className="mp-nav" onClick={() => step(-1)} aria-label={tr(lang, 'เดือนก่อน', 'Previous month')}>
      ‹
    </button>
  );
  const next = (
    <button type="button" className="mp-nav" onClick={() => step(1)} aria-label={tr(lang, 'เดือนถัดไป', 'Next month')}>
      ›
    </button>
  );

  return (
    <div className="mp">
      {sub ? (
        <div className="mp-head mp-head-sub">
          <div>
            <div className="mp-month">{monthName}</div>
            <div className="mp-sub">{year} · {sub}</div>
          </div>
          <div className="mp-navs">{prev}{next}</div>
        </div>
      ) : (
        <div className="mp-head">
          {prev}
          <span className="mp-month">{monthName} {year}</span>
          {next}
        </div>
      )}
      <div className="mp-grid mp-dow">
        {(lang === 'th' ? TH_DOW : EN_DOW).map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mp-grid">
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const disabled = (floor && day < floor) || (enabledSet ? !enabledSet.has(day) : false);
          const selected = value === day || (multi ? multi.includes(day) : false);
          const count = marks?.[day];
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onChange(day)}
              aria-pressed={selected}
              className={`mp-day${selected ? ' on' : ''}${day === today ? ' today' : ''}${enabledSet?.has(day) ? ' has' : ''}`}
            >
              <span className="mp-num">{Number(day.slice(-2))}</span>
              {count ? <span className="mp-mark">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
