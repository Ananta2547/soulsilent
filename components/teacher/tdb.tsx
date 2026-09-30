'use client';

/* Building blocks of the teacher dashboard design ("Teacher Dashboard",
 * Claude Design): the month calendar every page uses, the pager, the seat bar
 * and the small line icons. Styles live in app/host/teacher.css (tdb-*). */

import type { ReactNode } from 'react';

export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const pad = (n: number) => String(n).padStart(2, '0');
export const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayYmd = () => ymdOf(new Date());
export const dateOf = (s: string) => new Date(s + 'T00:00:00');
export const addDays = (s: string, n: number) => {
  const d = dateOf(s);
  d.setDate(d.getDate() + n);
  return ymdOf(d);
};
export type Month = { y: number; m: number };
export const monthOf = (s: string): Month => ({ y: +s.slice(0, 4), m: +s.slice(5, 7) - 1 });

export const fmtShort = (s: string) => dateOf(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
export const fmtMed = (s: string) => dateOf(s).toLocaleDateString('th-TH', { dateStyle: 'medium' });
export const fmtLong = (s: string) => dateOf(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const monShort = (s: string) => dateOf(s).toLocaleDateString('th-TH', { month: 'short' });
export const baht = (n: number | null | undefined) => (n == null ? '—' : '฿' + Math.round(n).toLocaleString());

type CalProps = {
  month: Month;
  onMonth: (m: Month) => void;
  /** Days drawn as picked (teal). */
  selected: string[];
  /** Rounds / workshops per day; a day with one is tinted. */
  marks: Record<string, number>;
  /** Text under a marked day, e.g. `3 รอบ`. */
  markLabel?: (n: number) => string;
  /** Days a pattern will open, drawn lighter than picked ones. */
  preview?: Set<string>;
  /** Days before this cannot be picked. */
  floor?: string;
  /** Only marked days (and today) can be picked. */
  onlyMarked?: boolean;
  onPick: (day: string) => void;
  /** Compact: the add-round popup's picker. */
  small?: boolean;
  /** Line under the month name; defaults to "<พ.ศ.> · N วันมี…". */
  sub?: string;
  subUnit?: string;
  onToday?: () => void;
  children?: ReactNode;
};

/** The month grid of the design — tinted days that have something, the picked
 *  day in teal, a yellow dot on today. */
export function TdbCalendar(p: CalProps) {
  const { y, m } = p.month;
  const today = todayYmd();
  const startDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: ReactNode[] = [];
  let withMarks = 0;
  for (let i = 0; i < startDow; i++) cells.push(<span key={'e' + i} />);
  for (let d = 1; d <= dim; d++) {
    const day = `${y}-${pad(m + 1)}-${pad(d)}`;
    const n = p.marks[day] || 0;
    if (n) withMarks++;
    const sel = p.selected.includes(day);
    const preview = !sel && !!p.preview?.has(day);
    const blocked = !!(p.floor && day < p.floor);
    const dim_ = !!p.onlyMarked && !n && day !== today;
    const has = n > 0 && !p.small;
    const cls = ['tdb-day', sel ? 'sel' : preview ? 'preview' : has ? 'has' : '', blocked ? 'off' : dim_ ? 'dim' : '', !sel && !has && !blocked && day < today ? 'past' : '']
      .filter(Boolean)
      .join(' ');
    const showMark = n > 0 && !(sel && p.small);
    cells.push(
      <button key={day} type="button" className={cls} disabled={blocked || dim_} onClick={() => p.onPick(day)} aria-pressed={sel}>
        <span className="d">{d}</span>
        {showMark && <span className="m">{p.markLabel ? p.markLabel(n) : p.small ? `มี ${n}` : `${n} รอบ`}</span>}
        {day === today && <span className="today" />}
      </button>,
    );
  }
  const step = (k: number) => {
    const d = new Date(y, m + k, 1);
    p.onMonth({ y: d.getFullYear(), m: d.getMonth() });
  };
  return (
    <div className={p.small ? 'tdb-cal sm' : 'tdb-cal-inner'}>
      <div className="tdb-cal-head">
        {p.small ? (
          <>
            <button type="button" className="tdb-round-btn" onClick={() => step(-1)} aria-label="เดือนก่อน">‹</button>
            <span className="tdb-cal-month">{TH_MONTHS[m]} {y + 543}</span>
            <button type="button" className="tdb-round-btn" onClick={() => step(1)} aria-label="เดือนถัดไป">›</button>
          </>
        ) : (
          <>
            <div>
              <div className="tdb-cal-month">{TH_MONTHS[m]}</div>
              <div className="tdb-cal-sub">{p.sub ?? `${y + 543} · ${withMarks} ${p.subUnit || 'วันมีรอบ'}`}</div>
            </div>
            <div className="tdb-cal-nav">
              {p.onToday && (
                <button type="button" className="tdb-soft-btn" onClick={p.onToday}>
                  วันนี้
                </button>
              )}
              <button type="button" className="tdb-round-btn" onClick={() => step(-1)} aria-label="เดือนก่อน">‹</button>
              <button type="button" className="tdb-round-btn" onClick={() => step(1)} aria-label="เดือนถัดไป">›</button>
            </div>
          </>
        )}
      </div>
      <div className="tdb-dow">
        {DOW_TH.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="tdb-days">{cells}</div>
      {p.children}
    </div>
  );
}

export function TdbPager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="tdb-pager" aria-label="เลขหน้า">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="หน้าก่อนหน้า">‹</button>
      {Array.from({ length: pageCount }, (_, i) => (
        <button key={i} type="button" className={page === i + 1 ? 'on' : ''} onClick={() => onChange(i + 1)} aria-label={`หน้า ${i + 1}`} aria-current={page === i + 1 ? 'page' : undefined}>
          {i + 1}
        </button>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="หน้าถัดไป">›</button>
    </nav>
  );
}

export function SeatBar({ booked, max, soft, full }: { booked: number; max: number; soft?: boolean; full?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((booked / max) * 100)) : 0;
  const isFull = full ?? (max > 0 && booked >= max);
  return (
    <div className="tdb-bar">
      <div className={`tdb-bar-track ${soft ? 'soft' : ''}`}>
        <div className="tdb-bar-fill" style={{ width: `${pct}%`, background: isFull ? 'var(--accent)' : 'var(--teal)' }} />
      </div>
      <span className="tdb-bar-n">
        {booked}/{max}
      </span>
    </div>
  );
}

/** Status pill with its dot: [label, text colour, background, dot colour]. */
export function Pill({ s }: { s: [string, string, string, string] }) {
  return (
    <span className="tdb-pill" style={{ background: s[2], color: s[1] }}>
      <i style={{ background: s[3] }} />
      {s[0]}
    </span>
  );
}

export const PAY_PILL = (paid: boolean) => (
  <span className="tdb-pill" style={{ background: paid ? '#eaf6f4' : '#fcefcf', color: paid ? '#075a51' : '#8a5a00' }}>
    {paid ? 'โอนแล้ว' : 'รอโอน'}
  </span>
);

export const IcoCal = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0d8a7e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="3" y="6" width="18" height="15" rx="3" />
    <path d="M8 3v4M16 3v4" />
  </svg>
);
export const IcoPin = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0d8a7e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 21.5c4.2-4.6 6.3-8 6.3-10.5A6.3 6.3 0 0 0 5.7 11c0 2.5 2.1 5.9 6.3 10.5Z" />
    <circle cx="12" cy="10.7" r="2.4" />
  </svg>
);
export const IcoClock = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0d8a7e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3.2 2.1" />
  </svg>
);
