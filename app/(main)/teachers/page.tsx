'use client';

/* The makers page — everyone who teaches here. Built from the "Teachers v2"
 * design: a big hero with site totals, a marquee, one maker in focus that
 * rotates on its own (their workshops on a rail, the rounds they have open),
 * then the whole grid filtered by craft and sorted, and a call to host with
 * us. The site header and footer come from the layout. */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/i18n';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { fmtDate } from '@/lib/datetime';
import type { TeacherCard } from '@/app/api/teachers/route';

type Stats = { makers: number; rounds: number; people: number };

const SPOT_MS = 7000;
const PH_CLASS = ['ph-teal', 'ph-cream', 'ph-teal-100', 'ph-accent', 'ph-teal'];

/** First syllable of a Thai display name (or first two letters) for the avatar. */
function initialOf(display: string): string {
  const bare = display.replace(/^(ครู|อาจารย์|คุณ|พี่)/, '') || display;
  const m = bare.match(/^[ก-ฮ][ะ-๎]*[ก-ฮ]?[ะ-๎]*/);
  return m ? m[0] : bare.slice(0, 2);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export default function TeachersPage() {
  const { lang } = useLang();
  const th = lang === 'th';
  const [teachers, setTeachers] = useState<TeacherCard[] | null>(null);
  const [stats, setStats] = useState<Stats>({ makers: 0, rounds: 0, people: 0 });
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'soon' | 'name'>('soon');
  const [hover, setHover] = useState<string | null>(null);
  const [spot, setSpot] = useState(0);
  const [prog, setProg] = useState(0);
  const [poster, setPoster] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const track = useLoadingTracker();

  useEffect(() => {
    track(
      fetch('/api/teachers')
        .then((r) => (r.ok ? (r.json() as Promise<{ teachers: TeacherCard[]; stats: Stats }>) : { teachers: [], stats: { makers: 0, rounds: 0, people: 0 } }))
        .then((d) => {
          setTeachers(d.teachers || []);
          setStats(d.stats || { makers: 0, rounds: 0, people: 0 });
        })
        .catch(() => setTeachers([])),
    );
  }, [track]);

  // The maker in focus moves on by itself; the thin bar under the arrows
  // shows how long until it does.
  const count = teachers?.length || 0;
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => {
      setProg((p) => {
        const n = p + 200 / SPOT_MS;
        if (n >= 1) {
          setSpot((s) => s + 1);
          setPoster(null);
          return 0;
        }
        return n;
      });
    }, 200);
    return () => clearInterval(id);
  }, [count]);

  const crafts = useMemo(() => {
    const seen = new Map<string, number>();
    (teachers || []).forEach((t) => t.crafts.forEach((c) => seen.set(c, (seen.get(c) || 0) + 1)));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [teachers]);

  const list = useMemo(() => {
    const l = (teachers || []).filter((t) => filter === 'all' || t.crafts.includes(filter));
    return l.sort((a, b) => (sort === 'soon' ? b.upcoming - a.upcoming || a.name.localeCompare(b.name, 'th') : a.name.localeCompare(b.name, 'th')));
  }, [teachers, filter, sort]);

  if (teachers === null) return null;

  const goSpot = (delta: number) => {
    setSpot((s) => (s + count + delta) % count);
    setPoster(null);
    setProg(0);
  };
  const nudgeRail = (dir: number) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const s = count ? teachers[spot % count] : null;
  const sDisplay = s ? s.nickname || s.name : '';
  const shortDate = (d: string) => fmtDate(d, lang, 'medium');

  return (
    <div className="tm" data-lang={lang}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="tm-hero">
        <svg aria-hidden="true" width="220" height="90" viewBox="0 0 220 90" className="tm-hero-doodle">
          <path d="M8 62 C 46 18, 70 78, 108 36 S 168 72, 212 26" fill="none" stroke="#f5c243" strokeWidth="7" strokeLinecap="round" strokeDasharray="400" className="tm-draw" />
        </svg>
        <span aria-hidden="true" className="tm-hero-star">✺</span>
        <div className="tm-wrap">
          <span className="tm-eyebrow">{th ? '01 — ผู้สอน & ผู้จัด' : '01 — Makers & hosts'}</span>
          <h1 className="tm-title">
            THE
            <br />
            MAKERS<span style={{ color: 'var(--teal)' }}>.</span>
          </h1>
          <div className="tm-hero-row">
            <div style={{ maxWidth: 560 }}>
              <h2 className="tm-h2">{th ? 'แหล่งรวมคนที่ตั้งใจมอบประสบการณ์บางอย่าง' : 'The people who set out to hand you an experience'}</h2>
              <p className="tm-lede">
                {th
                  ? 'ไม่ใช่แค่คนสอน แต่เป็นคนออกแบบวันหนึ่งวันให้คุณได้อยู่กับตัวเอง เลือกจากงานที่เขาถนัด อ่านสิ่งที่เขาเชื่อ แล้วค่อยเลือกวัน.'
                  : 'Not just teachers — people who design a day where you get to be with yourself. Browse by craft, read what they believe, then pick a day.'}
              </p>
              {th ? (
                <span className="tm-hand-th">มาทำความรู้จักกันก่อน ✺</span>
              ) : (
                <span className="tm-hand-en">come say hello ✺</span>
              )}
            </div>
            <div className="tm-stats">
              <Stat n={stats.makers} label={th ? 'ผู้สอน & ผู้จัด' : 'makers & hosts'} />
              <Stat n={stats.rounds} label={th ? 'รอบที่จัดมาแล้ว' : 'rounds hosted'} />
              <Stat n={stats.people} label={th ? 'คนที่ร่วมเดินทาง' : 'people joined'} teal />
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee ──────────────────────────────────────────── */}
      <div className="tm-marquee">
        <div className="tm-marquee-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {th
                ? 'WORKSHOP · CAMP · ORGANIZE · เรียนรู้นอกห้องเรียน · WORKSHOP · CAMP · ORGANIZE · ✺ · '
                : 'WORKSHOP · CAMP · ORGANIZE · LEARN BEYOND THE ROOM · WORKSHOP · CAMP · ORGANIZE · ✺ · '}
            </span>
          ))}
        </div>
      </div>

      {/* ── Maker in focus ───────────────────────────────────── */}
      {s && (
        <section style={{ padding: '72px 0 0' }}>
          <div className="tm-wrap">
            <span className="tm-eyebrow">{th ? '02 — คนที่เราอยากให้รู้จัก' : '02 — Maker in focus'}</span>
            <div className="tm-spot">
              <div className="tm-spot-card">
                <span aria-hidden="true" className="tm-spot-no">{pad2((spot % count) + 1)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                  <Avatar t={s} size={56} />
                  <div style={{ minWidth: 0 }}>
                    <div className="display-th" style={{ fontWeight: 500, fontSize: 21, lineHeight: 1.15 }}>{sDisplay}</div>
                    <div className="tm-meta" style={{ marginTop: 5 }}>
                      {s.crafts.length ? s.crafts.slice(0, 2).join(' · ') : th ? 'ผู้สอน' : 'Teacher'}
                      {' · '}
                      {th ? `จัดมาแล้ว ${s.hosted} รอบ` : `${s.hosted} rounds hosted`}
                    </div>
                  </div>
                </div>
                <p className="tm-quote">
                  “<span className="tm-hl">{s.quote ? s.quote.comment : s.bio || (th ? 'ยังไม่มีคำบอกเล่า — มาเป็นคนแรกที่เล่าให้ฟัง' : 'No words yet — be the first to tell us.')}</span>”
                </p>
                <span className="tm-meta" style={{ marginTop: 16 }}>
                  {s.quote ? (th ? `— จากผู้เข้าร่วม ${s.quote.workshop}` : `— a participant of ${s.quote.workshop}`) : th ? '— จากประวัติผู้สอน' : '— from their profile'}
                </span>
                <div className="tm-spot-foot">
                  <Link href={`/teachers/${s.id}`} className="btn btn-ink">
                    {th ? 'ดูโปรไฟล์และปฏิทิน' : 'Profile & calendar'} <span className="mono">→</span>
                  </Link>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={() => goSpot(-1)} aria-label="Previous" className="tm-round-btn">‹</button>
                  <button type="button" onClick={() => goSpot(1)} aria-label="Next" className="tm-round-btn">›</button>
                  <span className="tm-counter">
                    <span>{pad2((spot % count) + 1)} / {pad2(count)}</span>
                    <span className="tm-bar"><span style={{ width: `${Math.round(prog * 100)}%` }} /></span>
                  </span>
                </div>
              </div>

              <div className="tm-spot-side">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span className="tm-meta">{th ? 'workshop ที่เขาจัด' : 'workshops they host'}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={() => nudgeRail(-1)} aria-label="Scroll left" className="tm-round-btn tm-round-btn-sm">‹</button>
                    <button type="button" onClick={() => nudgeRail(1)} aria-label="Scroll right" className="tm-round-btn tm-round-btn-sm">›</button>
                  </div>
                  <div ref={railRef} className="tm-rail">
                    {s.works.length === 0 && (
                      <span className="ph ph-cream tm-work" style={{ aspectRatio: '3 / 4' }}>{th ? 'ยังไม่มี' : 'none yet'}</span>
                    )}
                    {s.works.map((w, i) => {
                      const key = `${s.id}-${i}`;
                      const on = poster === key;
                      return (
                        <Link
                          key={w.id}
                          href={`/workshops/${w.id}`}
                          className={`tm-work ${w.image_url ? '' : `ph ${PH_CLASS[i % PH_CLASS.length]}`}`}
                          style={{ transform: on ? 'scale(1.05)' : 'none' }}
                          onMouseEnter={() => setPoster(key)}
                          onMouseLeave={() => setPoster(null)}
                          onFocus={() => setPoster(key)}
                          onBlur={() => setPoster(null)}
                          onTouchStart={() => setPoster(key)}
                        >
                          {w.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.image_url} alt="" />
                          )}
                          <span aria-hidden="true" className="tm-work-no">{pad2(i + 1)}</span>
                          <span aria-hidden="true" className="tm-work-star">✺</span>
                          <span className="tm-work-name" style={{ transform: `translateY(${on ? '0%' : '101%'})` }}>{w.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <div className="tm-rounds">
                  <div className="tm-meta" style={{ marginBottom: 14 }}>{th ? 'รอบที่เปิดรับ' : 'open rounds'}</div>
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                    {s.rounds.length === 0 ? (
                      <div className="tm-round-row">
                        <span className="tm-round-date">—</span>
                        <span style={{ fontSize: 13.5 }}>{th ? 'ยังไม่มีรอบที่เปิดรับ' : 'No open rounds yet'}</span>
                      </div>
                    ) : (
                      s.rounds.map((r) => (
                        <Link key={r.id} href={`/workshops/${r.id}`} className="tm-round-row">
                          <span className="tm-round-date">{shortDate(r.date)}</span>
                          <span style={{ fontSize: 13.5, lineHeight: 1.5, minWidth: 0 }}>{r.title}</span>
                          <span style={{ flex: 1 }} />
                          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{r.booked}/{r.max}</span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Everyone ─────────────────────────────────────────── */}
      <section style={{ padding: '72px 0 96px' }}>
        <div className="tm-wrap">
          <div className="tm-grid-head">
            <div>
              <span className="tm-eyebrow">{th ? '03 — ทุกคนในชุมชน' : '03 — Everyone here'}</span>
              <h2 className="tm-h2" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '10px 0 0' }}>{th ? 'เลือกจากสิ่งที่เขาถนัด' : 'Browse by craft'}</h2>
            </div>
            <div className="tm-seg">
              <button type="button" className={sort === 'soon' ? 'on' : ''} onClick={() => setSort('soon')}>{th ? 'มีรอบเปิดรับ' : 'Open rounds first'}</button>
              <button type="button" className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>{th ? 'เรียงตามชื่อ' : 'A–Z'}</button>
            </div>
          </div>

          {crafts.length > 0 && (
            <div className="tm-chips">
              {['all', ...crafts].map((c) => (
                <button type="button" key={c} className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>
                  {c === 'all' ? (th ? 'ทั้งหมด' : 'All') : c}
                </button>
              ))}
            </div>
          )}

          {list.length === 0 ? (
            <div className="tm-none">
              <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 10 }}>✺</div>
              {th ? 'ยังไม่มีผู้สอนในหมวดนี้ — ลองดูหมวดอื่น' : 'No makers in this craft yet — try another.'}
            </div>
          ) : (
            <div className="tm-grid">
              {list.map((t, i) => {
                const on = hover === t.id;
                const display = t.nickname || t.name;
                const open = t.upcoming > 0;
                return (
                  <Link
                    key={t.id}
                    href={`/teachers/${t.id}`}
                    className={`tm-card${on ? ' on' : ''}`}
                    onMouseEnter={() => setHover(t.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span aria-hidden="true" className="tm-card-no">{pad2(i + 1)}</span>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <Avatar t={t} size={64} className="tm-card-avatar" />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="display-th" style={{ display: 'block', fontWeight: 500, fontSize: 18, lineHeight: 1.15 }}>{display}</span>
                        <span className="tm-meta" style={{ display: 'block', marginTop: 6 }}>
                          {t.crafts.length ? t.crafts.slice(0, 2).join(' · ') : t.nickname && t.nickname !== t.name ? t.name : th ? 'ผู้สอน' : 'Teacher'}
                        </span>
                      </span>
                    </div>
                    {t.bio && <span className="tm-bio u-clamp-2">{t.bio}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                      <span className={`tag ${open ? (on ? 'tag-ink' : '') : 'tm-tag-off'}`} style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', textTransform: 'none' }}>
                        {open ? (th ? `${t.upcoming} รอบที่เปิดรับ` : `${t.upcoming} open rounds`) : th ? 'ยังไม่มีรอบ' : 'No open rounds'}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span aria-hidden="true" className="mono tm-card-arrow">→</span>
                    </span>
                    <span style={{ display: 'block', height: 48, overflow: 'hidden' }}>
                      <span className="tm-card-reveal">
                        {open
                          ? th
                            ? `รอบถัดไป ${shortDate(t.next_date!)} · จัดมาแล้ว ${t.hosted} รอบ`
                            : `Next ${shortDate(t.next_date!)} · ${t.hosted} rounds hosted`
                          : th
                            ? `ติดตามไว้ รอบใหม่กำลังจัด · จัดมาแล้ว ${t.hosted} รอบ`
                            : `New rounds coming · ${t.hosted} rounds hosted`}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Host with us ─────────────────────────────────────── */}
      <section className="tm-cta">
        <span aria-hidden="true" className="tm-cta-star">✺</span>
        <div className="tm-wrap tm-cta-row">
          <div style={{ maxWidth: 620 }}>
            <span className="tm-eyebrow" style={{ color: '#fff' }}>{th ? '04 — เปิดรับผู้จัด' : '04 — Host with us'}</span>
            <h2 className="tm-h2" style={{ color: '#fff', fontSize: 'clamp(26px,3.6vw,40px)', margin: '14px 0 12px', lineHeight: 1.06 }}>
              {th ? 'คุณมีบางอย่างที่อยากส่งต่อไหม' : 'Do you have something to pass on?'}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: '#fff', margin: 0 }}>
              {th
                ? 'เราช่วยเรื่องหน้าเว็บ ระบบจอง ที่จัด และคนดูแลวันงาน คุณดูแลแค่ประสบการณ์ในห้องนั้น.'
                : 'We handle the page, the bookings, the venue and the day crew. You hold the experience in the room.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <Link href="/about" className="btn btn-paper">
              {th ? 'เปิด workshop กับเรา' : 'Host a workshop'} <span className="mono">↗</span>
            </Link>
            {th ? (
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--accent)' }}>คุยกันก่อนก็ได้</span>
            ) : (
              <span style={{ fontFamily: 'var(--font-hand)', fontWeight: 700, fontSize: 26, color: 'var(--accent)' }}>a chat first is fine</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label, teal }: { n: number; label: string; teal?: boolean }) {
  return (
    <div>
      <div className="tm-stat-n" style={{ color: teal ? 'var(--teal)' : 'var(--ink)' }}>{n.toLocaleString()}</div>
      <div className="tm-meta" style={{ marginTop: 8 }}>{label}</div>
    </div>
  );
}

function Avatar({ t, size, className = '' }: { t: TeacherCard; size: number; className?: string }) {
  const display = t.nickname || t.name;
  return (
    <span className={`tm-avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.39 }}>
      {t.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.avatar_url} alt={display} />
      ) : (
        initialOf(display)
      )}
    </span>
  );
}
