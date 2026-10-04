'use client';

/* The hosts page — everyone who hosts here. Built from the "Hosts v4"
 * design: a big hero with site totals, a marquee, one maker in focus on a
 * teal band that rotates on its own (a speech bubble, their journeys as
 * posters, the rounds they have open),
 * then the whole grid filtered by craft and sorted, and a call to host with
 * us. The site header and footer come from the layout. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/i18n';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { fmtDate } from '@/lib/datetime';
import type { TeacherCard } from '@/app/api/teachers/route';

type Stats = { makers: number; rounds: number; people: number };

const SPOT_MS = 7000;
/** How many hosts take turns in "คนที่เราอยากให้รู้จัก". */
const SPOT_MAX = 5;
// Open rounds listed on the spotlight card; the rest are on the profile.
const ROUNDS_SHOWN = 4;
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
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [spot, setSpot] = useState(0);
  const [prog, setProg] = useState(0);
  const [poster, setPoster] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
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
    fetch('/api/auth/me')
      .then((r) => (r.ok ? (r.json() as Promise<{ user?: { id?: string } | null }>) : null))
      .then((d) => setMeId(d?.user?.id || null))
      .catch(() => {});
  }, [track]);

  // "คนที่เราอยากให้รู้จัก": five hosts, the ones people signed up with most
  // recently first. A host looking at the page sees their own card first.
  const spotList = useMemo(() => {
    const all = teachers || [];
    const byRecent = [...all].sort((a, b) => (b.last_booked_at || '').localeCompare(a.last_booked_at || '') || b.upcoming - a.upcoming);
    const me = meId ? all.find((t) => t.id === meId) : undefined;
    return (me ? [me, ...byRecent.filter((t) => t.id !== me.id)] : byRecent).slice(0, SPOT_MAX);
  }, [teachers, meId]);

  // The maker in focus moves on by itself; the thin bar under the arrows
  // shows how long until it does.
  const count = spotList.length;
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
    // Search reads the name, nickname, crafts, bio and what they teach.
    const q = query.trim().toLowerCase();
    const l = (teachers || []).filter(
      (t) =>
        (filter === 'all' || t.crafts.includes(filter)) &&
        (!q || [t.name, t.nickname, t.bio, ...t.crafts, ...t.rounds.map((r) => r.title), ...t.works.map((w) => w.title)].some((x) => (x || '').toLowerCase().includes(q))),
    );
    // Whoever teaches soonest comes first; hosts with no round coming up
    // follow, by name.
    const soonKey = (t: TeacherCard) => (t.next_date ? `${t.next_date} ${t.next_time || ''}` : '');
    return l.sort((a, b) => {
      const ka = soonKey(a), kb = soonKey(b);
      if (ka && kb && ka !== kb) return ka.localeCompare(kb);
      if (!ka !== !kb) return ka ? -1 : 1;
      return a.name.localeCompare(b.name, 'th');
    });
  }, [teachers, filter, query]);

  if (teachers === null) return null;

  const goSpot = (delta: number) => {
    setSpot((s) => (s + count + delta) % count);
    setPoster(null);
    setProg(0);
  };

  const s = count ? spotList[spot % count] : null;
  const sDisplay = s ? s.nickname || s.name : '';
  // The bubble quotes a seeker first, else the host's own bio.
  const spotQuote = s ? (s.quote ? s.quote.comment : s.bio) : null;
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
          <span className="tm-eyebrow">{th ? '01 — ผู้จัด' : '01 — Makers & hosts'}</span>
          <h1 className="tm-title tm-title-long">
            Facilitator<span style={{ color: 'var(--teal)' }}>.</span>
          </h1>
          <div className="tm-hero-row">
            <div style={{ maxWidth: 620 }}>
              <h2 className="tm-h2 tm-h2-lines">{th ? (
                  <>
                    เชื่อมต่อคุณกับ Host ผู้สร้างสรรค์กิจกรรม
                    <br />
                    เปลี่ยนวันธรรมดาของคุณให้พิเศษ
                  </>
                ) : (
                  <>
                    Meet the hosts behind every journey
                    <br />
                    and make an ordinary day special
                  </>
                )}</h2>
              <p className="tm-lede">
                {th
                  ? 'เพราะผู้จัดทุกคนตั้งใจสร้างสรรค์กิจกรรม ให้คุณได้ออกมาใช้เวลา ค้นพบแรงบันดาลใจ ลองเลือกกิจกรรมที่คุณสนใจ อ่านเรื่องราวของ Host แล้วก้าวออกมาสัมผัสประสบการณ์ใหม่ ๆ ด้วยตัวคุณเอง'
                  : "Every host sets out to create a journey that gets you out, gives you time and sparks new inspiration. Pick what draws you, read the host's story, then step out and try something new for yourself."}
              </p>
              {th ? (
                <span className="tm-hand-th">มาทำความรู้จักกันก่อน ✺</span>
              ) : (
                <span className="tm-hand-en">come say hello ✺</span>
              )}
            </div>
            <div className="tm-stats">
              <Stat n={stats.makers} label={th ? 'ผู้จัด' : 'makers & hosts'} />
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

      {/* ── Maker in focus (Hosts v4) ─────────────────────────── */}
      {s && (
        <section id="spot" className="tm4-spot">
          <div className="tm-wrap">
            <div className="tm4-spot-head">
              <span className="tm4-spot-eyebrow">{th ? '02 — คนที่เราอยากให้รู้จัก' : '02 — Maker in focus'}</span>
              <span style={{ flex: 1 }} />
              <span className="tm4-counter">
                <span>{pad2((spot % count) + 1)} / {pad2(count)}</span>
                <span className="tm4-bar"><span style={{ width: `${Math.round(prog * 100)}%` }} /></span>
              </span>
              <button type="button" onClick={() => goSpot(-1)} aria-label="Previous" className="tm4-arrow">‹</button>
              <button type="button" onClick={() => goSpot(1)} aria-label="Next" className="tm4-arrow">›</button>
            </div>

            <div className="tm4-card">
              <div className="tm4-top">
                <div style={{ minWidth: 0 }}>
                  <div aria-hidden="true" className="tm4-bigno">{pad2((spot % count) + 1)}</div>
                  <div className="tm4-host">
                    <Avatar t={s} size={92} className="tm4-avatar" />
                    <div style={{ minWidth: 0 }}>
                      {/* The name opens their portfolio, else their host page. */}
                      <Link href={s.portfolio_id ? `/p/${s.portfolio_id}` : `/hosts/${s.id}`} className="tm4-name">
                        {s.name}
                        {s.portfolio_id && <span className="tm4-name-tag">{th ? 'ผลงาน ↗' : 'portfolio ↗'}</span>}
                      </Link>
                      <div className="tm4-hosted">
                        {(s.crafts.length ? s.crafts.slice(0, 2).join(' · ') + ' · ' : '') + (th ? `จัดมาแล้ว ${s.hosted} รอบ` : `${s.hosted} rounds hosted`)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="tm4-bubble">
                  <svg aria-hidden="true" width="60" height="70" viewBox="0 0 60 70" className="tm4-tail-left"><path d="M60 0 L0 64 L60 46 Z" fill="#fff" /></svg>
                  <svg aria-hidden="true" width="44" height="30" viewBox="0 0 44 30" className="tm4-tail-up"><path d="M0 30 L10 0 L44 30 Z" fill="#fff" /></svg>
                  {spotQuote ? (
                    <>
                      <p className="tm4-quote">
                        “<span className="tm-hl">{spotQuote}</span>”
                      </p>
                      <span className="tm4-from">
                        {s.quote ? (th ? `— จากผู้เข้าร่วม ${s.quote.workshop}` : `— a seeker of ${s.quote.workshop}`) : th ? '— จากประวัติผู้จัด' : '— from their profile'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tm4-hello">say hello ✺</span>
                      <span className="tm4-from" style={{ marginTop: 10, whiteSpace: 'normal' }}>
                        {th ? `${sDisplay} ยังไม่ได้เขียนแนะนำตัว — ลองดูกิจกรรมที่เขาจัดด้านล่าง` : `${sDisplay} hasn't written an intro yet — see what they host below`}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="tm4-bottom">
                <div style={{ minWidth: 0 }}>
                  <div className="tm4-posters">
                    {s.works.length === 0 ? (
                      <div className="ph ph-cream tm4-poster-empty">
                        <span style={{ fontSize: 20, color: 'var(--accent)' }}>✺</span>
                        {th ? 'รอบใหม่กำลังจัด' : 'New rounds coming'}
                      </div>
                    ) : (
                      s.works.map((w, i) => {
                        const key = `${s.id}-${i}`;
                        const on = poster === key;
                        return (
                          <Link
                            key={w.id}
                            href={`/journeys/${w.id}`}
                            aria-label={w.title}
                            className={`tm-work tm4-poster ${w.image_url ? '' : `ph ${PH_CLASS[i % PH_CLASS.length]}`}`}
                            onMouseEnter={() => setPoster(key)}
                            onMouseLeave={() => setPoster(null)}
                            onFocus={() => setPoster(key)}
                            onBlur={() => setPoster(null)}
                          >
                            {w.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={w.image_url} alt="" />
                            )}
                            <span aria-hidden="true" className="tm-work-star">✺</span>
                            <span className="tm-work-name" style={{ transform: `translateY(${on ? '0%' : '101%'})` }}>{w.title}</span>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
                <span aria-hidden="true" className="tm4-divider" />
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div className="tm4-rounds">
                    <div className="tm4-rounds-label">{th ? 'รอบที่เปิดรับ' : 'Open rounds'}</div>
                    <div className="tm4-rounds-list">
                      {s.rounds.length === 0 ? (
                        <div className="tm4-round tm4-round-none">{th ? 'รอบใหม่กำลังจัด — ติดตามผู้จัดไว้ก่อน' : 'New rounds coming — follow this host for now'}</div>
                      ) : (
                        s.rounds.slice(0, ROUNDS_SHOWN).map((r) => (
                          <Link key={r.id} href={`/journeys/${r.id}`} className="tm4-round">
                            <span className="tm4-round-date" style={{ color: r.full ? 'var(--muted)' : 'var(--teal-deep)' }}>{shortDate(r.date)}</span>
                            <span className="tm4-round-title">{r.title}</span>
                            <span className="mono tm4-round-seats">{r.full ? (th ? 'เต็ม' : 'full') : th ? `${r.max} ที่นั่ง` : `${r.max} seats`}</span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="tm4-more">
                    <Link href={`/hosts/${s.id}`} className="btn btn-ink">
                      {th ? 'ดูโปรไฟล์และปฏิทิน' : 'Profile & calendar'} <span className="mono">→</span>
                    </Link>
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
            <label className="tm-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={th ? 'ค้นหาผู้จัด หรือกิจกรรมที่จัด…' : 'Search makers or crafts…'} aria-label={th ? 'ค้นหาผู้จัด' : 'Search makers'} />
            </label>
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
              {query.trim()
                ? th
                  ? `ไม่พบผู้จัดที่ตรงกับ “${query.trim()}”`
                  : `No makers match “${query.trim()}”`
                : th
                  ? 'ยังไม่มีผู้จัดในหมวดนี้ — ลองดูหมวดอื่น'
                  : 'No makers in this craft yet — try another.'}
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
                    href={`/hosts/${t.id}`}
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
                          {t.crafts.length ? t.crafts.slice(0, 2).join(' · ') : t.nickname && t.nickname !== t.name ? t.name : th ? 'ผู้จัด' : 'Host'}
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
              {th ? 'เปิดกิจกรรมกับเรา' : 'Host a journey'} <span className="mono">↗</span>
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
