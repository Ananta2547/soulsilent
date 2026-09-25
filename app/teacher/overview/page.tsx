'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { computePayout } from '@/lib/workshop-utils';
import { sqliteToMs } from '@/lib/datetime';
import { TdbPager } from '@/components/teacher/tdb';

type Totals = { workshops: number; participants: number; gross: number; net: number };
type MonthTotal = { month: string; total: number; count: number };
type BookingRow = {
  id: string;
  user_name: string | null;
  /** The name written on the application — who is actually coming. */
  applicant_name: string | null;
  workshop_title: string | null;
  amount: number;
  status: string;
  payment_status: string;
  created_at: string;
};
/** One collected payment: when it landed, how much, on which workshop, from
 *  whom, and how old they said they were. */
type PaidPoint = {
  at: string;
  amount: number;
  workshop_id: string;
  person: string;
  age: number | null;
};
/** What each workshop deducts before the teacher is paid. */
type Payout = { id: string; type: 'none' | 'fixed' | 'percent'; value: number };
type Overview = {
  totals: Totals;
  monthly: MonthTotal[];
  paidPoints: PaidPoint[];
  payouts: Payout[];
  ages: number[];
  bookings: BookingRow[];
};

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

/** Rows per page. Chosen so the heading, the four figures, the chart and this
 *  table together clear a 900px window without the page scrolling. A shorter
 *  window than that does scroll — clipping the bottom of the page would be
 *  worse than a scrollbar. */
const BOOKINGS_PER_PAGE = 5;

/** The chart's range filter. `days` is how far back the bars reach; `bucket` is
 *  how wide one bar is, so a year reads as months and a day as hours. */
const RANGES = [
  { key: '1d', th: '1 วัน', en: '1D', days: 1, bucket: 'hour' as const },
  { key: '7d', th: '7 วัน', en: '7D', days: 7, bucket: 'day' as const },
  { key: '1m', th: '1 เดือน', en: '1M', days: 30, bucket: 'day' as const },
  { key: '3m', th: '3 เดือน', en: '3M', days: 90, bucket: 'week' as const },
  { key: '6m', th: '6 เดือน', en: '6M', days: 182, bucket: 'week' as const },
  { key: '1y', th: '1 ปี', en: '1Y', days: 365, bucket: 'month' as const },
];

export default function TeacherOverviewPage() {
  const { lang } = useLang();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  // The window lives up here, not inside the chart: the four figures above it
  // answer for the same slice of time, so one filter drives both.
  const [rangeKey, setRangeKey] = useState('1y');
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[RANGES.length - 1];
  // The moment the window is measured back from, fixed at mount so a
  // re-render never shifts it.
  const [now] = useState(() => Date.now());

  // Not handed to the loading tracker: the dashboard's frame — rail, headings —
  // is already on screen, and a full-screen loader over it would hide a page
  // the reader can already navigate. The skeleton below stands in instead.
  useEffect(() => {
    fetch('/api/teacher/overview')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Overview>;
      })
      .then(setData)
      .catch((e) => {
        console.error('Failed to load teacher overview', e);
        setLoadError(true);
      });
  }, []);

  // The four figures, worked out over the chosen window from the same collected
  // payments the chart draws — so "6 workshops" always means "6 in this window".
  const scoped = useMemo(() => {
    const points = data?.paidPoints || [];
    const cutoff = now - range.days * 86400000;
    const inWindow = points.filter((p) => (sqliteToMs(p.at) || 0) >= cutoff);
    const grossByWorkshop = new Map<string, number>();
    const ageByPerson = new Map<string, number>();
    for (const p of inWindow) {
      grossByWorkshop.set(p.workshop_id, (grossByWorkshop.get(p.workshop_id) || 0) + (p.amount || 0));
      if (p.age != null) ageByPerson.set(p.person, p.age);
    }
    const terms = new Map((data?.payouts || []).map((w) => [w.id, w]));
    let net = 0;
    for (const [wid, g] of grossByWorkshop) {
      const t = terms.get(wid);
      net += computePayout(g, t?.type || 'none', t?.value || 0).net;
    }
    return {
      workshops: grossByWorkshop.size,
      participants: inWindow.length,
      net,
      ages: [...ageByPerson.values()],
    };
  }, [data, range.days, now]);

  // A cancelled booking is the opposite of what this table is read for, so it
  // is dropped here.
  const live = useMemo(() => (data?.bookings || []).filter((b) => b.status !== 'cancelled'), [data]);

  const perPage = BOOKINGS_PER_PAGE;

  const pageCount = Math.max(1, Math.ceil(live.length / perPage));
  const current = Math.min(page, pageCount);
  const shown = live.slice((current - 1) * perPage, current * perPage);

  if (loadError) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        <T th="โหลดภาพรวมไม่สำเร็จ" en="Could not load the overview" />
      </p>
    );
  }
  if (!data) return <OverviewSkeleton />;

  const ages = averageAge(scoped.ages, lang);
  const windowLabel = tr(lang, `ใน ${range.th}ล่าสุด`, `last ${range.en}`);

  return (
    <div>
      <div className="tdb-head">
        <div>
          <span className="tdb-eyebrow">02 — ภาพรวม / รายได้</span>
          <h1 className="tdb-h1">ภาพรวม.</h1>
          <p className="tdb-lead">
            <T th="ตัวเลขทั้งหมดนับเฉพาะเวิร์กชอปที่คุณเป็นผู้นำกิจกรรม" en="Every figure here counts only the workshops you lead." />
          </p>
        </div>
        <RangePicker lang={lang} rangeKey={rangeKey} onRange={setRangeKey} />
      </div>

      <div className="tdb-stats four">
        <StatCard label={tr(lang, 'เวิร์กชอป', 'Workshops')} value={String(scoped.workshops)} note={windowLabel} />
        <StatCard label={tr(lang, 'ผู้เข้าร่วม', 'Participants')} value={String(scoped.participants)} note={windowLabel} />
        <StatCard label={tr(lang, 'รายได้สุทธิ', 'Net revenue')} value={baht(scoped.net)} note={windowLabel} accent />
        <StatCard label={tr(lang, 'อายุเฉลี่ยผู้เข้าร่วม', 'Average age')} value={ages} note={windowLabel} />
      </div>

      <RevenueChart points={data.paidPoints || []} lang={lang} rangeKey={rangeKey} />

      {/* Recent bookings */}
      <section className="tdb-panel" style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <h2 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 19, margin: 0 }}>
            <T th="การจองล่าสุด" en="Recent bookings" />
          </h2>
          <span className="tdb-mono-label">{tr(lang, `${live.length} รายการ`, `${live.length} rows`)}</span>
        </div>

        {shown.length === 0 ? (
          <div className="tdb-dashed" style={{ marginTop: 8 }}>
            <T th="ยังไม่มีการจอง" en="No bookings yet" />
          </div>
        ) : (
          <div className="tdb-book-list">
            {shown.map((b) => {
              const who = b.applicant_name || b.user_name || '—';
              return (
                <div key={b.id} className="tdb-book-row">
                  <span className="tdb-av in" style={{ width: 38, height: 38, fontSize: 14, background: '#eaf6f4', color: 'var(--teal-deep)' }}>
                    {(who.trim()[0] || '?').toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="tdb-book-who">{who}</span>
                    <span className="tdb-book-ws" title={b.workshop_title || undefined}>{b.workshop_title || '—'}</span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontFamily: "'Mitr', sans-serif", fontSize: 16 }}>{baht(b.amount || 0)}</span>
                    <span className="tdb-bar-n" style={{ fontSize: 11 }}>{fmtDayTime(b.created_at)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <TdbPager page={current} pageCount={pageCount} onChange={setPage} />
      </section>
    </div>
  );
}

/* ---------------- pieces ---------------- */

/** The page's own shape while its numbers load — four stat cards, a chart and a
 *  table, at the sizes the real ones occupy, so nothing jumps on arrival. */
function OverviewSkeleton() {
  return (
    <div aria-hidden>
      <div className="skel" style={{ height: 12, width: 140, marginBottom: 16 }} />
      <div className="skel" style={{ height: 34, width: 260, marginBottom: 10 }} />
      <div className="skel" style={{ height: 14, width: 340, marginBottom: 26 }} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 14,
          marginBottom: 26,
        }}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card card-static" style={{ padding: 18 }}>
            <div className="skel" style={{ height: 11, width: '60%', marginBottom: 12 }} />
            <div className="skel" style={{ height: 27, width: '45%', marginBottom: 10 }} />
            <div className="skel" style={{ height: 11, width: '70%' }} />
          </div>
        ))}
      </div>

      <div className="card card-static" style={{ padding: 18 }}>
        <div className="skel" style={{ height: 17, width: 160, marginBottom: 8 }} />
        <div className="skel" style={{ height: 12, width: 240, marginBottom: 20 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150 }}>
          {[38, 62, 30, 84, 46, 70, 26, 58, 92, 44, 66, 34].map((h, i) => (
            <div key={i} className="skel" style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0' }} />
          ))}
        </div>
      </div>

      <div className="card card-static" style={{ padding: 18, marginTop: 26 }}>
        <div className="skel" style={{ height: 17, width: 130, marginBottom: 18 }} />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div className="skel" style={{ height: 13, flex: 2 }} />
            <div className="skel" style={{ height: 13, flex: 1 }} />
            <div className="skel" style={{ height: 13, width: 70 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One cell of the stat strip: label, figure, and the window it covers. */
function StatCard({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div>
      <span className="tdb-mono-label">{label}</span>
      <b style={accent ? { color: 'var(--teal)' } : undefined}>{value}</b>
      {note && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{note}</span>}
    </div>
  );
}

/** The window the figures and the chart cover (1 วัน … 1 ปี). */
function RangePicker({ lang, rangeKey, onRange }: { lang: 'th' | 'en'; rangeKey: string; onRange: (key: string) => void }) {
  return (
    <div className="tdb-seg tdb-range" role="group" aria-label={tr(lang, 'ช่วงเวลา', 'Time range')}>
      {RANGES.map((r) => (
        <button key={r.key} type="button" className={r.key === rangeKey ? 'on' : ''} aria-pressed={r.key === rangeKey} onClick={() => onRange(r.key)}>
          {tr(lang, r.th, r.en)}
        </button>
      ))}
    </div>
  );
}

/**
 * Collected revenue over a chosen window. One series, so there is no legend and
 * no palette to validate — the heading says what the bars are. Bars because
 * each one is a discrete slice of time, oldest to newest so the latest sits
 * where the eye lands. Exact figures come from the hover readout and from each
 * bar's accessible name.
 *
 * The window is chosen in the corner (1 วัน … 1 ปี) and sets the slice as well
 * as the span: a day is read in hours, a year in months. Empty slices are still
 * drawn — a gap has to look like "nothing came in", not a missing period.
 */
function RevenueChart({ points, lang, rangeKey }: { points: PaidPoint[]; lang: 'th' | 'en'; rangeKey: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[RANGES.length - 1];

  const data = useMemo(() => buildSeries(points, range, lang), [points, range, lang]);
  const peak = Math.max(1, ...data.map((d) => d.total));
  const windowTotal = data.reduce((a, d) => a + d.total, 0);

  return (
    <section className="tdb-panel">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 24, lineHeight: 1, margin: 0 }}>
            <T th="รายได้" en="Revenue" />
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0' }}>
            {hover != null
              ? `${data[hover].label} · ${baht(data[hover].total)} · ${data[hover].count} ${tr(lang, 'รายการ', 'bookings')}`
              : tr(lang, `รวม ${baht(windowTotal)} ในช่วงนี้`, `${baht(windowTotal)} in this window`)}
          </p>
        </div>

        <span className="tdb-mono-label">{tr(lang, `สูงสุด ${baht(peak)}`, `peak ${baht(peak)}`)}</span>
      </div>

      <div>
        {/* The tooltip lives over the bars rather than in a `title`, which a
            phone never shows: there is no hover on a touch screen, so tapping a
            bar has to be what opens it. */}
        <div
          style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, height: 180 }}
          onMouseLeave={() => setHover(null)}
        >
          {hover != null && data[hover] && (
            <div
              role="status"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: `${((hover + 0.5) / data.length) * 100}%`,
                transform: `translateX(${hover < data.length / 2 ? '-20%' : '-80%'})`,
                background: 'var(--paper)',
                border: '1px solid var(--cream-deep)',
                boxShadow: '0 8px 20px -10px rgba(13,30,29,.45)',
                borderRadius: 10,
                padding: '7px 11px',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{data[hover].label}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                {data[hover].total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                {tr(lang, 'บาท', 'THB')}
              </div>
            </div>
          )}
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => setHover((cur) => (cur === i ? null : i))}
              aria-label={`${d.label} ${baht(d.total)} · ${d.count} ${tr(lang, 'รายการ', 'bookings')}`}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: '100%',
                  // An empty slice still gets a hairline, so a gap reads as "no
                  // money came in" and not as a slice that went missing.
                  height: `${Math.max(2, (d.total / peak) * 100)}%`,
                  borderRadius: '8px 8px 3px 3px',
                  background: hover === i ? 'var(--teal-deep)' : d.total ? 'var(--teal)' : 'var(--cream-deep)',
                  transition: 'background .18s cubic-bezier(.2,.7,.2,1)',
                }}
              />
            </button>
          ))}
        </div>

        {/* A handful of ticks only: one label per bar collides at any width. */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {data.map((d, i) => {
            const step = Math.max(1, Math.ceil(data.length / 6));
            const show = i % step === 0 || i === data.length - 1;
            return (
              <span
                key={d.key}
                className="mono"
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 9.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  color: hover === i ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                {show || hover === i ? d.short : ''}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type Bar = { key: string; label: string; short: string; total: number; count: number };

/** Buckets the collected payments into the fixed slices the chosen range asks
 *  for, oldest first, including the slices nothing landed in. */
function buildSeries(points: PaidPoint[], range: (typeof RANGES)[number], lang: 'th' | 'en'): Bar[] {
  const now = new Date();
  const bars: Bar[] = [];
  const locale = lang === 'th' ? 'th-TH' : 'en-GB';

  const starts: Date[] = [];
  if (range.bucket === 'hour') {
    const top = new Date(now);
    top.setMinutes(0, 0, 0);
    for (let i = 23; i >= 0; i--) starts.push(new Date(top.getTime() - i * 3600000));
  } else if (range.bucket === 'day') {
    const top = new Date(now);
    top.setHours(0, 0, 0, 0);
    for (let i = range.days - 1; i >= 0; i--) starts.push(new Date(top.getTime() - i * 86400000));
  } else if (range.bucket === 'week') {
    const top = new Date(now);
    top.setHours(0, 0, 0, 0);
    const weeks = Math.round(range.days / 7);
    for (let i = weeks - 1; i >= 0; i--) starts.push(new Date(top.getTime() - i * 7 * 86400000));
  } else {
    for (let i = 11; i >= 0; i--) starts.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  const width =
    range.bucket === 'hour'
      ? 3600000
      : range.bucket === 'day'
        ? 86400000
        : range.bucket === 'week'
          ? 7 * 86400000
          : 0;

  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].getTime();
    const to = width ? from + width : starts[i + 1] ? starts[i + 1].getTime() : Infinity;
    const inBucket = points.filter((p) => {
      const t = toMs(p.at);
      return t >= from && t < to;
    });
    const d = starts[i];
    const label =
      range.bucket === 'hour'
        ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
        : range.bucket === 'month'
          ? d.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
          : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const short =
      range.bucket === 'hour'
        ? d.toLocaleTimeString(locale, { hour: '2-digit' })
        : range.bucket === 'month'
          ? d.toLocaleDateString(locale, { month: 'short' })
          : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    bars.push({
      key: String(from),
      label,
      short,
      total: inBucket.reduce((a, p) => a + (p.amount || 0), 0),
      count: inBucket.length,
    });
  }

  return bars;
}

/* ---------------- helpers ---------------- */

/**
 * The average age as one whole number of years ("21 ปี"). The ages it averages
 * were only ever whole years, so a decimal claims a precision that is not there.
 */
function averageAge(ages: number[], lang: 'th' | 'en'): string {
  if (ages.length === 0) return '—';
  const mean = ages.reduce((a, n) => a + n, 0) / ages.length;
  return tr(lang, `${Math.round(mean)} ปี`, `${Math.round(mean)} yrs`);
}

/** SQLite writes UTC as "YYYY-MM-DD HH:MM:SS" — no T, no Z — which Safari reads
 *  as NaN and Chrome reads as local time. Normalise before parsing. */
function toMs(v: string): number {
  const t = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(t) ? 0 : t;
}

function fmtDayTime(v: string): string {
  const ms = toMs(v);
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
}
