'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Course } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { CountWhenSeen } from '@/components/design/CountUp';
import { Btn } from '@/components/design/RippleButton';
import {
  Ribbon,
  Sparkle,
  DotCluster,
  Cloud,
  WaveLine,
  ZigZag,
  UnderlineMark,
  Squiggle,
  CircleScribble,
  MarkerStroke,
} from '@/components/design/Doodles';

const LEVEL_LABEL: Record<string, { th: string; en: string }> = {
  beginner: { th: 'เริ่มต้น', en: 'Beginner' },
  intermediate: { th: 'กลาง', en: 'Intermediate' },
  advanced: { th: 'ขั้นสูง', en: 'Advanced' },
};

export default function AllsoullearnPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.json() as Promise<{ courses: Course[] }>)
      .then((d) => setCourses(d.courses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const featured = courses[0];
  const list = courses.slice(0, 8);

  return (
    <>
      <Hero featured={featured} totalCourses={courses.length} />
      <Courses items={list} loading={loading} />
      <WhyOnline />
      <Stats totalCourses={courses.length} />
      <CTA />
    </>
  );
}

/* ---------- Hero ---------- */
function Hero({ featured, totalCourses }: { featured?: Course; totalCourses: number }) {
  const { lang } = useLang();
  return (
    <section
      className="section"
      id="top"
      style={{ paddingTop: 64, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}
    >
      <Reveal
        draw
        style={{
          position: 'absolute',
          right: -160,
          top: 60,
          width: 680,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      >
        <Ribbon color="var(--teal-100)" />
      </Reveal>
      <Reveal
        draw
        delay={300}
        style={{ position: 'absolute', left: '8%', top: '22%', width: 32, pointerEvents: 'none' }}
      >
        <Sparkle color="var(--accent)" />
      </Reveal>
      <DotCluster
        color="var(--teal-200)"
        rows={5}
        cols={5}
        style={{ position: 'absolute', left: '48%', top: '76%', width: 42, pointerEvents: 'none' }}
      />

      <div className="container" style={{ position: 'relative' }}>
        <Reveal style={{ marginBottom: 24 }}>
          <span className="eyebrow">allsoullearn · online courses</span>
        </Reveal>

        {lang === 'th' ? (
          <Reveal as="h1" delay={80} className="giant-th" style={{ margin: '0 0 6px' }}>
            เรียน
            <span style={{ position: 'relative', display: 'inline-block', padding: '0 .1em' }}>
              ทุกที่
              <Reveal
                draw
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: '-6%',
                  width: '100%',
                  height: '52%',
                  zIndex: -1,
                }}
              >
                <MarkerStroke color="var(--accent)" />
              </Reveal>
            </span>
            ทุกเวลา.
          </Reveal>
        ) : (
          <Reveal as="h1" delay={80} className="giant-en" style={{ margin: '0 0 6px' }}>
            LEARN
            <br />
            ANY
            <span style={{ position: 'relative', display: 'inline-block', padding: '0 .04em' }}>
              <span style={{ color: 'var(--teal)' }}>WHERE</span>
              <Reveal
                draw
                style={{
                  position: 'absolute',
                  left: '-2%',
                  right: '-2%',
                  bottom: '-8px',
                  width: '104%',
                  height: 18,
                  zIndex: -1,
                }}
              >
                <Squiggle color="var(--accent)" stroke={7} />
              </Reveal>
            </span>
            <span style={{ color: 'var(--accent)' }}>*</span>
          </Reveal>
        )}

        <div className="grid-x g-hero" style={{ gap: 48, marginTop: 36, alignItems: 'start' }}>
          <Reveal delay={160}>
            <p
              style={{
                fontSize: 'clamp(16px, 1.4vw, 19px)',
                lineHeight: 1.6,
                maxWidth: 560,
                color: 'var(--ink)',
                margin: '0 0 28px',
              }}
            >
              <T
                th={
                  <>
                    <span className="hand" style={{ color: 'var(--teal)', fontSize: '1.15em', marginRight: 6 }}>
                      *
                    </span>
                    คอร์สเรียนออนไลน์จาก soulsilent — เรียนตามจังหวะของคุณ ในเวลาว่างที่คุณเลือกเอง.
                    ขยายห้องเรียนของเราออกไปไกลถึง <span className="mark">หน้าจอของคุณ</span>{' '}
                    ที่ใดก็ได้ในโลก.
                  </>
                }
                en={
                  <>
                    <span className="hand" style={{ color: 'var(--teal)', fontSize: '1.15em', marginRight: 6 }}>
                      *
                    </span>
                    Online courses from the soulsilent team — learn at your own pace, in the time you choose.
                    We bring our classroom to <span className="mark">your screen</span>, anywhere in the world.
                  </>
                }
              />
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Btn kind="ink" href="#courses">
                <T th="ดูคอร์สทั้งหมด" en="See all courses" /> <span className="mono">→</span>
              </Btn>
              <Btn kind="paper" href="/workshops">
                <T th="กลับไป workshop" en="Back to workshops" />
              </Btn>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 36,
                marginTop: 48,
                paddingTop: 24,
                background: 'linear-gradient(to right, var(--teal-100), transparent 60%)',
                backgroundSize: '40px 1px',
                backgroundRepeat: 'repeat-x',
                backgroundPosition: 'top',
              }}
            >
              {[
                [String(totalCourses || 0), tr(lang, 'คอร์ส', 'courses')],
                ['1.2k', tr(lang, 'ผู้เรียน', 'learners')],
                ['98%', tr(lang, 'พึงพอใจ', 'satisfied')],
              ].map(([n, l]) => (
                <div key={l}>
                  <div
                    style={{
                      fontFamily: 'Archivo Black',
                      fontSize: 'clamp(28px, 3vw, 36px)',
                      letterSpacing: '-.02em',
                    }}
                  >
                    <CountWhenSeen value={n} />
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal variant="reveal-right" delay={200}>
            <FeaturedCourseCard c={featured} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FeaturedCourseCard({ c }: { c?: Course }) {
  const { lang } = useLang();
  return (
    <article
      style={{
        background: 'var(--ink)',
        color: '#fff',
        borderRadius: 24,
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        className="ph ph-ink"
        style={{ height: 190, borderRadius: 16, marginBottom: 18, position: 'relative', overflow: 'hidden' }}
      >
        {c?.thumbnail_url ? (
          <img
            src={c.thumbnail_url}
            alt={c.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <>
            <span
              style={{
                position: 'absolute',
                bottom: 14,
                right: 16,
                fontFamily: 'JetBrains Mono',
                fontSize: 9,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                opacity: 0.6,
              }}
            >
              course · hero
            </span>
            <Cloud
              color="var(--accent)"
              stroke={3}
              style={{ position: 'absolute', top: 18, right: 24, width: 80, height: 46 }}
            />
            <WaveLine
              color="var(--teal-200)"
              stroke={2.5}
              style={{
                position: 'absolute',
                bottom: 18,
                left: 18,
                right: 18,
                width: 'calc(100% - 36px)',
                height: 30,
              }}
              count={2}
            />
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="tag tag-accent">{tr(lang, 'คอร์สเด่น', 'Featured')}</span>
        <span className="tag" style={{ background: 'rgba(255,255,255,.1)', color: '#cbd6d4' }}>
          {c ? LEVEL_LABEL[c.level]?.[lang] || c.level : 'Online'}
        </span>
      </div>
      <h3
        className="display-th"
        style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', margin: '0 0 8px', color: '#fff' }}
      >
        {c?.title || (lang === 'th' ? 'ยังไม่มีคอร์สเด่น' : 'No featured course yet')}
      </h3>
      <p style={{ fontSize: 13, color: '#9ab1ae', margin: '0 0 20px', lineHeight: 1.5 }}>
        {c?.short_description ||
          c?.description ||
          (lang === 'th' ? 'รอคอร์สใหม่เร็ว ๆ นี้' : 'New courses coming soon')}
      </p>
      {c && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 18 }}>
          {[
            [tr(lang, 'หมวด', 'Category'), c.category || (lang === 'th' ? 'ทั่วไป' : 'General')],
            [tr(lang, 'ระดับ', 'Level'), LEVEL_LABEL[c.level]?.[lang] || c.level],
            [tr(lang, 'รูปแบบ', 'Format'), tr(lang, 'วิดีโอ', 'Video')],
            [tr(lang, 'การเข้าถึง', 'Access'), tr(lang, 'ตลอดชีพ', 'Lifetime')],
          ].map(([l, v]) => (
            <div key={l}>
              <div
                style={{
                  color: '#7f9794',
                  fontSize: 10.5,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  fontFamily: 'JetBrains Mono',
                  marginBottom: 3,
                }}
              >
                {l}
              </div>
              <div>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 16,
          background: 'linear-gradient(to right, rgba(255,255,255,.18), transparent 100%)',
          backgroundSize: '30px 1px',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'top',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: '#7f9794',
              fontFamily: 'JetBrains Mono',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            {tr(lang, 'ราคา', 'Price')}
          </div>
          <div style={{ fontFamily: 'Archivo Black', fontSize: 24 }}>
            ฿{(c?.price || 0).toLocaleString()}
          </div>
        </div>
        <Btn kind="paper" size="sm" href={c ? `/allsoullearn/courses/${c.id}` : '/allsoullearn/courses'}>
          {tr(lang, 'ดูคอร์ส', 'View course')} <span className="mono">→</span>
        </Btn>
      </div>
    </article>
  );
}

/* ---------- Courses ---------- */
function Courses({ items, loading }: { items: Course[]; loading: boolean }) {
  const { lang } = useLang();
  const [filter, setFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const filters = [
    { k: 'all' as const, th: 'ทั้งหมด', en: 'All' },
    { k: 'beginner' as const, th: 'เริ่มต้น', en: 'Beginner' },
    { k: 'intermediate' as const, th: 'กลาง', en: 'Intermediate' },
    { k: 'advanced' as const, th: 'ขั้นสูง', en: 'Advanced' },
  ];
  const filtered = filter === 'all' ? items : items.filter((c) => c.level === filter);

  return (
    <section className="section bg-cream" id="courses">
      <div className="container">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            marginBottom: 44,
            flexWrap: 'wrap',
          }}
        >
          <Reveal style={{ maxWidth: 680 }}>
            <span className="eyebrow">
              01 — <T th="คอร์สเรียน" en="courses" />
            </span>
            <h2
              className="display-th"
              style={{
                fontSize: 'clamp(34px, 5vw, 64px)',
                margin: '18px 0 12px',
                position: 'relative',
                display: 'inline-block',
              }}
            >
              <T
                th={
                  <>
                    คอร์สที่
                    <br />
                    เริ่มเรียนได้ทันที
                  </>
                }
                en={
                  <>
                    Courses ready
                    <br />
                    to start now
                  </>
                }
              />
              <Reveal
                draw
                delay={400}
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: -14,
                  width: '72%',
                  height: 18,
                  pointerEvents: 'none',
                }}
              >
                <UnderlineMark color="var(--teal)" stroke={6} />
              </Reveal>
            </h2>
            <p
              style={{
                fontSize: 'clamp(15px, 1.3vw, 17px)',
                color: 'var(--muted)',
                maxWidth: 480,
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              <T
                th="วิดีโอคุณภาพสูง · เรียนได้ตลอดชีพ · เปิดให้กลับมาทบทวนเมื่อไหร่ก็ได้."
                en="High-quality video · lifetime access · come back whenever you want to review."
              />
            </p>
          </Reveal>

          <Reveal variant="reveal-right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filters.map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: 0,
                  background: filter === f.k ? 'var(--ink)' : 'var(--paper)',
                  color: filter === f.k ? '#fff' : 'var(--ink)',
                  transition: 'all .2s ease',
                }}
              >
                {tr(lang, f.th, f.en)}
              </button>
            ))}
          </Reveal>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '2px solid var(--teal)',
                borderTopColor: 'transparent',
                margin: '0 auto',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <Reveal style={{ textAlign: 'center', padding: 64 }}>
            <p style={{ color: 'var(--muted)' }}>
              <T th="ยังไม่มีคอร์สในหมวดนี้" en="No courses in this category yet" />
            </p>
          </Reveal>
        ) : (
          <div className="grid-x g-cards">
            {filtered.map((c, i) => (
              <Reveal key={c.id} variant="reveal-zoom" delay={i * 90}>
                <CourseCardLg c={c} />
              </Reveal>
            ))}
          </div>
        )}

        <Reveal style={{ marginTop: 36, textAlign: 'center' }}>
          <Btn kind="ghost" href="/allsoullearn/courses">
            <T th="ดูคอร์สทั้งหมด" en="See all courses" /> <span className="mono">→</span>
          </Btn>
        </Reveal>
      </div>
    </section>
  );
}

function CourseCardLg({ c }: { c: Course }) {
  const { lang } = useLang();
  return (
    <Link
      href={`/allsoullearn/courses/${c.id}`}
      className="card"
      style={{
        padding: 16,
        background: 'var(--paper)',
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        color: 'var(--ink)',
      }}
    >
      <div
        className="ph ph-teal card-media"
        style={{ height: 160, borderRadius: 14, marginBottom: 16, position: 'relative', overflow: 'hidden' }}
      >
        {c.thumbnail_url ? (
          <img
            src={c.thumbnail_url}
            alt={c.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <>
            <ZigZag
              color="var(--teal)"
              stroke={3}
              style={{
                position: 'absolute',
                bottom: 14,
                left: 14,
                right: 14,
                width: 'calc(100% - 28px)',
                height: 24,
              }}
            />
            <Cloud
              color="var(--teal-200)"
              stroke={3}
              style={{ position: 'absolute', top: 14, left: 14, width: 64, height: 40 }}
            />
            <span
              style={{
                position: 'absolute',
                bottom: 10,
                right: 14,
                fontFamily: 'JetBrains Mono',
                fontSize: 9,
                letterSpacing: '.1em',
                opacity: 0.5,
                textTransform: 'uppercase',
              }}
            >
              video · 16:9
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {c.category && <span className="tag">{c.category}</span>}
        <span className="tag tag-accent">{LEVEL_LABEL[c.level]?.[lang] || c.level}</span>
      </div>
      <h3 className="display-th" style={{ fontSize: 20, margin: '0 0 6px', lineHeight: 1.2 }}>
        {c.title}
      </h3>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.55, flex: 1 }}>
        {c.short_description || (lang === 'th' ? 'คอร์สวิดีโอออนไลน์' : 'Online video course')}
      </div>
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono',
              color: 'var(--muted)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            {tr(lang, 'ราคา', 'Price')}
          </div>
          <div style={{ fontFamily: 'Archivo Black', fontSize: 22 }}>฿{c.price.toLocaleString()}</div>
        </div>
        <span className="btn btn-teal btn-sm" aria-hidden="true">
          {tr(lang, 'ดูคอร์ส', 'View')} <span className="mono">→</span>
        </span>
      </div>
    </Link>
  );
}

/* ---------- Why online ---------- */
function WhyOnline() {
  const { lang } = useLang();
  const items = [
    {
      n: '01',
      th: { title: 'เรียนตามจังหวะตัวเอง', desc: 'หยุด เล่นซ้ำ ข้าม — ทุกอย่างอยู่ในมือคุณ' },
      en: { title: 'Your own pace', desc: 'Pause, replay, skip — it’s all in your hands.' },
    },
    {
      n: '02',
      th: { title: 'ดูได้ตลอดชีพ', desc: 'ซื้อครั้งเดียว กลับมาดูเมื่อไหร่ก็ได้' },
      en: { title: 'Lifetime access', desc: 'Buy once, come back whenever you need.' },
    },
    {
      n: '03',
      th: { title: 'อยู่นอกห้อง', desc: 'ขยายห้องเรียน soulsilent ไปไกลถึงคุณ' },
      en: { title: 'Beyond the room', desc: 'Extends the soulsilent classroom to wherever you are.' },
    },
  ];
  return (
    <section className="section" id="why">
      <div className="container">
        <Reveal style={{ maxWidth: 760, marginBottom: 48 }}>
          <span className="eyebrow">
            02 — <T th="ทำไมเรียนออนไลน์" en="why online" />
          </span>
          <h2 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 64px)', margin: '18px 0 0' }}>
            <T
              th={
                <>
                  ห้องเรียน{' '}
                  <span style={{ position: 'relative', display: 'inline-block' }}>
                    ของคุณ
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
                  ทุกที่ทุกเวลา
                </>
              }
              en={
                <>
                  Your{' '}
                  <span style={{ position: 'relative', display: 'inline-block' }}>
                    classroom
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
                  anywhere, anytime
                </>
              }
            />
          </h2>
        </Reveal>

        <div className="grid-x g-cards">
          {items.map((it, i) => (
            <Reveal key={it.n} variant="reveal" delay={i * 100} className="card card-cream" style={{ padding: 28 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  color: 'var(--teal)',
                  marginBottom: 16,
                }}
              >
                {it.n}
              </div>
              <h3 className="display-th" style={{ fontSize: 22, margin: '0 0 8px' }}>
                {lang === 'th' ? it.th.title : it.en.title}
              </h3>
              <p style={{ fontSize: 14.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
                {lang === 'th' ? it.th.desc : it.en.desc}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Stats ---------- */
function Stats({ totalCourses }: { totalCourses: number }) {
  const { lang } = useLang();
  const items = [
    { num: String(totalCourses || 0), label: { th: 'คอร์ส', en: 'courses' }, sub: { th: 'ออนไลน์', en: 'online' } },
    { num: '1.2k', label: { th: 'ผู้เรียน', en: 'learners' }, sub: { th: 'ทั่วประเทศ', en: 'nationwide' } },
    { num: '320', label: { th: 'ชั่วโมง', en: 'hours' }, sub: { th: 'เนื้อหาวิดีโอ', en: 'of video' } },
    { num: '24', label: { th: 'ผู้สอน', en: 'instructors' }, sub: { th: 'จากทีมเรา', en: 'on our team' } },
  ];
  return (
    <section className="section bg-cream" id="stats">
      <div className="container">
        <Reveal style={{ maxWidth: 760, marginBottom: 48 }}>
          <span className="eyebrow">
            03 — <T th="ตัวเลข" en="by the numbers" />
          </span>
          <h2 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 64px)', margin: '18px 0 0' }}>
            <T th="ตัวเลขที่บอกเรื่องราว เงียบ ๆ" en="Numbers that quietly tell a story" />
          </h2>
        </Reveal>

        <div
          className="grid-x g-stats4"
          style={{ gap: 0, background: 'var(--paper)', borderRadius: 24, overflow: 'hidden' }}
        >
          {items.map((s, i) => (
            <StatCell key={i} s={s} i={i} lang={lang} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCell({
  s,
  i,
  lang,
}: {
  s: { num: string; label: { th: string; en: string }; sub: { th: string; en: string } };
  i: number;
  lang: 'th' | 'en';
}) {
  return (
    <Reveal as="div" variant="reveal" delay={i * 80} className="stat-cell">
      <div className="stat-num">
        <CountWhenSeen value={s.num} duration={1400 + i * 120} />
        <span style={{ color: 'var(--accent)' }}>.</span>
      </div>
      <div className="display-th" style={{ fontSize: 20, marginTop: 6 }}>
        {s.label[lang]}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--muted)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          marginTop: 6,
        }}
      >
        {s.sub[lang]}
      </div>
    </Reveal>
  );
}

/* ---------- CTA ---------- */
function CTA() {
  const { lang } = useLang();
  return (
    <section className="bg-ink-section" id="start" style={{ position: 'relative', overflow: 'hidden' }}>
      <Reveal
        draw
        delay={150}
        style={{ position: 'absolute', top: 90, left: '10%', width: 30, pointerEvents: 'none' }}
      >
        <Sparkle color="var(--accent)" />
      </Reveal>
      <Reveal
        draw
        delay={250}
        style={{ position: 'absolute', top: 140, right: '14%', width: 22, pointerEvents: 'none' }}
      >
        <Sparkle color="var(--teal-200)" />
      </Reveal>

      <div className="container" style={{ position: 'relative', padding: '96px 32px' }}>
        <Reveal style={{ textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            04 — <T th="เริ่มกันเลย" en="let's start" />
          </span>
          <h2
            className="display-en"
            style={{
              fontSize: 'clamp(56px, 11vw, 168px)',
              color: '#fff',
              margin: '24px 0 0',
              lineHeight: 0.88,
            }}
          >
            START
            <br />
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span style={{ color: 'var(--accent)' }}>LEARNING</span>
              <Reveal
                draw
                style={{
                  position: 'absolute',
                  left: '-2%',
                  right: '-2%',
                  bottom: '-8px',
                  width: '104%',
                  height: 18,
                }}
              >
                <Squiggle color="var(--accent)" stroke={6} />
              </Reveal>
            </span>
          </h2>
          <div className="hand" style={{ color: 'var(--accent)', fontSize: 32, marginTop: 18 }}>
            at your own pace ✺
          </div>
          <p
            style={{
              fontSize: 'clamp(15px, 1.4vw, 18px)',
              color: '#9ab1ae',
              maxWidth: 560,
              margin: '24px auto 32px',
              lineHeight: 1.6,
            }}
          >
            <T
              th="พร้อมเรียนตามจังหวะของตัวเองหรือยัง? เลือกคอร์สที่ใช่ แล้วเริ่มได้เลยวันนี้."
              en="Ready to learn at your own pace? Pick a course and start today."
            />
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Btn kind="teal" href="/allsoullearn/courses">
              {tr(lang, 'ดูคอร์สทั้งหมด', 'Browse all courses')} →
            </Btn>
            <Btn kind="paper" href="/workshops">
              {tr(lang, 'ดู workshop', 'See workshops')}
            </Btn>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
