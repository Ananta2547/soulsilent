'use client';

import { useEffect, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { CountWhenSeen } from '@/components/design/CountUp';
import { Btn } from '@/components/design/RippleButton';
import {
  Ribbon,
  Sparkle,
  Cloud,
  Squiggle,
  CircleScribble,
  DotCluster,
  WaveLine,
  ZigZag,
  Star,
} from '@/components/design/Doodles';

const TEAM = [
  { name: { th: 'พลอย ศิรินทร์', en: 'Ploy S.' }, role: { th: 'co-founder · creative direction', en: 'co-founder · creative direction' } },
  { name: { th: 'จอน ภาสกร', en: 'John P.' }, role: { th: 'co-founder · facilitator', en: 'co-founder · facilitator' } },
  { name: { th: 'เปา ณัฐพล', en: 'Pao N.' }, role: { th: 'producer · operations', en: 'producer · operations' } },
  { name: { th: 'มินทร์ พริมา', en: 'Min P.' }, role: { th: 'lead designer', en: 'lead designer' } },
];

const VALUES = [
  {
    icon: <Cloud color="var(--teal)" stroke={3} style={{ width: 56, height: 36 }} />,
    title: { th: 'ช้า แต่ลึก', en: 'Slow but deep' },
    blurb: {
      th: 'เราเชื่อว่าการเรียนรู้ที่ดีต้องมีพื้นที่ให้เงียบ ให้คิด ให้กลับมาที่ตัวเอง',
      en: "We believe good learning needs room for silence, thought, and coming back to yourself.",
    },
  },
  {
    icon: <Sparkle color="var(--accent)" style={{ width: 32, height: 32 }} />,
    title: { th: 'เรียบง่ายแต่งดงาม', en: 'Simple but beautiful' },
    blurb: {
      th: 'อุปกรณ์น้อย ความตั้งใจมาก เครื่องมือเล็ก ๆ ที่เปลี่ยนวิธีมอง',
      en: 'Few tools, full intention — small things that change how you see.',
    },
  },
  {
    icon: <Star color="var(--teal)" style={{ width: 32, height: 32 }} />,
    title: { th: 'ไม่มีสูตรสำเร็จ', en: 'No recipe' },
    blurb: {
      th: 'แต่ละกลุ่มไม่เหมือนกัน แต่ละครั้งเราออกแบบใหม่ ฟังคุณก่อนแล้วจึงเริ่ม',
      en: 'Every group is different — we redesign each time, listen first, then begin.',
    },
  },
];

/** Whole years elapsed since a founding date (1-based month), in local time. */
function yearsSince(year: number, month1: number, day: number): number {
  const now = new Date();
  let y = now.getFullYear() - year;
  const m = now.getMonth() + 1 - month1;
  if (m < 0 || (m === 0 && now.getDate() < day)) y--;
  return Math.max(0, y);
}

export default function AboutPage() {
  const { lang } = useLang();

  // Live figures for the "numbers" section — base seed + real DB counts.
  const [stats, setStats] = useState({ workshops: 11, participants: 125, locations: 0 });
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<{ workshops: number; participants: number; locations: number }>)
      .then((d) =>
        setStats({
          workshops: d.workshops ?? 11,
          participants: d.participants ?? 125,
          locations: d.locations ?? 0,
        }),
      )
      .catch(() => {});
  }, []);

  // Whole years since founding (15 Nov 2022 / พ.ศ. 2565), computed live.
  const years = yearsSince(2022, 11, 15);

  // The team = real admin users (falls back to the curated list if none/offline).
  const [admins, setAdmins] = useState<{ name: string; avatar_url: string | null }[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/team');
        const data = (await res.json()) as { team?: { name: string; avatar_url: string | null }[] };
        setAdmins(data.team || []);
      } catch {
        setAdmins([]);
      }
    })();
  }, []);

  const members: { name: string; role: string; avatar: string | null }[] =
    admins && admins.length > 0
      ? admins.map((a) => ({ name: a.name, role: tr(lang, 'ทีม soulsilent', 'soulsilent team'), avatar: a.avatar_url }))
      : TEAM.map((m) => ({ name: m.name[lang], role: m.role[lang], avatar: null }));

  return (
    <>
      {/* Hero */}
      <section className="section" style={{ paddingTop: 80, paddingBottom: 64, position: 'relative', overflow: 'hidden' }}>
        <Reveal
          draw
          style={{ position: 'absolute', right: -120, top: 80, width: 600, opacity: 0.45, pointerEvents: 'none' }}
        >
          <Ribbon color="var(--teal-100)" />
        </Reveal>
        <DotCluster
          color="var(--teal-200)"
          rows={5}
          cols={5}
          style={{ position: 'absolute', left: '5%', top: '70%', width: 42, pointerEvents: 'none' }}
        />

        <div className="container" style={{ position: 'relative' }}>
          <Reveal>
            <span className="eyebrow">
              <T th="เกี่ยวกับเรา" en="about" />
            </span>
          </Reveal>
          {lang === 'th' ? (
            <Reveal as="h1" delay={80} className="giant-th" style={{ margin: '18px 0 6px' }}>
              เราคือทีมที่{' '}
              <span style={{ color: 'var(--teal)' }}>ออกแบบ</span>
              <br />
              พื้นที่เรียนรู้.
            </Reveal>
          ) : (
            <Reveal as="h1" delay={80} className="giant-en" style={{ margin: '18px 0 6px' }}>
              WE DESIGN
              <br />
              <span style={{ color: 'var(--teal)' }}>LEARNING</span>{' '}
              <span style={{ position: 'relative', display: 'inline-block' }}>
                SPACES
                <Reveal
                  draw
                  style={{ position: 'absolute', left: '-2%', right: '-2%', bottom: '-8px', width: '104%', height: 18 }}
                >
                  <Squiggle color="var(--accent)" stroke={6} />
                </Reveal>
              </span>
              .
            </Reveal>
          )}

          <Reveal delay={160} style={{ marginTop: 32, maxWidth: 700 }}>
            <p style={{ fontSize: 'clamp(16px, 1.4vw, 19px)', lineHeight: 1.7, color: 'var(--ink)' }}>
              <T
                th={
                  <>
                    soulsilent เริ่มต้นจากเพื่อนกลุ่มเล็ก ๆ ที่อยากออกแบบ workshop ที่ไม่ต้องเร่งรีบ. ตั้งแต่ปี
                    2565 เราจัดกิจกรรมกว่า {stats.workshops} ครั้ง ในกรุงเทพฯ หัวหิน เขาใหญ่ และอีกหลายเมือง.
                    เป้าหมายของเราไม่เคยเปลี่ยน — ทำให้คนกลับมา{' '}
                    <span className="mark">รู้จักตัวเอง</span> ผ่านเรื่องเล็ก ๆ.
                  </>
                }
                en={
                  <>
                    soulsilent started as a small group of friends who wanted to design unhurried workshops. Since
                    2022 we&apos;ve run over {stats.workshops} events across Bangkok, Hua Hin, Khao Yai and other cities.
                    Our goal hasn&apos;t changed — to bring people back to{' '}
                    <span className="mark">knowing themselves</span> through small things.
                  </>
                }
              />
            </p>
          </Reveal>
        </div>
      </section>

      {/* Values */}
      <section className="section bg-cream">
        <div className="container">
          <Reveal style={{ marginBottom: 48, maxWidth: 720 }}>
            <span className="eyebrow">
              01 — <T th="ค่านิยม" en="values" />
            </span>
            <h2 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 60px)', margin: '18px 0 0' }}>
              <T
                th={
                  <>
                    สิ่งที่เราเชื่อ{' '}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      เงียบ ๆ
                      <Reveal
                        draw
                        style={{
                          position: 'absolute',
                          left: -18,
                          right: -18,
                          top: -12,
                          bottom: -12,
                          width: 'calc(100% + 36px)',
                          height: 'calc(100% + 24px)',
                          pointerEvents: 'none',
                        }}
                      >
                        <CircleScribble color="var(--teal)" stroke={4} />
                      </Reveal>
                    </span>
                  </>
                }
                en={
                  <>
                    What we{' '}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      quietly
                      <Reveal
                        draw
                        style={{
                          position: 'absolute',
                          left: -18,
                          right: -18,
                          top: -12,
                          bottom: -12,
                          width: 'calc(100% + 36px)',
                          height: 'calc(100% + 24px)',
                          pointerEvents: 'none',
                        }}
                      >
                        <CircleScribble color="var(--teal)" stroke={4} />
                      </Reveal>
                    </span>{' '}
                    believe
                  </>
                }
              />
            </h2>
          </Reveal>

          <div className="grid-x g-cards" style={{ gap: 28 }}>
            {VALUES.map((v, i) => (
              <Reveal
                key={i}
                variant="reveal-zoom"
                delay={i * 100}
                className="card"
                style={{ background: 'var(--paper)', padding: 28 }}
              >
                <div style={{ height: 60, display: 'flex', alignItems: 'center', marginBottom: 18 }}>{v.icon}</div>
                <h3 className="display-th" style={{ fontSize: 22, margin: '0 0 10px' }}>
                  {v.title[lang]}
                </h3>
                <p style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.65, margin: 0 }}>{v.blurb[lang]}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="section">
        <div className="container">
          <Reveal style={{ textAlign: 'center', marginBottom: 56 }}>
            <span className="eyebrow">
              02 — <T th="ตัวเลข" en="numbers" />
            </span>
            <h2 className="display-th" style={{ fontSize: 'clamp(32px, 4.5vw, 56px)', margin: '18px 0 0' }}>
              {tr(lang, `${years} ปีที่ผ่านมา`, `${years} years in`)}
            </h2>
          </Reveal>
          <div className="grid-x g-stats4" style={{ gap: 0, background: 'var(--cream)', borderRadius: 24, overflow: 'hidden' }}>
            {[
              [String(years), tr(lang, 'ปี', 'years')],
              [String(stats.workshops), tr(lang, 'กิจกรรม', 'events')],
              [String(stats.participants), tr(lang, 'ผู้เข้าร่วม', 'participants')],
              [String(stats.locations), tr(lang, 'สถานที่', 'venues')],
            ].map(([n, l]) => (
              <div key={l} className="stat-cell">
                <div className="stat-num">
                  <CountWhenSeen value={n} />
                  <span style={{ color: 'var(--accent)' }}>.</span>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    marginTop: 10,
                  }}
                >
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="section bg-cream">
        <div className="container">
          <Reveal style={{ marginBottom: 48, maxWidth: 600 }}>
            <span className="eyebrow">
              03 — <T th="ทีมงาน" en="team" />
            </span>
            <h2 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 60px)', margin: '18px 0 0' }}>
              <T th="คนที่อยู่เบื้องหลัง" en="The people behind it" />
            </h2>
          </Reveal>

          <div className="grid-x g-cards">
            {members.map((m, i) => (
              <Reveal key={i} variant="reveal-zoom" delay={i * 80}>
                <div
                  className={`ph ${['ph-teal', 'ph-cream', 'ph-ink', 'ph-accent'][i % 4]}`}
                  style={{ aspectRatio: '1/1', borderRadius: 20, marginBottom: 14, position: 'relative', overflow: 'hidden' }}
                >
                  {m.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatar}
                      alt={m.name}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <>
                      {i % 4 === 0 && (
                        <Cloud color="var(--teal-200)" stroke={3} style={{ position: 'absolute', top: 20, right: 16, width: 56, height: 34 }} />
                      )}
                      {i % 4 === 1 && (
                        <ZigZag
                          color="var(--teal)"
                          stroke={3}
                          style={{ position: 'absolute', bottom: 14, left: 14, right: 14, width: 'calc(100% - 28px)', height: 22 }}
                        />
                      )}
                      {i % 4 === 2 && (
                        <WaveLine
                          color="var(--accent)"
                          stroke={2.5}
                          style={{ position: 'absolute', bottom: 18, left: 18, right: 18, width: 'calc(100% - 36px)', height: 28 }}
                          count={2}
                        />
                      )}
                      {i % 4 === 3 && (
                        <Sparkle color="var(--teal)" style={{ position: 'absolute', top: 14, left: 14, width: 22 }} />
                      )}
                    </>
                  )}
                </div>
                <h3 className="display-th" style={{ fontSize: 18, margin: '0 0 4px' }}>
                  {m.name}
                </h3>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}
                >
                  {m.role}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-section" style={{ padding: '96px 0 80px', position: 'relative', overflow: 'hidden' }}>
        <Sparkle color="var(--accent)" style={{ position: 'absolute', top: 80, left: '12%', width: 28 }} />
        <div className="container" style={{ textAlign: 'center', position: 'relative' }}>
          <Reveal>
            <h2
              className="display-en"
              style={{ fontSize: 'clamp(48px, 9vw, 120px)', color: '#fff', margin: '0 0 18px', lineHeight: 0.9 }}
            >
              JOIN US
              <br />
              <span style={{ color: 'var(--accent)' }}>SOON</span>
            </h2>
            <p style={{ fontSize: 'clamp(15px, 1.3vw, 17px)', color: '#9ab1ae', maxWidth: 480, margin: '0 auto 28px' }}>
              <T
                th="เริ่มจากกิจกรรมเดียว แล้วเดินทางต่อไปด้วยกัน"
                en="Start with one event, then walk on with us"
              />
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn kind="teal" href="/workshops">
                {tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse events')} →
              </Btn>
              <Btn kind="paper" href="/#contact">
                {tr(lang, 'คุยกับทีม', 'Talk to the team')}
              </Btn>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
