'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Workshop, Article, ArticleCategory } from '@/lib/types';
import { useLang } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { getEffectivePrice, hasWorkshopEnded, getWorkshopCardStatus, isNewWorkshop, isWorkshopFull, compareWorkshopsForListing } from '@/lib/workshop-utils';
import { categoryLabel, formatArticleDate } from '@/lib/article-utils';

/* ============================================================
   Home — port of Design Composer "Home Hero.dc.html".
   Navbar is intentionally NOT here: SiteHeader is rendered by
   app/(main)/layout.tsx and stays as-is. Everything is live D1.
   Thai-only, matching the design.
   ============================================================ */

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-07-22" → "22 ก.ค. 69" (2-digit Buddhist-era year). */
function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const be = (d.getFullYear() + 543) % 100;
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${be}`;
}

const MONTHS_TH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

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

/** Card date label — continuous (multi-day) events show a short start–end
 *  range ("31 ก.ค. 69 - 2 ส.ค. 69"); everything else the single full date. */
function cardDateLabel(w: Workshop): string {
  if (w.workshop_type === 'multi_day' && w.end_date) {
    return `${fmtDateShort(w.date)} - ${fmtDateShort(w.end_date)}`;
  }
  return fmtDateFull(w.date);
}

/** Card location as "name-province, district"; falls back to legacy free text. */
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

function priceLabel(w: Workshop): string {
  const eff = getEffectivePrice(w);
  if (w.payment_type === 'free' || eff.price <= 0) return 'ฟรี';
  return `฿${eff.price.toLocaleString()}`;
}

/** Whole years since founding (15 Nov 2022 / พ.ศ. 2565). */
function yearsSince(year: number, month1: number, day: number): number {
  const now = new Date();
  let y = now.getFullYear() - year;
  const m = now.getMonth() + 1 - month1;
  if (m < 0 || (m === 0 && now.getDate() < day)) y--;
  return Math.max(0, y);
}

/** Privacy-friendly reviewer name: first name + last-name initial. */
function abbrevName(full: string | null): string {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ผู้เข้าร่วม';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  user_name: string | null;
  workshop_id: string | null;
  workshop_title: string | null;
  master_id: string | null;
};

/** /api/stats — base seed + live DB counts. */
type SiteStats = { workshops: number; participants: number; locations: number };

/* ---------------- Hero fan ---------------- */

type Ticket = { id: string | null; cat: string; title: string; subtitle: string; date: string; price: string; latin: boolean; image: string | null; discountPct?: number | null; originalPrice?: string | null; full?: boolean };

/** The 5 fan positions (from the design), outer cards lower + rotated more. */
const FAN_SLOTS = [
  { x: -336, y: 46, r: -17, z: 1, g: 'linear-gradient(158deg,#8b5cf6,#5b21b6)' },
  { x: -168, y: 98, r: -6, z: 2, g: 'linear-gradient(158deg,#3b82f6,#1e40af)' },
  { x: 0, y: 8, r: 7, z: 3, g: 'linear-gradient(158deg,#ec4899,#be185d)' },
  { x: 168, y: 102, r: -5, z: 2, g: 'linear-gradient(158deg,#14b8a6,#0d8a7e)' },
  { x: 336, y: 34, r: 15, z: 1, g: 'linear-gradient(158deg,#fb923c,#ea580c)' },
];

/** Curated fallback tickets — used to fill the fan when there aren't 5 live workshops. */
const SAMPLE_TICKETS: Ticket[] = [
  { id: null, cat: 'ART · ศิลปะ', title: 'Field\nSketch', subtitle: 'เดินวาดเมืองเก่า', date: '22 ก.ค. 69', price: '฿1,290', latin: true, image: null },
  { id: null, cat: 'PRINT · สิ่งพิมพ์', title: 'Zine\nLab', subtitle: 'หนังสือทำมือเล่มแรก', date: '30 ก.ค. 69', price: '฿1,590', latin: true, image: null },
  { id: null, cat: 'CAMP · แคมป์', title: 'Quiet\nCamp', subtitle: 'สองวันกับความเงียบ', date: '5–6 ส.ค. 69', price: '฿3,900', latin: true, image: null },
  { id: null, cat: 'WRITE · เขียน', title: 'Morning\nPages', subtitle: 'เขียนก่อนโลกตื่น', date: '9 ส.ค. 69', price: 'ฟรี', latin: true, image: null },
  { id: null, cat: 'CRAFT · คราฟต์', title: 'Slow\nCoffee', subtitle: 'ชงกาแฟช้า ๆ', date: '12 ส.ค. 69', price: '฿890', latin: true, image: null },
];

function ticketFromWorkshop(w: Workshop): Ticket {
  const eff = getEffectivePrice(w);
  const promo = eff.isPromo && eff.originalPrice > 0;
  return {
    cat: w.category || 'WORKSHOP',
    title: w.title,
    subtitle: w.short_description || 'เปิดรับสมัครแล้ว',
    date: shortDate(w.date),
    price: priceLabel(w),
    latin: false,
    image: w.image_url ?? null,
    id: w.id,
    discountPct: promo ? Math.round((1 - eff.price / eff.originalPrice) * 100) : null,
    originalPrice: promo ? `฿${eff.originalPrice.toLocaleString()}` : null,
    full: isWorkshopFull(w),
  };
}

/** Neutral surface for real workshop slots — replaces the decorative colorful
    sample gradient so no coloured rim bleeds around the (grey) cover image. */
const LIVE_CARD_BG = 'linear-gradient(158deg,#38514f,#0d1e1d)';

function FanCard({ slot, index, ticket, onEnter }: { slot: (typeof FAN_SLOTS)[number]; index: number; ticket: Ticket; onEnter: (i: number) => void }) {
  // A live workshop occupies this slot once real data loads (samples have id:null).
  // Live slots drop the colourful design gradient entirely (replace, not overlay).
  const isLive = !!ticket.id;
  // A real poster already carries its own title, date and price, set by whoever
  // drew it. Printing ours on top of that scrims the artwork and says
  // everything twice, so a card with a poster shows the poster and nothing
  // else. Only the placeholder cards - which have no artwork to show - keep the
  // typeset ticket face below.
  const posterOnly = !!ticket.image;
  return (
    <div
      className="fan-card"
      data-i={index}
      data-basez={slot.z}
      data-r={slot.r}
      onMouseEnter={() => onEnter(index)}
      style={{
        zIndex: slot.z,
        background: isLive ? LIVE_CARD_BG : slot.g,
        boxShadow: '0 30px 60px -20px rgba(13,30,29,.42)',
        transform: `translateX(calc(-111px + ${slot.x}px + var(--sx,0px))) translateY(calc(${slot.y}px + var(--sy,0px))) rotate(calc(${slot.r}deg + var(--dr,0deg))) scale(var(--sc,1))`,
      }}
    >
      {ticket.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ticket.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!posterOnly && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(120% 60% at 30% 0%,rgba(255,255,255,.28),transparent 55%)',
            pointerEvents: 'none',
          }}
        />
      )}
      {ticket.id && (
        <Link href={`/workshops/${ticket.id}`} aria-label={ticket.title} style={{ position: 'absolute', inset: 0, zIndex: 6 }} />
      )}
      {posterOnly ? null : (
        <>
      {ticket.discountPct ? (
        <span style={{ position: 'absolute', top: 10, right: 10, zIndex: 7, background: 'var(--accent)', color: 'var(--ink)', fontFamily: 'Archivo Black', fontSize: 12, borderRadius: 8, padding: '3px 8px', boxShadow: '0 4px 10px rgba(0,0,0,.25)' }}>
          ลด {ticket.discountPct}%
        </span>
      ) : null}
      {ticket.full ? (
        <span style={{ position: 'absolute', top: 10, left: 10, zIndex: 7, background: '#3a3a3a', color: '#fff', fontFamily: 'Mitr', fontWeight: 600, fontSize: 12, borderRadius: 8, padding: '3px 10px', boxShadow: '0 4px 10px rgba(0,0,0,.3)' }}>
          เต็มแล้ว
        </span>
      ) : null}
      <div style={{ position: 'relative', height: '100%', padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', color: '#fff', textShadow: ticket.image ? '0 1px 10px rgba(0,0,0,.4)' : 'none', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.16em', color: 'rgba(255,255,255,.85)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
            {ticket.cat}
          </span>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Mitr', fontSize: 11, flexShrink: 0 }}>s</span>
        </div>
        <div style={{ marginTop: 'auto' }}>
          {ticket.latin ? (
            <div className="display-en" style={{ fontSize: 26, lineHeight: 0.94, whiteSpace: 'pre-line' }}>{ticket.title}</div>
          ) : (
            <div className="display-th u-clamp-2" style={{ fontSize: 19, lineHeight: 1.08 }}>{ticket.title}</div>
          )}
          <div style={{ fontFamily: 'Mitr', fontSize: 13, color: 'rgba(255,255,255,.9)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subtitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '.08em', color: 'rgba(255,255,255,.85)' }}>{ticket.date}</span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              {ticket.originalPrice ? (
                <span style={{ fontFamily: 'Mitr', fontSize: 11, color: 'rgba(255,255,255,.7)', textDecoration: 'line-through' }}>{ticket.originalPrice}</span>
              ) : null}
              <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 999, padding: '4px 11px', fontFamily: 'Archivo Black', fontSize: 13 }}>{ticket.price}</span>
            </span>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function Hero({ workshops }: { workshops: Workshop[] }) {
  const fanRef = useRef<HTMLDivElement>(null);

  // Fill the 5-slot fan with starred workshops, newest first, placed so the
  // newest sits centre-front and older ones fan outward:
  //   rank 0 (newest) → centre (slot 2), 1 → left (1), 2 → right (3),
  //   3 → far-left (0), 4 (oldest) → far-right (4).
  // FAN_SLOTS index = physical position; RANK_TO_SLOT maps rank → that index.
  const tickets: Ticket[] = useMemo(() => {
    const RANK_TO_SLOT = [2, 1, 3, 0, 4];
    const sorted = [...workshops]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 5);
    const bySlot: (Ticket | undefined)[] = new Array(5);
    sorted.forEach((w, rank) => {
      bySlot[RANK_TO_SLOT[rank]] = ticketFromWorkshop(w);
    });
    return Array.from({ length: 5 }, (_, i) => bySlot[i] ?? SAMPLE_TICKETS[i]);
  }, [workshops]);

  /**
   * Spread siblings apart + lift the hovered card. The hovered card rises,
   * straightens toward vertical and brightens; the rest recede (smaller +
   * dimmed) so the focused card gains depth. All values animate via the
   * .fan-card CSS transition.
   */
  function applyHover(h: number | null) {
    const root = fanRef.current;
    if (!root) return;
    const spread = 58;
    root.querySelectorAll<HTMLElement>('.fan-card').forEach((el) => {
      const i = Number(el.dataset.i);
      const bz = el.dataset.basez ?? '1';
      const baseR = Number(el.dataset.r ?? '0');
      if (h === null) {
        // resting fan
        el.style.setProperty('--sx', '0px');
        el.style.setProperty('--sy', '0px');
        el.style.setProperty('--sc', '1');
        el.style.setProperty('--dr', '0deg');
        el.style.zIndex = bz;
        el.style.boxShadow = '0 30px 60px -20px rgba(13,30,29,.42)';
        el.style.filter = 'none';
      } else if (i === h) {
        // focused card — lifts, straightens, brightens, deepest shadow
        el.style.setProperty('--sx', '0px');
        el.style.setProperty('--sy', '-44px');
        el.style.setProperty('--sc', '1.14');
        el.style.setProperty('--dr', `${(-baseR * 0.55).toFixed(2)}deg`);
        el.style.zIndex = '30';
        el.style.boxShadow = '0 56px 96px -26px rgba(13,30,29,.58)';
        el.style.filter = 'brightness(1.05) saturate(1.06)';
      } else {
        // neighbours slide out horizontally and recede. Shadow is left at the
        // resting value (identical to the h===null branch) so only the focused
        // card ever repaints its shadow — keeps the fan-out motion smooth.
        const d = Math.abs(i - h);
        const mag = spread + (d - 1) * 24;
        el.style.setProperty('--sx', `${i < h ? -mag : mag}px`);
        el.style.setProperty('--sy', '0px');
        el.style.setProperty('--sc', '.93');
        el.style.setProperty('--dr', '0deg');
        el.style.zIndex = bz;
        el.style.boxShadow = '0 30px 60px -20px rgba(13,30,29,.42)';
        el.style.filter = 'brightness(.8) saturate(.96)';
      }
    });
  }

  return (
    <section id="top" className="container" style={{ position: 'relative', paddingTop: 44, paddingBottom: 80, overflow: 'hidden' }}>
      <div className="mono" style={{ textAlign: 'center', fontSize: 13, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--teal)', fontWeight: 500, marginBottom: 10 }}>
        Workshop&nbsp;&nbsp;·&nbsp;&nbsp;Event&nbsp;&nbsp;·&nbsp;&nbsp;Seminar
      </div>

      <h1 className="giant-en">
        Experience
        <span style={{ position: 'absolute', right: '8%', top: '-2%', fontSize: '.16em', color: 'var(--accent)' }}>✺</span>
      </h1>

      <div ref={fanRef} onMouseLeave={() => applyHover(null)} className="fan-wrap">
        {FAN_SLOTS.map((slot, i) => (
          <FanCard key={i} slot={slot} index={i} ticket={tickets[i]} onEnter={applyHover} />
        ))}
      </div>

      <p className="hero-lede" style={{ textAlign: 'center', maxWidth: 520, margin: '130px auto 0', position: 'relative', zIndex: 5, fontSize: 16, lineHeight: 1.6, color: 'var(--muted)' }}>
        ค้นหาพื้นที่ที่ชอบ จองกิจกรรมที่ใช่<br />
        แล้วมาร่วมเปิด<span className="mark">มุมมองใหม่</span>ที่คุณอาจไม่เคยเจอ
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 26 }}>
        <Link href="/workshops" className="btn btn-ink">
          สำรวจกิจกรรมทั้งหมด&nbsp;&nbsp;<span className="mono">→</span>
        </Link>
      </div>

      {/* Anchors the bottom of the full-height phone hero and says there is
          more below the fold. Hidden on wider screens, where the next
          section is already visible. */}
      <div className="hero-scroll-cue" aria-hidden>
        <span className="mono">เลื่อนดูกิจกรรม</span>
        <span className="hero-scroll-line" />
      </div>
    </section>
  );
}

/* ---------------- Upcoming events ---------------- */

function EventCard({ w }: { w: Workshop }) {
  const eff = getEffectivePrice(w);
  const free = w.payment_type === 'free' || eff.price <= 0;
  // Badge + button wording live in one helper shared with the /workshops card.
  const { open, badgeLabel, ctaLabel } = getWorkshopCardStatus(w);
  const discountPct =
    !free && eff.originalPrice && eff.originalPrice > eff.price
      ? Math.round((1 - eff.price / eff.originalPrice) * 100)
      : 0;
  return (
    <Link href={`/workshops/${w.id}`} className="card reveal-up dc-event-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--ink)' }}>
      <div className="ph ph-teal card-media dc-ev-media" style={{ aspectRatio: '3/4', borderRadius: 14, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
        {w.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={w.image_url} alt={w.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span className="mono" style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 9, letterSpacing: '.1em', opacity: 0.5 }}>COVER · 3:4</span>
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
        {discountPct > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'var(--accent)',
              color: 'var(--ink)',
              fontFamily: 'Mitr',
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '.03em',
              padding: '3px 9px',
              borderRadius: 999,
              boxShadow: '0 2px 8px rgba(13,30,29,.28)',
              pointerEvents: 'none',
            }}
          >
            ลด {discountPct}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className={open ? 'tag tag-accent' : 'tag'} style={open ? undefined : { background: '#e6e3da', color: 'var(--muted)' }}>
          {badgeLabel}
        </span>
        {/* Where it happens, straight from the admin's online switch — the
            category only fills in for onsite workshops that have one. */}
        <span className="tag">{w.is_online ? 'ONLINE' : w.category || 'ONSITE'}</span>
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
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>เริ่มต้น</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <div className="dc-ev-price" style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 19, color: 'var(--teal)' }}>{free ? 'ฟรี' : `฿${eff.price.toLocaleString()}`}</div>
            {discountPct > 0 && eff.originalPrice && (
              <div style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'line-through' }}>฿{eff.originalPrice.toLocaleString()}</div>
            )}
          </div>
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

function UpcomingEvents({ workshops }: { workshops: Workshop[] }) {
  const upcoming = useMemo(
    // New (≤7d) → Open → Closed, each by soonest event date.
    () => workshops.filter((w) => !hasWorkshopEnded(w)).sort((a, b) => compareWorkshopsForListing(a, b)),
    [workshops],
  );
  const categories = useMemo(
    () => Array.from(new Set(upcoming.map((w) => w.category).filter((c): c is string => !!c))).slice(0, 4),
    [upcoming],
  );
  const [filter, setFilter] = useState('ทั้งหมด');
  const shown = (filter === 'ทั้งหมด' ? upcoming : upcoming.filter((w) => w.category === filter)).slice(0, 8);

  return (
    <section className="section bg-cream">
      <div className="container">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40 }}>
          <div className="reveal-up">
            <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 10 }}>— 01 · เร็ว ๆ นี้</div>
            <h2 className="display-th" style={{ fontSize: 'clamp(30px,4.4vw,46px)', margin: 0, color: 'var(--ink)' }}>
              เปิดพื้นที่ให้เรื่องราวใหม่ ๆ<br />
              ที่<span style={{ position: 'relative', display: 'inline-block' }}>
                กำลังจะเกิดขึ้น
                <svg viewBox="0 0 300 18" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -10, width: '100%', height: 16 }} aria-hidden="true">
                  <path d="M2 11 Q 40 2 78 10 T 152 9 T 226 10 T 298 8" fill="none" stroke="var(--teal)" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </h2>
            <p style={{ margin: '20px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--muted)', maxWidth: 440 }}>
              สำรองที่นั่งล่วงหน้า พื้นที่นี้จำกัดคน แต่ไม่จำกัดความเป็นตัวเอง
            </p>
          </div>
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['ทั้งหมด', ...categories].map((c) => {
                const active = filter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setFilter(c)}
                    className="dc-filter-pill"
                    style={{ fontFamily: 'inherit', cursor: 'pointer', border: 0, borderRadius: 999, padding: '10px 20px', fontSize: 13.5, fontWeight: 600, background: active ? 'var(--ink)' : 'var(--paper)', color: active ? '#fff' : 'var(--ink)' }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {shown.length > 0 ? (
          <div className="dc-events-grid">
            {shown.map((w) => <EventCard key={w.id} w={w} />)}
          </div>
        ) : (
          <div className="card" style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            ยังไม่มีกิจกรรมที่เปิดรับตอนนี้ — กลับมาดูใหม่เร็ว ๆ นี้
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 44 }}>
          <Link href="/workshops" className="btn btn-ghost">ดูทั้งหมด <span className="mono">→</span></Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Articles ---------------- */

function ArticlesSection({ lead, side, categories }: { lead?: Article; side: Article[]; categories: ArticleCategory[] }) {
  const { lang } = useLang();
  if (!lead) return null;

  // The 3 side cards cycle through these on-brand surfaces (from the design).
  const sideStyles = [
    { bg: 'var(--cream-deep)', fg: 'var(--ink)', meta: '#8a7a52', link: 'var(--teal-deep)', ph: '#d8caa8' },
    { bg: 'var(--teal)', fg: '#fff', meta: 'rgba(255,255,255,.75)', link: 'var(--accent)', ph: 'rgba(255,255,255,.22)' },
    { bg: 'var(--ink)', fg: '#fff', meta: 'rgba(255,255,255,.6)', link: 'var(--accent)', ph: '' },
  ];

  return (
    <section className="section bg-paper">
      <div className="container">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', marginBottom: 40 }}>
          <div className="reveal-up">
            <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 10 }}>— 02 · อ่าน</div>
            <h2 className="display-th" style={{ fontSize: 'clamp(30px,4.4vw,46px)', margin: 0, color: 'var(--ink)' }}>
              พื้นที่ของความทรงจำ<br /><span style={{ color: 'var(--teal)' }}>บทความ</span> ข่าวสาร
            </h2>
          </div>
          <div className="dc-art-intro" style={{ maxWidth: 480, textAlign: 'right', alignSelf: 'flex-end' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)' }}>
              <span className="dc-nowrap-lg">บันทึกจากเรื่องราว มุมมอง และประสบการณ์จากทีม Soul Silent</span><br />เปิดมาอ่านเล่นตอนว่างในวันหยุด หรือก่อนเข้านอน
            </p>
            <Link href="/articles" style={{ fontWeight: 700, fontSize: 14 }}>archive ทั้งหมด <span className="mono">→</span></Link>
          </div>
        </div>

        <div className="dc-articles-grid">
          {/* Lead article — 16:10 cover */}
          <Link href={`/articles/${lead.slug}`} className="card" style={{ padding: 0, color: 'var(--ink)', textDecoration: 'none', boxShadow: '0 14px 36px -18px rgba(13,30,29,.3)' }}>
            <div className="ph ph-teal-100" style={{ aspectRatio: '16/10', borderRadius: '22px 22px 0 0', position: 'relative', overflow: 'hidden' }}>
              {lead.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.cover_image_url} alt={lead.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="mono" style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 9, letterSpacing: '.1em', opacity: 0.5 }}>COVER · 16:10</span>
              )}
            </div>
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="tag">{categoryLabel(lead.category, lang, categories)}</span>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatArticleDate(lead.date, lang)}</span>
              </div>
              <h3 className="display-th u-clamp-2" style={{ fontSize: 24, margin: '0 0 10px' }}>{lead.title}</h3>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--teal)' }}>อ่านต่อ <span className="mono">→</span></span>
            </div>
          </Link>

          {/* Side column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {side.map((a, i) => {
              const s = sideStyles[i % sideStyles.length];
              return (
                <Link key={a.id} href={`/articles/${a.slug}`} className="card" style={{ padding: 20, display: 'flex', gap: 16, alignItems: 'center', flex: 1, color: s.fg, background: s.bg, textDecoration: 'none', boxShadow: '0 10px 30px -18px rgba(13,30,29,.35)' }}>
                  <div className={s.ph ? 'ph' : 'ph ph-ink'} style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 14, background: s.ph || undefined, position: 'relative', overflow: 'hidden' }}>
                    {a.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span className="tag" style={i === 1 ? { background: 'rgba(255,255,255,.2)', color: '#fff' } : undefined}>{categoryLabel(a.category, lang, categories)}</span>
                      <span className="mono" style={{ fontSize: 11, color: s.meta }}>{formatArticleDate(a.date, lang)}</span>
                    </div>
                    <h3 className="display-th u-clamp-2" style={{ fontSize: 16, margin: '0 0 6px', lineHeight: 1.3, color: s.fg }}>{a.title}</h3>
                    {a.excerpt && <p className="u-clamp-2" style={{ fontSize: 12.5, color: s.meta, margin: '0 0 8px', lineHeight: 1.5 }}>{a.excerpt}</p>}
                    <span style={{ fontWeight: 700, fontSize: 13, color: s.link }}>อ่าน <span className="mono">→</span></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Reviews ---------------- */

const SAMPLE_REVIEWS: { name: string; workshop: string; quote: string }[] = [
  { name: 'พลอย · นักออกแบบ', workshop: 'Zine Lab #03', quote: 'มาด้วยความคาดหวังว่าจะได้ "เทคนิค" กลับไปได้ "ตัวเอง" เป็นวันที่เงียบที่สุดในรอบหลายเดือน' },
  { name: 'เปา · นักศึกษาปี 2', workshop: 'Quiet Camp #01', quote: 'เรียนหนัก เครียด แทบไม่ได้ออกไปไหนเลย สองวันนี้ทำให้รู้ว่าหายใจช้า ๆ ก็เป็นการเรียนรู้ได้' },
  { name: 'ตี้ · ฟรีแลนซ์', workshop: 'Field Sketch · Charoenkrung', quote: 'ครั้งแรกที่วาดรูปนอกบ้านโดยไม่กลัวคนมอง กลับบ้านมาวาดต่อทุกวัน' },
];

/** Small hand-placed tilt per review card (deg), cycled by index. */
const REV_TILT = [-2, 1.5, -1.3, 2, -0.9, 1.7, -1.6, 1.2, -2, 0.9];

function ReviewsSection({ reviews }: { reviews: PublicReview[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  /* Phones get no arrows — one card fills the row — so the dots below the
     track carry the whole "there is more, swipe" message. */
  const [active, setActive] = useState(0);

  const cards =
    reviews.length > 0
      ? reviews.slice(0, 10).map((r) => ({ key: r.id, name: abbrevName(r.user_name), workshop: r.workshop_title || '', workshopId: r.workshop_id, quote: r.comment || '', rating: Math.max(1, Math.min(5, r.rating || 5)) }))
      : SAMPLE_REVIEWS.map((r, i) => ({ key: `s${i}`, name: r.name, workshop: r.workshop, workshopId: null as string | null, quote: r.quote, rating: 5 }));

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      setCanPrev(el.scrollLeft > 8);
      setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
      const cell = el.firstElementChild as HTMLElement | null;
      const step = cell ? cell.offsetWidth + 22 : el.clientWidth;
      setActive(step > 0 ? Math.round(el.scrollLeft / step) : 0);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [reviews.length]);

  const slide = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // Page by exactly the number of fully visible cards so the smooth scroll
    // always lands on a snap point instead of fighting scroll-snap mid-flight.
    const cell = el.firstElementChild as HTMLElement | null;
    const step = cell ? cell.offsetWidth + 22 : el.clientWidth;
    const perView = Math.max(1, Math.floor((el.clientWidth + 22) / step));
    el.scrollBy({ left: dir * step * perView, behavior: 'smooth' });
    // Snap scrolling can swallow trailing scroll events; re-sync after settling.
    window.setTimeout(() => {
      setCanPrev(el.scrollLeft > 8);
      setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    }, 600);
  };

  return (
    <section className="section bg-teal-section" style={{ textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <span className="mono" style={{ position: 'absolute', right: '8%', top: 64, color: 'var(--accent)', fontSize: 22 }}>+</span>
      <div className="container">
        <div className="mono" style={{ letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', color: '#fff', marginBottom: 14 }}>03 — พื้นที่รีวิว</div>
        <h2 className="display-en" style={{ fontSize: 'clamp(48px,9vw,110px)', margin: 0, color: '#fff', lineHeight: 0.9 }}>
          <span style={{ color: '#fff' }}>&ldquo;</span>ECHOES<span style={{ color: '#fff' }}>&rdquo;</span>
        </h2>
        <p style={{ fontFamily: 'Mitr', fontSize: 18, color: '#fff', margin: '14px 0 48px' }}>— เสียงสะท้อนจากผู้เข้าร่วม</p>

        <div className="dc-rev-slider">
          <button type="button" className="dc-rev-arrow mono" aria-label="รีวิวก่อนหน้า" onClick={() => slide(-1)} disabled={!canPrev}>←</button>
          <div className="dc-rev-track" ref={trackRef}>
            {cards.map((c, i) => (
              <div key={c.key} className="dc-rev-cell" style={{ transform: `rotate(${REV_TILT[i % REV_TILT.length]}deg)` }}>
                <div className="card" style={{ height: '100%', padding: 26, textAlign: 'left', background: 'var(--paper)', boxSizing: 'border-box' }}>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: 56, fontWeight: 700, color: 'var(--accent)', lineHeight: 0.7, marginBottom: 10 }}>&ldquo;</div>
                <div style={{ color: 'var(--accent)', letterSpacing: '.2em', marginBottom: 14, fontSize: 13 }}>{'+ '.repeat(c.rating).trim()}</div>
                <p className="u-clamp-3" style={{ fontFamily: 'Mitr', fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink)', margin: '0 0 22px' }}>{c.quote}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Mitr', fontSize: 14, flexShrink: 0 }}>{c.name.slice(0, 1)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
                    {c.workshop &&
                      (c.workshopId ? (
                        <Link
                          href={`/workshops/${c.workshopId}`}
                          className="mono"
                          title={c.workshop}
                          style={{ display: 'block', fontSize: 11, color: 'var(--teal-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', transition: 'color .15s ease' }}
                          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--teal)'; e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--teal-deep)'; e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          {c.workshop}
                        </Link>
                      ) : (
                        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.workshop}</div>
                      ))}
                  </div>
                </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="dc-rev-arrow mono" aria-label="รีวิวถัดไป" onClick={() => slide(1)} disabled={!canNext}>→</button>
        </div>

        {/* Phone-only: how many reviews there are, where you are in them, and
            a nudge to keep swiping. Hidden once the arrows come back. */}
        {cards.length > 1 && (
          <div className="dc-rev-dots">
            <div className="dc-rev-dot-row">
              {cards.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`รีวิวที่ ${i + 1}`}
                  aria-current={i === active}
                  className={i === active ? 'dc-rev-dot on' : 'dc-rev-dot'}
                  onClick={() => {
                    const el = trackRef.current;
                    if (!el) return;
                    const cell = el.firstElementChild as HTMLElement | null;
                    const step = cell ? cell.offsetWidth + 22 : el.clientWidth;
                    el.scrollTo({ left: i * step, behavior: 'smooth' });
                  }}
                />
              ))}
            </div>
            <div className="dc-rev-hint mono">
              {active + 1} / {cards.length}
              {active < cards.length - 1 && (
                <> · เลื่อนดูรีวิวอื่น <span aria-hidden>→</span></>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- Stats ---------------- */

function StatsSection({ stats }: { stats: SiteStats }) {
  const years = yearsSince(2022, 11, 15);
  const numbers = [
    { n: String(years), label: 'ปีที่ลุยกันมา', sub: 'ตั้งแต่ 2565' },
    { n: stats.workshops.toLocaleString(), label: 'ประสบการณ์', sub: 'Workshop Event Seminar' },
    { n: stats.participants.toLocaleString(), label: 'เพื่อนร่วมเดินทาง', sub: 'ทั่วประเทศ' },
    { n: String(stats.locations), label: 'สถานที่จัดงาน', sub: 'พื้นที่ปลอดภัย' },
  ];
  return (
    <section className="section">
      <div className="container">
        <div className="reveal-up" style={{ maxWidth: 760, marginBottom: 40 }}>
          <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 12 }}>— 04 · สถิติ</div>
          <h2 className="display-th" style={{ fontSize: 'clamp(30px,4.4vw,52px)', margin: 0, lineHeight: 1.15, color: 'var(--ink)' }}>
            ตัวเลขที่ทำให้เรา{' '}
            <span style={{ position: 'relative', display: 'inline-block', color: 'var(--teal)' }}>
              ภูมิใจ
              <svg viewBox="0 0 140 60" preserveAspectRatio="none" style={{ position: 'absolute', left: -12, right: -12, top: -8, bottom: -8, width: 'calc(100% + 24px)', height: 'calc(100% + 16px)', pointerEvents: 'none' }} aria-hidden="true">
                <ellipse cx="70" cy="30" rx="66" ry="25" fill="none" stroke="var(--teal)" strokeWidth="3" />
              </svg>
            </span>
          </h2>
        </div>
        <div className="card card-cream stats-grid" style={{ padding: '40px 30px' }}>
          {numbers.map((s) => (
            <div key={s.label}>
              <div style={{ fontFamily: 'Archivo Black', fontSize: 'clamp(34px,4.5vw,52px)', color: 'var(--ink)', lineHeight: 1 }}>
                {s.n}
                <span style={{ color: 'var(--accent)' }}>.</span>
              </div>
              <div className="display-th" style={{ fontSize: 18, color: 'var(--ink)', marginTop: 10 }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 5 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Page ---------------- */

export default function HomePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [featuredWorkshops, setFeaturedWorkshops] = useState<Workshop[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleCategories, setArticleCategories] = useState<ArticleCategory[]>([]);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [stats, setStats] = useState<SiteStats>({ workshops: 11, participants: 125, locations: 0 });

  // Every request the home page needs is tracked, so the loading screen's bar
  // moves as each one lands and the screen clears on the last of them.
  const track = useLoadingTracker();

  useEffect(() => {
    track(
      fetch('/api/workshops?status=active')
        .then((r) => r.json() as Promise<{ workshops: Workshop[] }>)
        .then((d) => setWorkshops(d.workshops || []))
        .catch(() => {}),
    );
    // Hero fan shows only admin-starred workshops.
    track(
      fetch('/api/workshops?featured=1&public=1')
        .then((r) => r.json() as Promise<{ workshops: Workshop[] }>)
        .then((d) => setFeaturedWorkshops(d.workshops || []))
        .catch(() => {}),
    );
    track(
      fetch('/api/articles')
        .then((r) => r.json() as Promise<{ articles: Article[] }>)
        .then((d) => setArticles(d.articles || []))
        .catch(() => {}),
    );
    track(
      fetch('/api/article-categories')
        .then((r) => r.json() as Promise<{ categories: ArticleCategory[] }>)
        .then((d) => setArticleCategories(d.categories || []))
        .catch(() => {}),
    );
    track(
      fetch('/api/reviews?featured=1&limit=10')
        .then((r) => r.json() as Promise<{ reviews: PublicReview[] }>)
        .then((d) => setReviews(d.reviews || []))
        .catch(() => {}),
    );
    track(
      fetch('/api/stats')
        .then((r) => r.json() as Promise<Partial<SiteStats>>)
        .then((d) => setStats({ workshops: d.workshops ?? 11, participants: d.participants ?? 125, locations: d.locations ?? 0 }))
        .catch(() => {}),
    );
  }, [track]);

  const leadArticle = articles.find((a) => a.featured) || articles[0];
  const sideArticles = articles.filter((a) => a.id !== leadArticle?.id).slice(0, 3);

  return (
    <div className="home-dc">
      <Hero workshops={featuredWorkshops} />
      <UpcomingEvents workshops={workshops} />
      <ArticlesSection lead={leadArticle} side={sideArticles} categories={articleCategories} />
      <ReviewsSection reviews={reviews} />
      <StatsSection stats={stats} />
    </div>
  );
}
