'use client';

/* My Journey — "Journey + Diary v2": a life map. Every attended workshop is a
 * pin on one winding path drawn up the page, oldest at the bottom, with a
 * "คุณอยู่ที่นี่" marker that follows the reader down the map, a question mark
 * for the next stop at the top and the start flag at the bottom. Tapping a
 * card opens the stop in a popup (poster, photos, stars, the memory of the
 * day — which is that day's diary page); the popup opens to a full page too.
 * Phones get the same stops on a single dashed rail. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { type JourneyItem, fmtJourneyDate } from '@/lib/journey';
import { getWorkshopDays } from '@/lib/workshop-utils';
import { TH_MON, css } from '@/lib/diary';

export function itemHours(it: JourneyItem): number {
  const toMin = (t: string | null) => {
    const [h, m] = (t || '').split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
  };
  const start = toMin(it.time_start);
  const end = toMin(it.time_end);
  if (start == null || end == null || end <= start) return 0;
  const days = getWorkshopDays({ workshop_type: it.workshop_type as 'one_day', date: it.date, end_date: it.end_date, dates_json: it.dates_json, time_end: it.time_end }).length;
  return ((end - start) / 60) * Math.max(1, days);
}
const thDate = (iso: string) => `${+iso.slice(8, 10)} ${TH_MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const CAL = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const PEN = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }}>
    <path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20z" />
    <path d="M13.5 7.3l3.2 3.2" />
  </svg>
);
const PHOTO = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M20.5 16l-5-5-8.5 8.5" />
  </svg>
);

/** A3 poster, shown whole — never cropped. */
export function Poster({ src, style }: { src: string | null; style?: React.CSSProperties }) {
  return (
    <div style={{ aspectRatio: '297 / 420', background: 'var(--cream)', overflow: 'hidden', ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
    </div>
  );
}

function StopCard({ it, onOpen, style }: { it: JourneyItem; onOpen: () => void; style: React.CSSProperties }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} className="card" style={{ cursor: 'pointer', boxShadow: '0 24px 50px -30px rgba(13,30,29,.5)', overflow: 'hidden', ...style }}>
      <Poster src={it.image_url} />
      <div style={css('padding:15px 16px 17px;display:flex;flex-direction:column;gap:10px')}>
        <div style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:16px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{it.title}</div>
        <div style={css('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
          <div style={css("display:flex;align-items:center;gap:7px;font-family:var(--font-mono),'IBM Plex Sans Thai',ui-monospace,monospace;font-size:10.5px;letter-spacing:.1em;color:var(--muted)")}>
            <span style={css('display:flex;color:var(--teal)')}>{CAL}</span>
            {fmtJourneyDate(it.date)}
          </div>
          <div style={css('display:flex;align-items:center;gap:6px;color:var(--teal);font-size:12.5px;font-weight:600;white-space:nowrap')}>{PEN}จดบันทึกความทรงจำ</div>
        </div>
      </div>
    </div>
  );
}

/** Smooth path through the points (Catmull-Rom as cubic Béziers). */
function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const SPACING = 425;

/** The desktop life map. `items` newest first. */
export function JourneyMap({ items, onOpen }: { items: JourneyItem[]; onOpen: (i: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pathEl = useRef<SVGPathElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const pins = useMemo(() => items.map((_, i) => ({ x: i % 2 === 0 ? 560 : 620, y: 400 + i * SPACING })), [items]);
  const H = 400 + Math.max(0, items.length - 1) * SPACING + 360;
  const start = { x: 600, y: H - 60 };
  const d = smooth([start, ...[...pins].reverse()]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 1180)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The "you are here" marker glides along the path to the pin nearest the
  // middle of the screen.
  useEffect(() => {
    const p = pathEl.current, c = canvas.current, m = mark.current;
    if (!p || !c || !m || !pins.length) return;
    const L = p.getTotalLength();
    const lens = pins.map((n) => {
      let bl = 0, bd = 1e9;
      for (let i = 0; i <= 400; i++) {
        const q = p.getPointAtLength((L * i) / 400);
        const dd = Math.hypot(q.x - n.x, q.y - n.y);
        if (dd < bd) {
          bd = dd;
          bl = (L * i) / 400;
        }
      }
      return bl;
    });
    let at = -1;
    let cur: number | null = null;
    let anim = 0;
    let raf = 0;
    const place = (l: number) => {
      const q = p.getPointAtLength(l);
      m.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px)`;
    };
    const tick = () => {
      const r = c.getBoundingClientRect();
      const sc = r.width / 1180 || 1;
      const ty = (window.innerHeight * 0.45 - r.top) / sc;
      let best = 0;
      pins.forEach((n, i) => {
        if (Math.abs(n.y - ty) < Math.abs(pins[best].y - ty)) best = i;
      });
      if (best === at) return;
      const to = lens[best];
      const from = cur == null ? to : cur;
      at = best;
      cancelAnimationFrame(anim);
      const t0 = performance.now(), dur = Math.min(650, 220 + Math.abs(to - from) * 0.45);
      const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const stepF = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        cur = from + (to - from) * ease(k);
        place(cur);
        if (k < 1) anim = requestAnimationFrame(stepF);
      };
      anim = requestAnimationFrame(stepF);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tick();
      });
    };
    tick();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(anim);
      cancelAnimationFrame(raf);
    };
  }, [pins]);

  return (
    <div ref={wrap} style={{ width: '100%', height: H * scale, marginTop: 10 }}>
      <div ref={canvas} className="jd-anim" style={{ position: 'relative', width: 1180, height: H, margin: scale < 1 ? 0 : '0 auto', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <svg viewBox={`0 0 1180 ${H}`} width="1180" height={H} style={css('position:absolute;inset:0;pointer-events:none')} fill="none" stroke="var(--teal-deep)" strokeOpacity=".32" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M850 560 L882 514 L900 538 L922 502 L960 560" />
          <path d="M910 520 L922 502 L932 516" />
          <path d="M940 590 L972 544 L990 568 L1012 532 L1050 590" />
          <path d="M1000 550 L1012 532 L1022 546" />
          <path d="M90 402.4 L80.4 420 L99.6 420 Z M90 420 L90 426.4" />
          <path d="M118 414 L106 436 L130 436 Z M118 436 L118 444" />
          {items.length > 1 && <path d="M110 958 L98 980 L122 980 Z M110 980 L110 988 M140 982.4 L130.4 1000 L149.6 1000 Z M140 1000 L140 1006.4" />}
          {items.length > 0 && <path d={`M${pins[0].x} ${pins[0].y} C 658 288, 690 230, 680 150`} stroke="var(--teal)" strokeOpacity=".55" strokeWidth="5" strokeDasharray="2 14" />}
          {d && <path d={d} stroke="#fff" strokeOpacity="1" strokeWidth="22" />}
          {d && <path ref={pathEl} d={d} stroke="var(--teal)" strokeOpacity="1" strokeWidth="6" strokeDasharray="18 16" style={{ animation: 'dash 2.6s cubic-bezier(.2,.7,.2,1) both' }} />}
        </svg>

        <div style={css('position:absolute;left:700px;top:40px;width:380px;background:var(--ink);color:#fff;border-radius:22px;padding:26px 30px;box-shadow:0 30px 60px -30px rgba(13,30,29,.6);z-index:2')}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>NEXT DESTINATION</span>
          <div style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:22px;line-height:1.35;margin:12px 0 18px')}>
            เส้นทางยังไม่จบ
            <br />
            หมุดถัดไปจะอยู่ตรงไหนดี?
          </div>
          <Link href="/workshops" className="btn" style={css('display:inline-flex;background:var(--accent);color:var(--ink)')}>
            ดูกิจกรรมทั้งหมด →
          </Link>
          <span style={css("display:block;font-family:Caveat,'Mitr',cursive;font-size:24px;color:var(--accent);margin-top:14px;transform:rotate(-3deg)")}>it can be fun! ✺</span>
        </div>
        <div style={css("position:absolute;left:656px;top:126px;width:48px;height:48px;border-radius:50%;background:var(--cream);box-shadow:inset 0 0 0 2.5px var(--teal);display:flex;align-items:center;justify-content:center;font-family:'Archivo Black','Mitr',sans-serif;font-size:20px;color:var(--teal);z-index:3")}>?</div>

        {items.map((it, i) => {
          const pin = pins[i];
          const left = i % 2 === 0;
          const n = items.length - i;
          return (
            <div key={it.booking_id}>
              <StopCard it={it} onOpen={() => onOpen(i)} style={{ position: 'absolute', left: left ? 230 : 700, top: pin.y - 220, width: 280, transform: `rotate(${left ? -1.5 : 1.5}deg)`, animation: 'riseIn .8s cubic-bezier(.2,.7,.2,1) both', animationDelay: `${0.15 * (i + 1)}s` }} />
              <div style={{ position: 'absolute', left: pin.x - 24, top: pin.y - 24, width: 48, height: 48, zIndex: 3 }}>
                <span style={css("position:relative;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:var(--ink);color:#fff;font-family:'Archivo Black','Mitr',sans-serif;font-size:16px;box-shadow:0 0 0 5px var(--cream),0 12px 24px -10px rgba(13,30,29,.6)")}>{String(n).padStart(2, '0')}</span>
                <div style={css('position:absolute;top:4px;' + (left ? 'left:64px' : 'right:64px;text-align:right') + ';display:flex;flex-direction:column;gap:4px;white-space:nowrap')}>
                  <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:15px;line-height:1;color:var(--ink)')}>จุดที่ {n}</span>
                  <span style={css('font-size:12.5px;line-height:1;color:var(--muted)')}>{(i === 0 ? 'ล่าสุด · ' : '') + thDate(it.date)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {items.length > 0 && (
          <div ref={mark} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, zIndex: 6, pointerEvents: 'none', transform: `translate(${pins[0].x}px,${pins[0].y}px)`, willChange: 'transform' }}>
            <span style={css('position:absolute;left:-40px;top:-40px;width:80px;height:80px;border-radius:50%;background:rgba(13,138,126,.3);animation:jPulse 2.4s cubic-bezier(.2,.7,.2,1) infinite')} />
            <span style={css('position:absolute;left:-33px;top:-33px;width:66px;height:66px;border-radius:50%;box-shadow:inset 0 0 0 4px var(--teal),0 0 0 3px var(--accent)')} />
            <span style={css('position:absolute;left:0;top:-82px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center')}>
              <span style={css('display:inline-flex;align-items:center;gap:6px;white-space:nowrap;background:var(--teal);color:#fff;border-radius:999px;padding:7px 14px;font-family:Mitr,sans-serif;font-weight:500;font-size:13.5px;line-height:1;box-shadow:0 12px 24px -12px rgba(13,30,29,.6)')}>คุณอยู่ที่นี่</span>
              <span style={css('width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid var(--teal)')} />
            </span>
          </div>
        )}

        <div style={{ position: 'absolute', left: start.x - 16, top: start.y - 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={css('width:32px;height:32px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px var(--cream);display:flex;align-items:center;justify-content:center;color:var(--ink)')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
            </svg>
          </span>
          <div style={css('display:flex;flex-direction:column;gap:3px')}>
            <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:15px;line-height:1')}>จุดเริ่มต้น</span>
            <span style={css('font-size:12.5px;line-height:1;color:var(--muted);white-space:nowrap')}>ก้าวแรกบน allsoullearn · {items.length ? items[items.length - 1].date.slice(0, 4) : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Phones: the same stops on one dashed rail. */
export function JourneyRail({ items, onOpen }: { items: JourneyItem[]; onOpen: (i: number) => void }) {
  return (
    <div style={css('position:relative;padding-left:26px')}>
      <div style={css('position:absolute;left:5px;top:6px;bottom:40px;width:0;border-left:3px dashed #9fd5cd')} />
      <div style={css('position:absolute;left:-1px;top:0;width:15px;height:15px;border-radius:50%;background:var(--accent)')} />
      {items.map((it, i) => (
        <div key={it.booking_id} style={{ marginTop: i ? 26 : 0 }}>
          <StopCard it={it} onOpen={() => onOpen(i)} style={{ borderRadius: 18, boxShadow: '0 8px 24px -18px rgba(13,30,29,.5)' }} />
        </div>
      ))}
    </div>
  );
}

type StopProps = {
  it: JourneyItem;
  index: number;
  memo: string;
  onSaveMemo: (text: string) => Promise<void> | void;
  onReviewed: (rating: number, comment: string | null) => void;
  onOpenDiary: () => void;
};

function useReview(it: JourneyItem, onReviewed: StopProps['onReviewed']) {
  const [rating, setRating] = useState(it.review_rating || 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(it.review_comment || '');
  const [msg, setMsg] = useState<string | null>(null);
  const send = useCallback(
    async (r: number, comment: string) => {
      setRating(r);
      setMsg(null);
      const res = await fetch(`/api/workshops/${it.workshop_id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: r, comment }) }).catch(() => null);
      if (res && res.ok) {
        onReviewed(r, comment.trim() || null);
        setMsg('ขอบคุณที่รีวิว ✺');
      } else setMsg('ส่งรีวิวไม่สำเร็จ');
    },
    [it.workshop_id, onReviewed],
  );
  return { rating, hover, setHover, text, setText, msg, send };
}

function Stars({ value, hover, onHover, onPick, size = 26 }: { value: number; hover: number; onHover: (n: number) => void; onPick: (n: number) => void; size?: number }) {
  const shown = hover || value;
  return (
    <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => onHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" aria-label={`${i} ดาว`} onClick={() => onPick(i)} onMouseEnter={() => onHover(i)} style={css('border:0;background:transparent;cursor:pointer;font-size:' + size + 'px;padding:0;line-height:1;transition:.15s;color:' + (i <= shown ? 'var(--accent)' : '#e8edec'))}>
          ★
        </button>
      ))}
    </div>
  );
}

function MemoBox({ memo, onSaveMemo, onOpenDiary, dateLabel }: { memo: string; onSaveMemo: StopProps['onSaveMemo']; onOpenDiary: () => void; dateLabel: string }) {
  const [text, setText] = useState(memo);
  const [saved, setSaved] = useState(false);
  return (
    <div style={css('position:relative;background:#fffdf7;border-radius:18px;padding:18px 20px 16px;box-shadow:inset 0 0 0 1px var(--cream-deep)')}>
      <div style={css('display:flex;align-items:center;gap:9px')}>
        <span style={css('display:flex;color:var(--teal)')}>{PEN}</span>
        <span style={css('font-weight:600;font-size:14.5px')}>ความทรงจำของวันนั้น</span>
        <span style={css('font-size:12px;color:var(--muted)')}>· เห็นคนเดียว</span>
      </div>
      <div style={css('position:relative;margin-top:8px')}>
        <div style={css('position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0 31px,rgba(13,138,126,.18) 31px 32px);pointer-events:none')} />
        <textarea
          value={text}
          maxLength={220}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="วันนั้นรู้สึกยังไงบ้าง…"
          style={css("position:relative;display:block;width:100%;box-sizing:border-box;border:0;outline:none;background:transparent;resize:none;padding:4px 2px 0;font-family:Caveat,'Mitr',cursive;font-size:23px;line-height:32px;color:var(--ink)")}
        />
      </div>
      <div style={css('display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap')}>
        <button
          type="button"
          className="btn btn-ink btn-sm"
          onClick={async () => {
            await onSaveMemo(text);
            setSaved(true);
          }}
        >
          {saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
        </button>
        <button type="button" onClick={onOpenDiary} style={css('display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--teal)')}>
          เปิดหน้า {dateLabel} ในสมุด →
        </button>
      </div>
    </div>
  );
}

/** The popup for one stop. */
export function StopModal({ onClose, onFull, ...p }: StopProps & { onClose: () => void; onFull: () => void }) {
  const { it, index } = p;
  const rv = useReview(it, p.onReviewed);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const date = fmtJourneyDate(it.date);
  return (
    <div className="jd-modal-back" onClick={onClose} style={css('position:fixed;inset:0;background:rgba(13,30,29,.6);backdrop-filter:blur(8px);z-index:100;display:flex;align-items:center;justify-content:center;padding:32px')}>
      <div className="jd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={it.title}>
        <div style={css('position:relative;overflow:hidden;background-color:var(--teal);background-image:radial-gradient(rgba(255,255,255,.14) 1.2px,transparent 1.4px);background-size:22px 22px;padding:34px 34px 28px;display:flex;flex-direction:column;gap:18px')}>
          <div style={css('display:flex;align-items:center;gap:10px;color:#fff')}>
            <span style={css("display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--ink);font-family:'Archivo Black','Mitr',sans-serif;font-size:14px;box-shadow:0 0 0 4px rgba(255,255,255,.18)")}>{String(index).padStart(2, '0')}</span>
            <span style={css('display:flex;flex-direction:column;gap:3px')}>
              <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:15px;line-height:1')}>หมุดบนแผนที่ชีวิต</span>
              <span style={css('font-size:12px;line-height:1;color:rgba(255,255,255,.75)')}>My Journey</span>
            </span>
          </div>
          <div style={css('position:relative;transform:rotate(-2deg);max-width:292px;margin:0 auto;width:100%')}>
            <div style={css('position:absolute;left:36%;top:-9px;width:28%;height:18px;background:rgba(245,194,67,.75);transform:rotate(3deg);z-index:2')} />
            <div style={css('border-radius:8px;overflow:hidden;box-shadow:0 26px 50px -22px rgba(13,30,29,.75)')}>
              <Poster src={it.image_url} />
            </div>
            <div style={css("position:absolute;right:-14px;bottom:26px;transform:rotate(-12deg);width:92px;height:92px;border-radius:50%;background:rgba(255,253,247,.94);box-shadow:inset 0 0 0 2.5px var(--teal-deep),inset 0 0 0 6px rgba(255,253,247,.94),inset 0 0 0 7.5px var(--teal-deep);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--teal-deep);z-index:3")}>
              <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:13px;line-height:1")}>VISITED</span>
              <span style={css('font-size:18px;line-height:1')}>✓</span>
              <span style={css("font-family:var(--font-mono),'IBM Plex Sans Thai',ui-monospace,monospace;font-size:9.5px;letter-spacing:.08em;line-height:1")}>{date}</span>
            </div>
          </div>
          <span style={css("font-family:var(--font-mono),'IBM Plex Sans Thai',ui-monospace,monospace;font-size:10.5px;letter-spacing:.14em;color:rgba(255,255,255,.75);text-align:center")}>A3 · 297 × 420 MM</span>
        </div>

        <div style={css('display:flex;flex-direction:column;gap:20px;padding:30px 34px 32px;min-width:0')}>
          <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:8px')}>
            <button type="button" onClick={onFull} style={css('display:inline-flex;align-items:center;gap:6px;height:36px;border:0;border-radius:999px;padding:0 14px;background:var(--cream);cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:var(--ink)')}>
              เปิดหน้าเต็ม ↗
            </button>
            <button type="button" aria-label="ปิด" onClick={onClose} style={css('width:36px;height:36px;border:0;border-radius:50%;background:var(--ink);color:#fff;cursor:pointer;font-size:16px;line-height:1')}>
              ×
            </button>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:14px;margin-top:-8px')}>
            <h2 style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:28px;line-height:1.25;margin:0;text-wrap:pretty')}>{it.title}</h2>
            <div style={css('display:flex;gap:8px;flex-wrap:wrap')}>
              <span style={css('display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:7px 13px;background:var(--cream);font-size:13px;font-weight:500;color:var(--ink)')}>
                <span style={css('display:flex;color:var(--teal)')}>{CAL}</span>
                {date}
              </span>
              <span style={css('display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:7px 13px;background:var(--cream);font-size:13px;font-weight:500;color:var(--ink)')}>
                {it.time_start}–{it.time_end}
              </span>
              <span style={css('display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:7px 13px;background:#e6f4f2;font-size:13px;font-weight:600;color:var(--teal-deep)')}>✓ เข้าร่วมแล้ว</span>
            </div>
          </div>
          <div className="jd-2col" style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px')}>
            {it.photos_drive_url ? (
              <a href={it.photos_drive_url} target="_blank" rel="noopener noreferrer" style={css('display:flex;flex-direction:column;gap:14px;background:var(--ink);color:#fff;border-radius:18px;padding:18px 20px;text-decoration:none')}>
                <span style={css('display:flex;align-items:center;justify-content:space-between')}>
                  <span style={css('display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:var(--teal)')}>{PHOTO}</span>
                  <span style={css('color:var(--accent);font-size:17px')}>↗</span>
                </span>
                <span style={css('display:flex;flex-direction:column;gap:3px')}>
                  <span style={css('font-weight:600;font-size:14.5px')}>รูปกิจกรรม</span>
                  <span style={css('font-size:12.5px;color:#9ab1ae')}>Google Drive · เฉพาะผู้เข้าร่วม</span>
                </span>
              </a>
            ) : (
              <div style={css('display:flex;flex-direction:column;gap:6px;justify-content:center;background:var(--cream);border-radius:18px;padding:18px 20px;font-size:13px;color:var(--muted)')}>รูปกิจกรรมยังไม่ขึ้น — ทีมงานจะแนบลิงก์ให้หลังจบงาน</div>
            )}
            <div style={css('display:flex;flex-direction:column;gap:12px;background:var(--cream);border-radius:18px;padding:18px 20px')}>
              <span style={css('font-weight:600;font-size:14.5px')}>กิจกรรมนี้เป็นยังไง?</span>
              <Stars value={rv.rating} hover={rv.hover} onHover={rv.setHover} onPick={(n) => rv.send(n, rv.text)} />
              <span style={css('font-size:12.5px;color:var(--muted)')}>{rv.msg || (rv.rating ? `${rv.rating}/5 · ขอบคุณที่รีวิว` : 'ยังไม่ได้ให้คะแนน')}</span>
            </div>
          </div>
          <MemoBox memo={p.memo} onSaveMemo={p.onSaveMemo} onOpenDiary={p.onOpenDiary} dateLabel={date} />
        </div>
      </div>
    </div>
  );
}

/** The full page for one stop ("เปิดหน้าเต็ม"). */
export function StopFull({ onBack, ...p }: StopProps & { onBack: () => void }) {
  const { it, index } = p;
  const rv = useReview(it, p.onReviewed);
  const date = fmtJourneyDate(it.date);
  return (
    <div style={css('max-width:1180px;margin:0 auto;padding:36px 20px 90px')}>
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
        ← My Journey
      </button>
      <div className="jd-full">
        <div className="jd-full-poster" style={css('position:sticky;top:100px')}>
          <div style={css('width:100%;border-radius:14px;overflow:hidden;box-shadow:0 30px 60px -30px rgba(13,30,29,.45)')}>
            <Poster src={it.image_url} />
          </div>
          <div className="eyebrow" style={{ color: 'var(--muted)', marginTop: 12, textAlign: 'center' }}>
            A3 · 297 × 420 MM · แสดงเต็มใบ ไม่ครอป
          </div>
        </div>
        <div>
          <span className="eyebrow" style={{ color: 'var(--teal)' }}>
            เส้นทางของฉัน · จุดที่ {String(index).padStart(2, '0')}
          </span>
          <h1 style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:clamp(28px,4vw,40px);line-height:1.15;margin:14px 0 16px')}>{it.title}</h1>
          <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
            <span className="tag">✓ เสร็จสิ้นกิจกรรม</span>
            <span className="tag tag-ink">★ เข้าร่วมแล้ว</span>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>
              {date} · {it.time_start}–{it.time_end}
            </span>
          </div>
          {it.photos_drive_url && (
            <a href={it.photos_drive_url} target="_blank" rel="noopener noreferrer" style={css('display:flex;align-items:center;gap:16px;background:#e6f4f2;border-radius:18px;padding:18px 22px;margin-top:26px;color:var(--ink);text-decoration:none')}>
              <span style={css('width:44px;height:44px;border-radius:12px;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center')}>{PHOTO}</span>
              <span style={{ flex: 1 }}>
                <span style={css('display:block;font-weight:600;font-size:15px')}>ดูรูปกิจกรรม (Google Drive)</span>
                <span style={css('display:block;font-size:12.5px;color:var(--muted);margin-top:2px')}>เฉพาะผู้เข้าร่วมกิจกรรม</span>
              </span>
              <span style={{ color: 'var(--teal)' }}>↗</span>
            </a>
          )}
          <div style={css('margin-top:30px;background:#fff;border-radius:22px;padding:26px 28px;box-shadow:inset 0 0 0 1px var(--cream-deep)')}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>รีวิวกิจกรรมนี้</span>
            <div style={css('display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap')}>
              <Stars value={rv.rating} hover={rv.hover} onHover={rv.setHover} onPick={(n) => rv.send(n, rv.text)} />
              <span style={css('font-size:13.5px;color:var(--muted)')}>{rv.msg || (rv.rating ? `${rv.rating}/5 · ขอบคุณที่รีวิว` : 'ยังไม่ได้ให้คะแนน')}</span>
            </div>
            <textarea value={rv.text} onChange={(e) => rv.setText(e.target.value)} className="field" rows={3} placeholder="เล่าให้คนอื่นฟังหน่อยว่าได้อะไรกลับไปบ้าง" style={css('margin-top:16px;resize:vertical;font-family:inherit')} />
            <button type="button" onClick={() => rv.rating && rv.send(rv.rating, rv.text)} className="btn btn-teal btn-sm" style={{ marginTop: 14, opacity: rv.rating ? 1 : 0.5 }} disabled={!rv.rating}>
              ส่งรีวิว ★
            </button>
          </div>
          <div style={{ marginTop: 22 }}>
            <MemoBox memo={p.memo} onSaveMemo={p.onSaveMemo} onOpenDiary={p.onOpenDiary} dateLabel={date} />
          </div>
        </div>
      </div>
    </div>
  );
}
