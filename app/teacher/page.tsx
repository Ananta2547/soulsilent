'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Pager } from '@/components/teacher/Pager';

type Totals = { workshops: number; participants: number; gross: number; net: number };
type MonthTotal = { month: string; total: number; count: number };
type BookingRow = {
  id: string;
  user_name: string | null;
  workshop_title: string | null;
  amount: number;
  status: string;
  payment_status: string;
  created_at: string;
};
/** One collected payment: when it landed and how much. */
type PaidPoint = { at: string; amount: number };
type Overview = {
  totals: Totals;
  monthly: MonthTotal[];
  paidPoints: PaidPoint[];
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

  const ages = averageAge(data.ages, lang);

  return (
    <div>
      <span className="eyebrow">
        <T th="ภาพรวม · รายได้" en="overview · revenue" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '8px 0 4px' }}>
        <T th="ภาพรวมของคุณ" en="Your overview" />
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 18px' }}>
        <T
          th="ตัวเลขทั้งหมดนับเฉพาะเวิร์กชอปที่คุณเป็นผู้นำกิจกรรม"
          en="Every figure here counts only the workshops you lead."
        />
      </p>

      {/* Four figures, centred as a block: on a wide screen a stretched row of
          four leaves each number floating alone in its own acre. */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 14,
          marginBottom: 14,
          maxWidth: 880,
          marginInline: 'auto',
        }}
      >
        <StatCard label={tr(lang, 'เวิร์กชอป', 'Workshops')} value={String(data.totals.workshops)} />
        <StatCard label={tr(lang, 'ผู้เข้าร่วม', 'Participants')} value={String(data.totals.participants)} />
        <StatCard label={tr(lang, 'รายได้สุทธิ', 'Net revenue')} value={baht(data.totals.net)} />
        <StatCard label={tr(lang, 'อายุเฉลี่ยผู้เข้าร่วม', 'Average age')} value={ages} />
      </section>

      <RevenueChart points={data.paidPoints || []} lang={lang} />

      {/* Recent bookings */}
      <section className="card card-static" style={{ padding: 0, overflow: 'hidden', marginTop: 14 }}>
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--cream-deep)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 className="display-th" style={{ fontSize: 17, margin: 0 }}>
            <T th="การจองล่าสุด" en="Recent bookings" />
          </h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {tr(lang, `ไม่รวมที่ยกเลิก · ${live.length} รายการ`, `cancelled excluded · ${live.length} rows`)}
          </span>
        </div>

        {shown.length === 0 ? (
          <p style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            <T th="ยังไม่มีการจอง" en="No bookings yet" />
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--cream)' }}>
                    <Th>{tr(lang, 'เวิร์กชอป', 'Workshop')}</Th>
                    <Th>{tr(lang, 'ผู้จอง', 'Booked by')}</Th>
                    <Th align="right">{tr(lang, 'จำนวน', 'Amount')}</Th>
                    <Th>{tr(lang, 'สถานะ', 'Status')}</Th>
                    <Th align="right">{tr(lang, 'วันที่', 'Date')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => {
                    const st = bookingStatus(b, lang);
                    return (
                      <tr key={b.id} style={{ borderTop: '1px solid var(--cream-deep)' }}>
                        <Td>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.workshop_title || '—'}</span>
                        </Td>
                        <Td>{b.user_name || '—'}</Td>
                        <Td align="right">
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{baht(b.amount || 0)}</span>
                        </Td>
                        <Td>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              borderRadius: 999,
                              padding: '3px 10px',
                              background: st.bg,
                              color: st.fg,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {st.label}
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {fmtDayTime(b.created_at)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div style={{ padding: '6px 18px 12px', borderTop: '1px solid var(--cream-deep)' }}>
                <Pager page={current} pageCount={pageCount} onChange={setPage} label="หน้าการจอง" />
              </div>
            )}
          </>
        )}
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

/** A label and the number under it, both centred. No third line: the caption
 *  under every figure turned the row into four paragraphs. */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-static" style={{ padding: '14px 14px', textAlign: 'center' }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display-th)',
          fontWeight: 600,
          fontSize: 30,
          lineHeight: 1.05,
          color: 'var(--ink)',
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
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
function RevenueChart({ points, lang }: { points: PaidPoint[]; lang: 'th' | 'en' }) {
  const [hover, setHover] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState('1y');
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[RANGES.length - 1];

  const data = useMemo(() => buildSeries(points, range, lang), [points, range, lang]);
  const peak = Math.max(1, ...data.map((d) => d.total));
  const windowTotal = data.reduce((a, d) => a + d.total, 0);

  return (
    <section className="card card-static" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--cream-deep)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 className="display-th" style={{ fontSize: 17, margin: 0 }}>
            <T th="รายได้" en="Revenue" />
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' }}>
            {hover != null
              ? `${data[hover].label} · ${baht(data[hover].total)} · ${data[hover].count} ${tr(lang, 'รายการ', 'bookings')}`
              : tr(lang, `รวม ${baht(windowTotal)} ในช่วงนี้`, `${baht(windowTotal)} in this window`)}
          </p>
        </div>

        {/* Range filter, in the corner of the chart's own box. */}
        <div
          role="group"
          aria-label={tr(lang, 'ช่วงเวลาของกราฟ', 'Chart time range')}
          style={{ display: 'inline-flex', background: 'var(--cream)', borderRadius: 999, padding: 3, gap: 2 }}
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                setRangeKey(r.key);
                setHover(null);
              }}
              aria-pressed={r.key === rangeKey}
              style={{
                border: 0,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                padding: '5px 10px',
                whiteSpace: 'nowrap',
                background: r.key === rangeKey ? 'var(--paper)' : 'transparent',
                color: r.key === rangeKey ? 'var(--ink)' : 'var(--muted)',
                boxShadow: r.key === rangeKey ? '0 1px 4px rgba(13,30,29,.12)' : 'none',
              }}
            >
              {tr(lang, r.th, r.en)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 18px 16px' }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 8,
          }}
        >
          {tr(lang, `สูงสุด ${baht(peak)}`, `peak ${baht(peak)}`)}
        </div>

        <div
          style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 92 }}
          onMouseLeave={() => setHover(null)}
        >
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              title={`${d.label} · ${baht(d.total)}`}
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
                  borderRadius: '4px 4px 0 0',
                  background: hover === i ? 'var(--teal-deep)' : 'var(--teal)',
                  transition: 'background .18s cubic-bezier(.2,.7,.2,1)',
                }}
              />
            </button>
          ))}
        </div>

        {/* A handful of ticks only: one label per bar collides at any width. */}
        <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
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

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{ textAlign: align, padding: '10px 16px', fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ textAlign: align, padding: '11px 16px', color: 'var(--muted)' }}>{children}</td>;
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

function bookingStatus(b: BookingRow, lang: 'th' | 'en'): { label: string; bg: string; fg: string } {
  if (b.payment_status === 'paid' || b.status === 'confirmed') {
    return { label: tr(lang, 'ชำระแล้ว', 'Paid'), bg: 'var(--teal-50)', fg: 'var(--teal-deep)' };
  }
  return { label: tr(lang, 'รอชำระ', 'Pending'), bg: '#fcefcf', fg: '#a06a14' };
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
