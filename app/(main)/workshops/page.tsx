'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { getWorkshopTags, getEffectivePrice, getWorkshopCardStatus, isNewWorkshop, compareWorkshopsForListing } from '@/lib/workshop-utils';
import { Icon } from '@/components/design/Icon';
import { useLoadingTracker } from '@/components/design/DataLoading';

/* ============================================================
   Workshops listing — port of Design Composer "Workshops.dc.html".
   Navbar stays as-is (SiteHeader from app/(main)/layout.tsx). Live D1
   data via /api/workshops, Thai-only. Filters (category + tags) are
   derived from real data — richer than the mockup's fixed pills.
   ============================================================ */

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_TH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/** "2026-07-22" → "22 ก.ค. 2569" (Buddhist-era year). */
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** "2026-07-31" → "31 กรกฎาคม 2569" (full Thai month, Buddhist-era year). */
function fmtDateFull(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_TH_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** "2026-07-31" → "31 ก.ค. 69" (short month, 2-digit Buddhist-era year). */
function fmtDateShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const beYY = String((d.getFullYear() + 543) % 100).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${beYY}`;
}

/** Card date label. Continuous (multi-day) events show a short start–end range
 *  ("31 ก.ค. 69 - 2 ส.ค. 69"); everything else shows the single full date. */
function cardDateLabel(w: Workshop): string {
  if (w.workshop_type === 'multi_day' && w.end_date) {
    return `${fmtDateShort(w.date)} - ${fmtDateShort(w.end_date)}`;
  }
  return fmtDateFull(w.date);
}

/** Format the card location as "name-province, district". Prefers the joined
 *  location fields; falls back to the legacy free-text `location` string. */
function fmtLocation(w: Workshop): string {
  const name = (w.loc_name || '').trim();
  const province = (w.loc_province || '').trim();
  const district = (w.loc_district || '').trim();
  if (name || province || district) {
    const head = [name, province].filter(Boolean).join('-');
    return district ? `${head}, ${district}` : head;
  }
  return (w.location || '').trim();
}

/** Cards per page. 12 fills the 2/3/4-column grid evenly at every width. */
const PER_PAGE = 12;

export default function WorkshopsListingPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);

  // The first load raises the loading screen; the retry button below reuses
  // load() and is left untracked by the tracker itself.
  const track = useLoadingTracker();

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    // The whole chain is tracked, not just the response: counting the request
    // done at its headers cleared the loading screen a beat before the page had
    // its data, and the old spinner flashed in that gap.
    track(
      fetch('/api/workshops?public=1')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ workshops: Workshop[] }>;
        })
        .then((d) => setWorkshops(d.workshops || []))
        .catch((e) => {
          console.error('Failed to load workshops', e);
          setLoadError(true);
        })
        .finally(() => setLoading(false)),
    );
  }, [track]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    workshops.forEach((w) => w.category && set.add(w.category));
    return Array.from(set).sort();
  }, [workshops]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    workshops.forEach((w) => getWorkshopTags(w).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [workshops]);

  const filtered = useMemo(
    () =>
      workshops
        .filter((w) => {
          if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
          if (tagFilter && !getWorkshopTags(w).includes(tagFilter)) return false;
          return true;
        })
        // New (≤7d) → Open → Closed, each by soonest event date.
        .sort((a, b) => compareWorkshopsForListing(a, b)),
    [workshops, categoryFilter, tagFilter],
  );

  // Clamped rather than reset, so a filter that narrows the list while the
  // reader is on page 4 lands them on the last page that still has cards
  // instead of an empty one.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  function goToPage(n: number) {
    setPage(n);
    // Paging is reading, not scrolling — put the reader back at the first card
    // rather than wherever the previous page's last card left them.
    document.getElementById('wk-grid-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* ---- Header ---- */}
      <section className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 14 }}>— กิจกรรมทั้งหมด</div>
        <h1 className="display-th reveal-up wk-head-title" style={{ fontSize: 'clamp(34px,5.4vw,58px)', margin: 0, color: 'var(--ink)', lineHeight: 1.05 }}>
          เลือก
          <span style={{ position: 'relative', display: 'inline-block', color: 'var(--teal)' }}>
            กิจกรรม
            <svg viewBox="0 0 220 16" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -10, width: '100%', height: 14 }} aria-hidden="true">
              <path d="M2 10 Q 30 3 58 9 T 112 8 T 166 9 T 218 7" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
          ที่ใช่กับคุณ
        </h1>
        <p className="wk-head-lede" style={{ margin: '22px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)', maxWidth: 640 }}>
          ทั้ง Workshop, Event, Seminar และอื่น ๆ อีกมากมาย — เลือกแบบที่เหมาะกับเวลาและจังหวะของคุณ
        </p>
      </section>

      {/* ---- Filter bar ---- */}
      <section className="bg-cream" style={{ padding: '28px 0 32px' }}>
        <div className="container wk-filters" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <FilterPill active={categoryFilter === 'all'} onClick={() => { setCategoryFilter('all'); setPage(1); }}>ทั้งหมด</FilterPill>
            {categories.map((c) => (
              <FilterPill key={c} active={categoryFilter === c} onClick={() => { setCategoryFilter(c); setPage(1); }}>{c}</FilterPill>
            ))}
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em' }}>#TAGS</span>
              {tags.map((t) => {
                const on = tagFilter === t;
                return (
                  <button
                    key={t}
                    onClick={() => { setTagFilter(on ? '' : t); setPage(1); }}
                    className="tag"
                    style={{ cursor: 'pointer', border: 0, fontFamily: 'inherit', background: on ? 'var(--teal)' : 'var(--teal-50)', color: on ? '#fff' : 'var(--teal-deep)' }}
                  >
                    {t}
                  </button>
                );
              })}
              {tagFilter && (
                <button onClick={() => { setTagFilter(''); setPage(1); }} style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>ล้างแท็ก</button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ---- Grid ---- */}
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container" id="wk-grid-top">
          {/* No spinner while loading: the loading screen is over the page until
              this page's own requests land - see components/design/DataLoading. */}
          {loading ? null : loadError ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--muted)' }}>
              <p style={{ marginBottom: 16 }}>โหลดกิจกรรมไม่สำเร็จ</p>
              <button onClick={load} style={{ fontFamily: 'inherit', cursor: 'pointer', border: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)', borderRadius: 999, padding: '8px 22px', fontSize: 14, fontWeight: 600 }}>ลองใหม่</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--muted)' }}>ไม่พบกิจกรรมที่ตรงกับตัวกรอง</div>
          ) : (
            <>
              <div className="wk-grid">
                {shown.map((w) => <Card key={w.id} w={w} />)}
              </div>
              <Pagination current={current} pageCount={pageCount} total={filtered.length} onGo={goToPage} />
            </>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Page controls. Long runs collapse to first · … · neighbours · … · last, so
 * the row never wraps into a second line of numbers on a phone.
 */
function Pagination({
  current,
  pageCount,
  total,
  onGo,
}: {
  current: number;
  pageCount: number;
  total: number;
  onGo: (n: number) => void;
}) {
  if (pageCount <= 1) return null;

  const pages: (number | 'gap')[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const near = Math.abs(n - current) <= 1;
    const edge = n === 1 || n === pageCount;
    if (near || edge) pages.push(n);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }

  return (
    <nav
      aria-label="หน้ากิจกรรม"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 48 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <PageBtn disabled={current === 1} onClick={() => onGo(current - 1)}>‹ ก่อนหน้า</PageBtn>
        {pages.map((n, i) =>
          n === 'gap' ? (
            <span key={`gap${i}`} aria-hidden style={{ color: 'var(--muted)', padding: '0 4px' }}>
              …
            </span>
          ) : (
            <PageBtn key={n} active={n === current} onClick={() => onGo(n)} label={`หน้า ${n}`}>
              {n}
            </PageBtn>
          ),
        )}
        <PageBtn disabled={current === pageCount} onClick={() => onGo(current + 1)}>ถัดไป ›</PageBtn>
      </div>
      <div className="mono" style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--muted)' }}>
        หน้า {current} / {pageCount} · {total} กิจกรรม
      </div>
    </nav>
  );
}

function PageBtn({
  children,
  onClick,
  active = false,
  disabled = false,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 40,
        height: 40,
        padding: '0 14px',
        borderRadius: 999,
        border: 0,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? 'var(--teal)' : 'var(--cream)',
        color: active ? '#fff' : disabled ? 'var(--muted)' : 'var(--ink)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="filter-pill"
      style={{ fontFamily: 'inherit', cursor: 'pointer', border: 0, borderRadius: 999, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, background: active ? 'var(--ink)' : 'var(--paper)', color: active ? '#fff' : 'var(--ink)', transition: 'background .2s ease, color .2s ease' }}
    >
      {children}
    </button>
  );
}

function Card({ w }: { w: Workshop }) {
  const eff = getEffectivePrice(w);
  const free = w.payment_type === 'free' || eff.price <= 0;
  // Badge + button wording live in one helper shared with the home card.
  const { open, badgeLabel, ctaLabel } = getWorkshopCardStatus(w);

  return (
    <Link href={w.master_id ? `/workshop-info/${w.master_id}?date=${w.date}` : `/workshops/${w.id}`} className="card reveal-up dc-event-card" style={{ padding: 16, background: 'var(--paper)', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--ink)' }}>
      <div className="ph ph-teal card-media dc-ev-media" style={{ aspectRatio: '3/4', borderRadius: 14, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
        {w.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={w.image_url} alt={w.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span className="mono" style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 9, letterSpacing: '.1em', opacity: 0.5 }}>COVER · 3:4</span>
        )}
        {eff.isPromo && (
          <span className="tag tag-accent" style={{ position: 'absolute', top: 10, right: 10, fontWeight: 700 }}>
            ลด {Math.round((1 - eff.price / eff.originalPrice) * 100)}%
          </span>
        )}
        {isNewWorkshop(w) && (
          <span
            style={{
              position: 'absolute',
              top: 18,
              left: -32,
              width: 122,
              transform: 'rotate(-45deg)',
              background: 'var(--accent)',
              color: 'var(--ink)',
              textAlign: 'center',
              fontFamily: 'Mitr',
              fontWeight: 600,
              fontSize: 12.5,
              letterSpacing: '.08em',
              padding: '4px 0',
              boxShadow: '0 2px 8px rgba(13,30,29,.28)',
              pointerEvents: 'none',
            }}
          >
            ใหม่
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className={open ? 'tag tag-accent' : 'tag'} style={open ? undefined : { background: '#e6e3da', color: 'var(--muted)' }}>
          {badgeLabel}
        </span>
        <span className="tag">{w.is_online ? 'ONLINE' : 'ONSITE'}</span>
        {w.category && <span className="tag">{w.category}</span>}
      </div>
      <h3 className="display-th u-clamp-2 dc-ev-title" style={{ fontSize: 17, margin: '0 0 8px', lineHeight: 1.25, minHeight: '2.5em' }}>{w.title}</h3>
      <div className="dc-ev-meta" style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="date" size={14} />
          <span>{cardDateLabel(w)}</span>
        </div>
        <div className="dc-ev-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="time" size={14} />
          <span>{w.time_start} – {w.time_end}</span>
        </div>
        {fmtLocation(w) && (
          <div className="dc-ev-sub" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <Icon name="location" size={14} style={{ marginTop: 1 }} />
            <span className="u-clamp-2">{fmtLocation(w)}</span>
          </div>
        )}
      </div>

      <div className="dc-ev-foot" style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
        <div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>ค่าเข้าร่วม</div>
          {free ? (
            <div className="dc-ev-price" style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19, color: 'var(--teal)' }}>ฟรี</div>
          ) : eff.isPromo ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="dc-ev-price" style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19, color: 'var(--teal)' }}>฿{eff.price.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'line-through' }}>฿{eff.originalPrice.toLocaleString()}</span>
            </div>
          ) : (
            <div className="dc-ev-price" style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19 }}>฿{eff.price.toLocaleString()}</div>
          )}
        </div>
        {open ? (
          <span className="btn btn-teal btn-sm dc-ev-cta" aria-hidden>{ctaLabel} <span className="mono">→</span></span>
        ) : (
          <span
            className="btn btn-sm dc-ev-cta"
            aria-hidden
            style={{ background: '#e6e3da', color: 'var(--muted)', cursor: 'not-allowed' }}
          >
            {ctaLabel}
          </span>
        )}
      </div>
    </Link>
  );
}
