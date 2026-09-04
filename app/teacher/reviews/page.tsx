'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Stars } from '@/components/design/Icon';
import { Pager } from '@/components/teacher/Pager';

/** Cards per page — the stats, the filter row and four cards clear a 900px
 *  window without the page scrolling. */
const PER_PAGE = 4;

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  featured: number;
  created_at: string;
  user_name: string | null;
  workshop_id: string;
  workshop_title: string | null;
};

export default function TeacherReviewsPage() {
  const { lang } = useLang();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  /** '' = every workshop. Otherwise only reviews of that one. */
  const [wsFilter, setWsFilter] = useState('');
  const [page, setPage] = useState(1);

  // Not handed to the loading tracker — see the overview page: the dashboard
  // frame is already drawn, so this page shows its own skeleton instead of
  // being covered by the site-wide loading screen.
  useEffect(() => {
    fetch('/api/teacher/reviews')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ reviews: ReviewRow[] }>;
      })
      .then((d) => setRows(d.reviews || []))
      .catch((e) => {
        console.error('Failed to load teacher reviews', e);
        setLoadError(true);
      });
  }, []);

  const all = useMemo(() => rows || [], [rows]);

  // Stars are 1-5, so a mean is meaningful; guard the empty list.
  const avg = all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : 0;

  /** Only workshops that actually have a review — an option matching nothing is
   *  worse than no option at all. */
  const workshops = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of all) if (!seen.has(r.workshop_id)) seen.set(r.workshop_id, r.workshop_title || '—');
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], 'th'));
  }, [all]);

  const visible = useMemo(() => {
    const filtered = wsFilter ? all.filter((r) => r.workshop_id === wsFilter) : all;
    // Sorted on parsed time rather than the API's order, which stops meaning
    // anything once a filter has been applied.
    return [...filtered].sort((a, b) => {
      const d = toMs(a.created_at) - toMs(b.created_at);
      return sort === 'newest' ? -d : d;
    });
  }, [all, wsFilter, sort]);

  const perPage = PER_PAGE;

  const pageCount = Math.max(1, Math.ceil(visible.length / perPage));
  const current = Math.min(page, pageCount);
  const shown = visible.slice((current - 1) * perPage, current * perPage);

  if (loadError) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        <T th="โหลดรีวิวไม่สำเร็จ" en="Could not load reviews" />
      </p>
    );
  }
  if (rows === null) return <ReviewsSkeleton />;

  return (
    <div>
      <span className="eyebrow">
        <T th="คำติชม" en="feedback" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '8px 0 4px' }}>
        <T th="รีวิวที่คุณได้รับ" en="Your reviews" />
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 18px' }}>
        <T th="สิ่งที่ผู้เข้าร่วมเขียนถึงเวิร์กชอปของคุณ" en="What participants wrote about your workshops." />
      </p>

      {/* Headline numbers */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 22,
        }}
      >
        {/* The number is the point of each box: label above, figure below, both
            centred, and nothing else competing with them. */}
        <div className="card card-static" style={{ padding: '18px 14px', textAlign: 'center' }}>
          <div className="mono" style={LABEL}>
            {tr(lang, 'ดาวเฉลี่ย', 'Average rating')}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10 }}>
            <span style={BIG}>{all.length ? avg.toFixed(1) : '—'}</span>
            {all.length > 0 && <Stars value={Math.round(avg)} size={15} />}
          </div>
        </div>

        <div className="card card-static" style={{ padding: '18px 14px', textAlign: 'center' }}>
          <div className="mono" style={LABEL}>
            {tr(lang, 'รีวิวทั้งหมด', 'Total reviews')}
          </div>
          <div style={BIG}>{all.length.toLocaleString()}</div>
        </div>
      </section>

      {all.length === 0 ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            <T th="ยังไม่มีรีวิว" en="No reviews yet" />
          </p>
        </div>
      ) : (
        <>
          {/* Sort + filter, one row above the list */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', background: 'var(--cream)', borderRadius: 999, padding: 3 }}>
              {(
                [
                  ['newest', tr(lang, 'ล่าสุด', 'Newest')],
                  ['oldest', tr(lang, 'เก่าสุด', 'Oldest')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSort(key); setPage(1); }}
                  aria-pressed={sort === key}
                  style={{
                    border: 0,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 999,
                    padding: '6px 14px',
                    background: sort === key ? 'var(--paper)' : 'transparent',
                    color: sort === key ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: sort === key ? '0 1px 4px rgba(13,30,29,.12)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={wsFilter}
              onChange={(e) => { setWsFilter(e.target.value); setPage(1); }}
              aria-label={tr(lang, 'แยกรายการตามเวิร์กชอป', 'Filter by workshop')}
              className="field"
              style={{ width: 'auto', maxWidth: 280, padding: '8px 14px', fontSize: 13 }}
            >
              <option value="">{tr(lang, 'แยกรายการ — ทุกเวิร์กชอป', 'All workshops')}</option>
              {workshops.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>

            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
              {tr(lang, `แสดง ${visible.length} รีวิว`, `showing ${visible.length}`)}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="card card-static" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ color: 'var(--muted)', margin: 0 }}>
                <T th="ไม่มีรีวิวของเวิร์กชอปนี้" en="No reviews for this workshop" />
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shown.map((r) => (
                <article
                  key={r.id}
                  className="card card-static"
                  style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    {/* Who wrote it and which workshop it is about lead the card:
                        those two together are what identifies a review. */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14.5 }}>
                        {r.user_name || '—'}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>·</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--teal-deep)' }}>
                        {r.workshop_title || '—'}
                      </span>
                      <Stars value={r.rating} size={13} />
                    </div>
                    {r.comment && (
                      <p
                        style={{
                          fontSize: 14,
                          lineHeight: 1.65,
                          color: 'var(--ink)',
                          margin: '8px 0 0',
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {r.comment}
                      </p>
                    )}
                  </div>

                  <time
                    dateTime={r.created_at}
                    className="mono"
                    style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}
                  >
                    {fmtReviewedAt(r.created_at)}
                  </time>
                </article>
              ))}
              <Pager page={current} pageCount={pageCount} onChange={setPage} label="หน้ารีวิว" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Two stat cards over a list of review cards, at the real sizes. */
function ReviewsSkeleton() {
  return (
    <div aria-hidden>
      <div className="skel" style={{ height: 12, width: 100, marginBottom: 16 }} />
      <div className="skel" style={{ height: 34, width: 240, marginBottom: 10 }} />
      <div className="skel" style={{ height: 14, width: 320, marginBottom: 26 }} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 22,
        }}
      >
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="card card-static" style={{ padding: 18 }}>
            <div className="skel" style={{ height: 11, width: '55%', marginBottom: 12 }} />
            <div className="skel" style={{ height: 27, width: '40%', marginBottom: 10 }} />
            <div className="skel" style={{ height: 11, width: '65%' }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card card-static" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div className="skel" style={{ height: 14, width: 120 }} />
              <div className="skel" style={{ height: 14, width: 160 }} />
              <div className="skel" style={{ height: 14, width: 70, marginLeft: 'auto' }} />
            </div>
            <div className="skel" style={{ height: 12, width: '90%', marginBottom: 6 }} />
            <div className="skel" style={{ height: 12, width: '64%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
};

const BIG: React.CSSProperties = {
  fontFamily: 'var(--font-display-th)',
  fontWeight: 600,
  fontSize: 27,
  lineHeight: 1.05,
  color: 'var(--ink)',
  letterSpacing: '-.02em',
};

/** SQLite writes UTC as "YYYY-MM-DD HH:MM:SS" — no T, no Z — which Safari reads
 *  as NaN and Chrome reads as local time. Normalise before parsing. */
function toMs(v: string): number {
  const t = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** "12 ส.ค. 2569 · 14:30" — the date and the time of day, both stated. */
function fmtReviewedAt(v: string): string {
  const ms = toMs(v);
  if (!ms) return '—';
  const d = new Date(ms);
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}
