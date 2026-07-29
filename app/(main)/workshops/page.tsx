'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { getWorkshopTags, getEffectivePrice, getWorkshopStatusBadge, isNewWorkshop, compareWorkshopsForListing } from '@/lib/workshop-utils';

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

export default function WorkshopsListingPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => {
    fetch('/api/workshops?public=1')
      .then((r) => r.json() as Promise<{ workshops: Workshop[] }>)
      .then((d) => setWorkshops(d.workshops || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <>
      {/* ---- Header ---- */}
      <section className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 14 }}>— กิจกรรมทั้งหมด</div>
        <h1 className="display-th reveal-up" style={{ fontSize: 'clamp(34px,5.4vw,58px)', margin: 0, color: 'var(--ink)', lineHeight: 1.05 }}>
          เลือก
          <span style={{ position: 'relative', display: 'inline-block', color: 'var(--teal)' }}>
            กิจกรรม
            <svg viewBox="0 0 220 16" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -10, width: '100%', height: 14 }} aria-hidden="true">
              <path d="M2 10 Q 30 3 58 9 T 112 8 T 166 9 T 218 7" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
          ที่ใช่กับคุณ
        </h1>
        <p style={{ margin: '22px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--muted)', maxWidth: 640 }}>
          ทั้ง Workshop, Event, Seminar และอื่น ๆ อีกมากมาย — เลือกแบบที่เหมาะกับเวลาและจังหวะของคุณ
        </p>
      </section>

      {/* ---- Filter bar ---- */}
      <section className="bg-cream" style={{ padding: '28px 0 32px' }}>
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <FilterPill active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>ทั้งหมด</FilterPill>
            {categories.map((c) => (
              <FilterPill key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>{c}</FilterPill>
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
                    onClick={() => setTagFilter(on ? '' : t)}
                    className="tag"
                    style={{ cursor: 'pointer', border: 0, fontFamily: 'inherit', background: on ? 'var(--teal)' : 'var(--teal-50)', color: on ? '#fff' : 'var(--teal-deep)' }}
                  >
                    {t}
                  </button>
                );
              })}
              {tagFilter && (
                <button onClick={() => setTagFilter('')} style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>ล้างแท็ก</button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ---- Grid ---- */}
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: 32, height: 32, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'float 1s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--muted)' }}>ไม่พบกิจกรรมที่ตรงกับตัวกรอง</div>
          ) : (
            <div className="wk-grid">
              {filtered.map((w) => <Card key={w.id} w={w} />)}
            </div>
          )}
        </div>
      </section>
    </>
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

  return (
    <Link href={`/workshops/${w.id}`} className="card reveal-up" style={{ padding: 16, background: 'var(--paper)', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--ink)' }}>
      <div className="ph ph-teal card-media" style={{ aspectRatio: '3/4', borderRadius: 14, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
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
        {(() => {
          const b = getWorkshopStatusBadge(w);
          return (
            <span className={b.open ? 'tag tag-accent' : 'tag'} style={b.open ? undefined : { background: '#e6e3da', color: 'var(--muted)' }}>
              {b.label}
            </span>
          );
        })()}
        {w.category && <span className="tag">{w.category}</span>}
      </div>
      <h3 className="display-th u-clamp-2" style={{ fontSize: 17, margin: '0 0 8px', lineHeight: 1.25, minHeight: '2.5em' }}>{w.title}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden>📅</span>
          <span>{fmtDateFull(w.date)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden>🕐</span>
          <span>{w.time_start} – {w.time_end}</span>
        </div>
        {fmtLocation(w) && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span aria-hidden>📍</span>
            <span className="u-clamp-2">{fmtLocation(w)}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
        <div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>ค่าเข้าร่วม</div>
          {free ? (
            <div style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19, color: 'var(--teal)' }}>ฟรี</div>
          ) : eff.isPromo ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19, color: 'var(--teal)' }}>฿{eff.price.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'line-through' }}>฿{eff.originalPrice.toLocaleString()}</span>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19 }}>฿{eff.price.toLocaleString()}</div>
          )}
        </div>
        <span className="btn btn-teal btn-sm" aria-hidden>จอง <span className="mono">→</span></span>
      </div>
    </Link>
  );
}
