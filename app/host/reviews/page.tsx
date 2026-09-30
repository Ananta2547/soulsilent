'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { TdbPager } from '@/components/teacher/tdb';

/** Cards per page — the stats, the filter row and four cards clear a 900px
 *  window without the page scrolling. */
const PER_PAGE = 6;

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
  // How many reviews gave each star count, 5 down to 1.
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: all.filter((r) => r.rating === n).length }));

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
      <div className="tdb-head">
        <div>
          <span className="tdb-eyebrow">03 — รีวิว</span>
          <h1 className="tdb-h1">รีวิว.</h1>
          <p className="tdb-lead">
            <T th="สิ่งที่ผู้เข้าร่วมเขียนถึงกิจกรรมของคุณ — รวมดาวจากแบบสอบถาม AAR ด้วย" en="What seekers wrote about your journeys, including AAR stars." />
          </p>
        </div>
      </div>

      <div className="tdb-rv-top">
        <div className="tdb-panel tdb-rv-score">
          <span className="tdb-mono-label">{tr(lang, 'ดาวเฉลี่ย', 'Average rating')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 6px' }}>
            <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 56, lineHeight: 1, color: 'var(--teal)' }}>{all.length ? avg.toFixed(1) : '—'}</span>
            <span style={{ fontFamily: "'Mitr', sans-serif", fontSize: 18 }}>/ 5</span>
          </div>
          <span style={{ fontSize: 22, color: '#e0a526', letterSpacing: 2 }}>
            {'★'.repeat(Math.round(avg))}
            <span style={{ color: 'var(--cream-deep)' }}>{'★'.repeat(5 - Math.round(avg))}</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{tr(lang, `จาก ${all.length.toLocaleString()} รีวิว`, `from ${all.length.toLocaleString()} reviews`)}</span>
        </div>
        <div className="tdb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          {dist.map(({ n, c }) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tdb-bar-n" style={{ width: 28 }}>{n} ★</span>
              <div className="tdb-bar-track" style={{ height: 8 }}>
                <div className="tdb-bar-fill" style={{ width: `${all.length ? (c / all.length) * 100 : 0}%`, background: '#e0a526' }} />
              </div>
              <span className="tdb-bar-n" style={{ width: 28, textAlign: 'right' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>

      {all.length === 0 ? (
        <div className="tdb-empty">
          <h3><T th="ยังไม่มีรีวิว" en="No reviews yet" /></h3>
          <p><T th="เมื่อผู้เข้าร่วมตอบแบบสอบถาม AAR หรือรีวิวกิจกรรม จะแสดงที่นี่" en="Reviews and AAR stars show up here." /></p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div className="tdb-seg" style={{ padding: 3, gap: 2 }}>
              {(
                [
                  ['newest', tr(lang, 'ล่าสุด', 'Newest')],
                  ['oldest', tr(lang, 'เก่าสุด', 'Oldest')],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" className={sort === key ? 'on' : ''} aria-pressed={sort === key} onClick={() => { setSort(key); setPage(1); }} style={{ fontSize: 13, padding: '8px 16px' }}>
                  {label}
                </button>
              ))}
            </div>
            <select
              value={wsFilter}
              onChange={(e) => { setWsFilter(e.target.value); setPage(1); }}
              aria-label={tr(lang, 'แยกรายการตามกิจกรรม', 'Filter by journey')}
              className="field"
              style={{ width: 'auto', maxWidth: 300, padding: '10px 16px', fontSize: 13.5, background: '#fff', borderRadius: 999 }}
            >
              <option value="">{tr(lang, 'ทุกกิจกรรม', 'All journeys')}</option>
              {workshops.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            <span className="tdb-mono-label" style={{ marginLeft: 'auto' }}>{tr(lang, `${visible.length} รีวิว`, `${visible.length} shown`)}</span>
          </div>

          {visible.length === 0 ? (
            <div className="tdb-dashed"><T th="ไม่มีรีวิวของกิจกรรมนี้" en="No reviews for this journey" /></div>
          ) : (
            <>
              <div className="tdb-rv-grid">
                {shown.map((r) => {
                  const who = r.user_name || '—';
                  return (
                    <article key={r.id} className="tdb-panel tdb-rv-card">
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span className="tdb-av" style={{ width: 40, height: 40, fontSize: 15, background: '#eaf6f4', color: 'var(--teal-deep)' }}>{(who.trim()[0] || '?').toUpperCase()}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{who}</span>
                          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--teal-deep)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.workshop_title || '—'}</span>
                        </span>
                        <span style={{ color: '#e0a526', fontSize: 15, letterSpacing: 1, flexShrink: 0 }}>
                          {'★'.repeat(r.rating)}
                          <span style={{ color: 'var(--cream-deep)' }}>{'★'.repeat(5 - r.rating)}</span>
                        </span>
                      </div>
                      {r.comment ? (
                        <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-line' }}>“{r.comment}”</p>
                      ) : (
                        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{tr(lang, 'ให้ดาวอย่างเดียว ไม่ได้เขียนรีวิว', 'Stars only, no comment')}</p>
                      )}
                      <time dateTime={r.created_at} className="tdb-bar-n" style={{ marginTop: 'auto' }}>{fmtReviewedAt(r.created_at)}</time>
                    </article>
                  );
                })}
              </div>
              <TdbPager page={current} pageCount={pageCount} onChange={setPage} />
            </>
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
          // Two numbers, always one row: at 200px minimum they wrapped on a
          // phone and the pair read as two unrelated cards.
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
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
