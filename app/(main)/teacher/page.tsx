'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { useLoadingTracker } from '@/components/design/DataLoading';

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
type Overview = {
  totals: Totals;
  monthly: MonthTotal[];
  ages: number[];
  bookings: BookingRow[];
};

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();
const BOOKINGS_PER_PAGE = 8;

export default function TeacherOverviewPage() {
  const { lang } = useLang();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const track = useLoadingTracker();

  useEffect(() => {
    track(
      fetch('/api/teacher/overview')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<Overview>;
        })
        .then(setData)
        .catch((e) => {
          console.error('Failed to load teacher overview', e);
          setLoadError(true);
        }),
    );
  }, [track]);

  // A cancelled booking is the opposite of what this table is read for, so it
  // is dropped here.
  const live = useMemo(() => (data?.bookings || []).filter((b) => b.status !== 'cancelled'), [data]);
  const pageCount = Math.max(1, Math.ceil(live.length / BOOKINGS_PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = live.slice((current - 1) * BOOKINGS_PER_PAGE, current * BOOKINGS_PER_PAGE);

  if (loadError) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        <T th="โหลดภาพรวมไม่สำเร็จ" en="Could not load the overview" />
      </p>
    );
  }
  if (!data) return null;

  const ages = ageBand(data.ages, lang);

  return (
    <div>
      <span className="eyebrow">
        <T th="ภาพรวม · รายได้" en="overview · revenue" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(26px,3.4vw,36px)', margin: '12px 0 6px' }}>
        <T th="ภาพรวมของคุณ" en="Your overview" />
      </h1>
      <p style={{ fontSize: 14.5, color: 'var(--muted)', margin: '0 0 26px' }}>
        <T
          th="ตัวเลขทั้งหมดนับเฉพาะเวิร์กชอปที่คุณเป็นผู้นำกิจกรรม"
          en="Every figure here counts only the workshops you lead."
        />
      </p>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 14,
          marginBottom: 26,
        }}
      >
        <StatCard
          label={tr(lang, 'เวิร์กชอป', 'Workshops')}
          value={String(data.totals.workshops)}
          note={tr(lang, 'ที่คุณดูแล', 'you lead')}
        />
        <StatCard
          label={tr(lang, 'ผู้เข้าร่วม', 'Participants')}
          value={String(data.totals.participants)}
          note={tr(lang, 'ชำระแล้ว', 'paid')}
        />
        <StatCard
          label={tr(lang, 'รายได้สุทธิ', 'Net revenue')}
          value={baht(data.totals.net)}
          note={tr(lang, `ก่อนหัก ${baht(data.totals.gross)}`, `${baht(data.totals.gross)} before deductions`)}
        />
        <StatCard label={tr(lang, 'อายุเฉลี่ยผู้เข้าร่วม', 'Average age')} value={ages.label} note={ages.note} />
      </section>

      <RevenueChart months={data.monthly} lang={lang} />

      {/* Recent bookings */}
      <section className="card card-static" style={{ padding: 0, overflow: 'hidden', marginTop: 26 }}>
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 18px',
                  borderTop: '1px solid var(--cream-deep)',
                }}
              >
                <PageBtn disabled={current === 1} onClick={() => setPage(current - 1)}>‹</PageBtn>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {current} / {pageCount}
                </span>
                <PageBtn disabled={current === pageCount} onClick={() => setPage(current + 1)}>›</PageBtn>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card card-static" style={{ padding: 18 }}>
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
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display-th)',
          fontWeight: 600,
          fontSize: 27,
          lineHeight: 1.05,
          color: 'var(--ink)',
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{note}</div>
    </div>
  );
}

/**
 * Collected revenue by month. One series, so there is no legend and no palette
 * to validate — the heading says what the bars are. Bars because months are
 * discrete buckets, oldest to newest so the latest sits where the eye lands.
 * The exact numbers are in the hover readout and in each bar's accessible name.
 */
function RevenueChart({ months, lang }: { months: MonthTotal[]; lang: 'th' | 'en' }) {
  const [hover, setHover] = useState<number | null>(null);
  // The API hands back newest-first; a time axis reads the other way.
  const data = [...months].reverse();
  const peak = Math.max(1, ...data.map((m) => m.total));

  return (
    <section className="card card-static" style={{ padding: 0, overflow: 'hidden' }}>
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
        <div>
          <h2 className="display-th" style={{ fontSize: 17, margin: 0 }}>
            <T th="รายได้รายเดือน" en="Revenue by month" />
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
            <T th="เฉพาะการจองที่ชำระแล้ว · 12 เดือนล่าสุด" en="Paid bookings only · last 12 months" />
          </p>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', minHeight: 18 }}>
          {hover != null
            ? `${thaiMonth(data[hover].month, lang)} · ${baht(data[hover].total)} · ${data[hover].count} ${tr(lang, 'รายการ', 'bookings')}`
            : ''}
        </span>
      </div>

      {data.length === 0 ? (
        <p style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          <T th="ยังไม่มีรายได้" en="No revenue yet" />
        </p>
      ) : (
        <div style={{ padding: 18 }}>
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
            {tr(lang, `สูงสุด ${baht(peak)}`, `peak ${baht(peak)}`)}
          </div>

          <div
            style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150 }}
            onMouseLeave={() => setHover(null)}
          >
            {data.map((m, i) => (
              <button
                key={m.month}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${thaiMonth(m.month, lang)} ${baht(m.total)} · ${m.count} ${tr(lang, 'รายการ', 'bookings')}`}
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
                    // A month with nothing collected still gets a hairline, so a
                    // gap reads as "no money came in", not as a missing month.
                    height: `${Math.max(2, (m.total / peak) * 100)}%`,
                    borderRadius: '4px 4px 0 0',
                    background: hover === i ? 'var(--teal-deep)' : 'var(--teal)',
                    transition: 'background .18s cubic-bezier(.2,.7,.2,1)',
                  }}
                />
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
            {data.map((m, i) => (
              <span
                key={m.month}
                className="mono"
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 10,
                  color: hover === i ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                {m.month.slice(5)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
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

function PageBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: 0,
        background: 'var(--cream)',
        color: disabled ? 'var(--muted)' : 'var(--ink)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'inherit',
        fontSize: 15,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- helpers ---------------- */

/**
 * The average age as the five-year band it falls in ("26-30 ปี") rather than a
 * false-precision 27.4 — the ages themselves were only ever whole years.
 */
function ageBand(ages: number[], lang: 'th' | 'en'): { label: string; note: string } {
  if (ages.length === 0) return { label: '—', note: tr(lang, 'ยังไม่มีข้อมูลอายุ', 'no age data yet') };
  const mean = ages.reduce((a, n) => a + n, 0) / ages.length;
  const lo = Math.floor((mean - 1) / 5) * 5 + 1; // 27.4 → 26
  return {
    label: tr(lang, `${lo}-${lo + 4} ปี`, `${lo}-${lo + 4} yrs`),
    note: tr(
      lang,
      `จาก ${ages.length} คน · เฉลี่ย ${mean.toFixed(1)} ปี`,
      `${ages.length} people · mean ${mean.toFixed(1)}`,
    ),
  };
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

/** "2026-08" → "ส.ค. 69" */
function thaiMonth(ym: string, lang: 'th' | 'en'): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    month: 'short',
    year: '2-digit',
  });
}
