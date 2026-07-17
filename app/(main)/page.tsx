'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Workshop, Article, ArticleCategory } from '@/lib/types';
import { useLang, T, tr, pick } from '@/lib/i18n';
import { getEffectivePrice } from '@/lib/workshop-utils';
import { categoryLabel, formatArticleDate } from '@/lib/article-utils';
import { Reveal } from '@/components/design/Reveal';
import { CountUp, CountWhenSeen } from '@/components/design/CountUp';
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
  Star,
  MarkerStroke,
} from '@/components/design/Doodles';

/* ============ Sample editorial content (reviews only — articles come from DB) ============ */
const REVIEWS = [
  {
    name: { th: 'พลอย · นักออกแบบ', en: 'Ploy · Designer' },
    workshop: 'Zine Lab #03',
    quote: {
      th: 'มาด้วยความคาดหวังว่าจะได้ "เทคนิค"\nกลับไปได้ "ตัวเอง"\nเป็นวันที่เงียบที่สุดในรอบหลายเดือน',
      en: 'I came expecting techniques.\nI left with myself.\nThe quietest day in months.',
    },
  },
  {
    name: { th: 'เปา · นักศึกษาปี 2', en: 'Pao · 2nd-year student' },
    workshop: 'Quiet Camp #01',
    quote: {
      th: 'เรียนหนัก เครียด แทบไม่ได้ออกไปไหนเลย\nสองวันนี้ทำให้รู้ว่าหายใจช้า ๆ\nก็เป็นการเรียนรู้ได้',
      en: 'School is heavy. I rarely go anywhere.\nThese two days taught me that\nbreathing slowly is learning too.',
    },
  },
  {
    name: { th: 'ตี้ · ฟรีแลนซ์', en: 'Tee · Freelancer' },
    workshop: 'Field Sketch · Charoenkrung',
    quote: {
      th: 'ครั้งแรกที่วาดรูปนอกบ้านโดยไม่กลัวคนมอง\nกลับบ้านมาวาดต่อทุกวัน',
      en: "First time drawing outside without fear.\nI've drawn every day since.",
    },
  },
];

const STATS = [
  { num: '6', label: { th: 'ปีก่อตั้ง', en: 'years' }, sub: { th: 'ตั้งแต่ 2020', en: 'since 2020' } },
  { num: '247', label: { th: 'กิจกรรม', en: 'events' }, sub: { th: 'workshop · camp · talk', en: 'workshop · camp · talk' } },
  { num: '12.8k', label: { th: 'ผู้เข้าร่วม', en: 'participants' }, sub: { th: 'ทั่วประเทศ', en: 'nationwide' } },
  { num: '38', label: { th: 'สถานที่จัดงาน', en: 'venues' }, sub: { th: 'organize เต็มระบบ', en: 'end-to-end organize' } },
];

/* ============ Page ============ */
type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  user_name: string | null;
  workshop_id: string | null;
  workshop_title: string | null;
  master_id: string | null;
};

/** Privacy-friendly reviewer name: first name + last-name initial, e.g. "สมชาย ใ." */
function abbrevName(full: string | null): string {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function HomePage() {
  const { lang } = useLang();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleCategories, setArticleCategories] = useState<ArticleCategory[]>([]);

  useEffect(() => {
    fetch('/api/workshops?status=active')
      .then((r) => r.json() as Promise<{ workshops: Workshop[] }>)
      .then((d) => setWorkshops(d.workshops || []))
      .catch(() => {});
    fetch('/api/articles')
      .then((r) => r.json() as Promise<{ articles: Article[] }>)
      .then((d) => setArticles(d.articles || []))
      .catch(() => {});
    fetch('/api/article-categories')
      .then((r) => r.json() as Promise<{ categories: ArticleCategory[] }>)
      .then((d) => setArticleCategories(d.categories || []))
      .catch(() => {});
  }, []);

  const featured = workshops[0];
  const upcoming = workshops.slice(0, 4);
  const leadArticle = articles.find((a) => a.featured) || articles[0];
  const sideArticles = articles.filter((a) => a.id !== leadArticle?.id).slice(0, 3);

  return (
    <>
      <Hero featured={featured} />
      <Workshops items={upcoming} />
      <Articles lead={leadArticle} side={sideArticles} categories={articleCategories} />
      <Reviews />
      <StatsAndVenues />
      <CTA />
    </>
  );
}

/* ---------- Hero ---------- */
function Hero({ featured }: { featured?: Workshop }) {
  const { lang } = useLang();
  // Live stats (base seed + real counts) — fall back to seed values on error.
  const [stats, setStats] = useState({ workshops: 11, participants: 125, locations: 0 });
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<{ workshops: number; participants: number; locations: number }>)
      .then((d) => setStats({ workshops: d.workshops ?? 11, participants: d.participants ?? 125, locations: d.locations ?? 0 }))
      .catch(() => {});
  }, []);
  return (
    <section
      className="section"
      id="top"
      style={{ paddingTop: 64, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}
    >
      <Reveal
        draw
        style={{ position: 'absolute', right: -160, top: 60, width: 680, opacity: 0.55, pointerEvents: 'none' }}
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
          <span className="eyebrow">soulsilent · workshop & organize</span>
        </Reveal>

        {lang === 'th' ? (
          <Reveal as="h1" delay={80} className="giant-th" style={{ margin: '0 0 6px' }}>
            เรียนรู้{' '}
            <span style={{ position: 'relative', display: 'inline-block', padding: '0 .1em' }}>
              นอกห้อง
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
            เรียน.
          </Reveal>
        ) : (
          <Reveal as="h1" delay={80} className="giant-en" style={{ margin: '0 0 6px' }}>
            LEARN
            <br />
            BEYOND{' '}
            <span style={{ position: 'relative', display: 'inline-block', padding: '0 .04em' }}>
              <span style={{ color: 'var(--teal)' }}>THE&nbsp;ROOM</span>
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
                    <span className="hand" style={{ color: 'var(--teal)', fontSize: '1.15em', marginRight: 6 }}>*</span>
                    ห้องเรียนของเราคือชายหาด ตลาดเก่า โต๊ะกาแฟยามบ่าย และความเงียบใต้ต้นไม้.
                    เราออกแบบ workshop · camp · ทริปเรียนรู้ ที่ทำให้คุณกลับมา{' '}
                    <span className="mark">รู้จักตัวเอง</span> ผ่านเรื่องเล็ก ๆ ในชีวิต.
                  </>
                }
                en={
                  <>
                    <span className="hand" style={{ color: 'var(--teal)', fontSize: '1.15em', marginRight: 6 }}>*</span>
                    Our classrooms are beaches, old markets, afternoon coffee tables, and the quiet under big trees. We design workshops, camps and field-trips that bring you back to{' '}
                    <span className="mark">knowing yourself</span> through the small things.
                  </>
                }
              />
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Btn kind="ink" href="#workshops">
                <T th="ดูกิจกรรมเร็ว ๆ นี้" en="See upcoming events" /> <span className="mono">→</span>
              </Btn>
              <Btn kind="paper" href="#venues">
                <T th="จัดงานกับเรา" en="Organize with us" />
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
                [String(stats.workshops), tr(lang, 'กิจกรรม', 'events')],
                [String(stats.participants), tr(lang, 'ผู้เข้าร่วม', 'participants')],
                [String(stats.locations), tr(lang, 'สถานที่', 'venues')],
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
            <FeaturedCard w={featured} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ w }: { w?: Workshop }) {
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
        style={{ aspectRatio: '297 / 420', borderRadius: 16, marginBottom: 18, position: 'relative', overflow: 'hidden' }}
      >
        {w?.image_url ? (
          <img
            src={w.image_url}
            alt={w.title}
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
              workshop · hero photo
            </span>
            <Cloud
              color="var(--accent)"
              stroke={3}
              style={{ position: 'absolute', top: 18, right: 24, width: 80, height: 46 }}
            />
            <WaveLine
              color="var(--teal-200)"
              stroke={2.5}
              style={{ position: 'absolute', bottom: 18, left: 18, right: 18, width: 'calc(100% - 36px)', height: 30 }}
              count={2}
            />
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="tag tag-accent">{tr(lang, 'กิจกรรมเด่น', 'Featured')}</span>
        <span className="tag" style={{ background: 'rgba(255,255,255,.1)', color: '#cbd6d4' }}>
          Workshop · Onsite
        </span>
      </div>
      <h3
        className="display-th"
        style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', margin: '0 0 8px', color: '#fff' }}
      >
        {w?.title || (lang === 'th' ? 'ยังไม่มีกิจกรรมเด่น' : 'No featured event yet')}
      </h3>
      <p style={{ fontSize: 13, color: '#9ab1ae', margin: '0 0 20px', lineHeight: 1.5 }}>
        {w?.short_description || (lang === 'th' ? 'รอกิจกรรมใหม่เร็ว ๆ นี้' : 'Stay tuned for new events')}
      </p>
      {w && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 18 }}>
          {[
            [
              tr(lang, 'วันที่', 'Date'),
              new Date(w.date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
            ],
            [tr(lang, 'เวลา', 'Time'), `${w.time_start} – ${w.time_end}`],
            [tr(lang, 'สถานที่', 'Place'), w.location || '—'],
            [tr(lang, 'ที่นั่ง', 'Seats'), `${w.max_participants} ${tr(lang, 'ที่นั่ง', 'seats')}`],
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
            {tr(lang, 'เริ่มต้น', 'From')}
          </div>
          {(() => {
            const eff = w ? getEffectivePrice(w) : null;
            if (w && (w.payment_type === 'free' || (eff?.price ?? w.price) <= 0)) {
              return (
                <div style={{ fontFamily: 'Archivo Black', fontSize: 24, color: 'var(--accent)' }}>
                  {tr(lang, 'ฟรี', 'Free')}
                </div>
              );
            }
            if (eff?.isPromo) {
              return (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 24, color: 'var(--accent)' }}>
                    ฿{eff.price.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 13, color: '#7f9794', textDecoration: 'line-through' }}>
                    ฿{eff.originalPrice.toLocaleString()}
                  </span>
                </div>
              );
            }
            return (
              <div style={{ fontFamily: 'Archivo Black', fontSize: 24 }}>
                ฿{(w?.price || 0).toLocaleString()}
              </div>
            );
          })()}
        </div>
        <Btn kind="paper" size="sm" href={w ? `/workshops/${w.id}` : '/workshops'}>
          {tr(lang, 'จองที่นั่ง', 'Book seat')} <span className="mono">→</span>
        </Btn>
      </div>
    </article>
  );
}

/* ---------- Workshops listing ---------- */
function Workshops({ items }: { items: Workshop[] }) {
  const { lang } = useLang();
  const [filter, setFilter] = useState('all');
  const filters = [
    { k: 'all', th: 'ทั้งหมด', en: 'All' },
    { k: 'ws', th: 'Workshop', en: 'Workshop' },
    { k: 'camp', th: 'Camp', en: 'Camp' },
    { k: 'talk', th: 'Talk', en: 'Talk' },
  ];

  return (
    <section className="section bg-cream" id="workshops">
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
              01 — <T th="เร็ว ๆ นี้" en="upcoming" />
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
                    กิจกรรมที่
                    <br />
                    กำลังจะเกิดขึ้น
                  </>
                }
                en={
                  <>
                    What&apos;s
                    <br />
                    coming next
                  </>
                }
              />
              <Reveal
                draw
                delay={400}
                style={{ position: 'absolute', left: 0, bottom: -14, width: '72%', height: 18, pointerEvents: 'none' }}
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
                th="จองล่วงหน้า · ที่นั่งจำกัดทุก workshop. เหลือที่ว่างให้ความคิดได้ทำงาน."
                en="Book ahead · every workshop has limited seats. Leave room for your thoughts to breathe."
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

        <div className="grid-x g-cards">
          {items.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
              {tr(lang, 'ยังไม่มีกิจกรรมเร็ว ๆ นี้', 'No upcoming events yet')}
            </div>
          )}
          {items.map((w, i) => (
            <Reveal key={w.id} variant="reveal-zoom" delay={i * 90}>
              <WorkshopCardBig w={w} />
            </Reveal>
          ))}
        </div>

        <Reveal style={{ marginTop: 36, textAlign: 'center' }}>
          <Btn kind="ghost" href="/workshops">
            <T th="ดูทั้งหมด" en="See all events" /> <span className="mono">→</span>
          </Btn>
        </Reveal>
      </div>
    </section>
  );
}

function WorkshopCardBig({ w }: { w: Workshop }) {
  const { lang } = useLang();
  return (
    <Link
      href={`/workshops/${w.id}`}
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
      <div className="ph ph-teal card-media" style={{ aspectRatio: '297 / 420', borderRadius: 14, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        {w.image_url ? (
          <img
            src={w.image_url}
            alt={w.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <>
            <ZigZag
              color="var(--teal)"
              stroke={3}
              style={{ position: 'absolute', bottom: 14, left: 14, right: 14, width: 'calc(100% - 28px)', height: 24 }}
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
              cover · 16:9
            </span>
          </>
        )}
        {(() => {
          const eff = getEffectivePrice(w);
          if (!eff.isPromo) return null;
          const pct = Math.round((1 - eff.price / eff.originalPrice) * 100);
          return (
            <span className="tag tag-accent" style={{ position: 'absolute', top: 10, right: 10, fontWeight: 700 }}>
              {tr(lang, 'ลด', 'SAVE')} {pct}%
            </span>
          );
        })()}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="tag">Onsite</span>
        <span className="tag tag-accent">{tr(lang, 'เปิดจอง', 'Open')}</span>
      </div>
      <h3 className="display-th" style={{ fontSize: 20, margin: '0 0 6px', lineHeight: 1.2 }}>
        {w.title}
      </h3>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.55 }}>
        <div>
          📅{' '}
          {new Date(w.date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          · {w.time_start}–{w.time_end}
        </div>
        {w.location && <div>📍 {w.location}</div>}
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
            {tr(lang, 'เริ่มต้น', 'From')}
          </div>
          {(() => {
            const eff = getEffectivePrice(w);
            if (w.payment_type === 'free' || eff.price <= 0) {
              return (
                <div style={{ fontFamily: 'Archivo Black', fontSize: 22, color: 'var(--teal)' }}>
                  {tr(lang, 'ฟรี', 'Free')}
                </div>
              );
            }
            if (eff.isPromo) {
              return (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Archivo Black', fontSize: 22, color: 'var(--teal)' }}>
                    ฿{eff.price.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'line-through' }}>
                    ฿{eff.originalPrice.toLocaleString()}
                  </span>
                </div>
              );
            }
            return (
              <div style={{ fontFamily: 'Archivo Black', fontSize: 22 }}>
                ฿{eff.price.toLocaleString()}
              </div>
            );
          })()}
        </div>
        <span className="btn btn-teal btn-sm" aria-hidden>
          {tr(lang, 'จอง', 'Book')} <span className="mono">→</span>
        </span>
      </div>
    </Link>
  );
}

/* ---------- Articles ---------- */
function Articles({
  lead,
  side,
  categories,
}: {
  lead?: Article;
  side: Article[];
  categories: ArticleCategory[];
}) {
  const { lang } = useLang();
  const sideSwatches = ['ph-teal', 'ph-cream', 'ph-ink'] as const;

  return (
    <section className="section" id="articles">
      <div className="container">
        <div className="grid-x g-half" style={{ gap: 40, alignItems: 'flex-end', marginBottom: 44 }}>
          <Reveal>
            <span className="eyebrow">
              02 — <T th="อ่าน" en="read" />
            </span>
            <h2 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 64px)', margin: '18px 0 0' }}>
              <T
                th={
                  <>
                    ข่าวสาร{' '}
                    <span style={{ fontFamily: 'Caveat', color: 'var(--teal)', fontWeight: 700 }}>
                      บทความ
                    </span>
                    <br />
                    การเรียนรู้
                  </>
                }
                en={
                  <>
                    News &{' '}
                    <span style={{ fontFamily: 'Caveat', color: 'var(--teal)', fontWeight: 700 }}>
                      essays
                    </span>
                    <br />
                    on learning
                  </>
                }
              />
            </h2>
          </Reveal>
          <Reveal variant="reveal-right" style={{ maxWidth: 380, marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
              <T
                th="บันทึก, สัมภาษณ์, และเครื่องมือเล็ก ๆ จากทีม soulsilent — อ่านเล่นในวันหยุด หรือก่อนเข้านอน."
                en="Notes, interviews, and small tools from the soulsilent team — for weekends, or just before bed."
              />
            </p>
            <Btn kind="ghost" size="sm" href="/articles">
              <T th="archive ทั้งหมด" en="full archive" /> <span className="mono">→</span>
            </Btn>
          </Reveal>
        </div>

        {!lead && side.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>
            <T th="ยังไม่มีบทความ" en="No articles yet" />
          </p>
        ) : (
          <div className="grid-x g-articles" style={{ gap: 28 }}>
            {/* Lead card */}
            {lead && (
              <Reveal as="div" variant="reveal-left">
                <Link
                  href={`/articles/${lead.slug}`}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    textDecoration: 'none',
                    color: 'var(--ink)',
                  }}
                >
                  <div
                    className={`ph ${
                      lead.cover_swatch === 'cream'
                        ? 'ph-cream'
                        : lead.cover_swatch === 'ink'
                          ? 'ph-ink'
                          : lead.cover_swatch === 'accent'
                            ? 'ph-accent'
                            : 'ph-teal-100'
                    } card-media`}
                    style={{ height: 300, position: 'relative', overflow: 'hidden' }}
                  >
                    {lead.cover_image_url ? (
                      <img
                        src={lead.cover_image_url}
                        alt={lead.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Ribbon
                        color="var(--teal)"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0.85,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ padding: 28 }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
                      <span className="tag">{categoryLabel(lead.category, lang, categories)}</span>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--muted)',
                          fontFamily: 'JetBrains Mono',
                        }}
                      >
                        {formatArticleDate(lead.date, lang)}
                      </span>
                    </div>
                    <h3
                      className="display-th"
                      style={{
                        fontSize: 'clamp(22px, 2.4vw, 28px)',
                        margin: '0 0 12px',
                        lineHeight: 1.2,
                      }}
                    >
                      {lead.title}
                    </h3>
                    {lead.excerpt && (
                      <p
                        style={{
                          fontSize: 15.5,
                          color: 'var(--muted)',
                          margin: '0 0 18px',
                          lineHeight: 1.65,
                        }}
                      >
                        {lead.excerpt}
                      </p>
                    )}
                    <span
                      style={{
                        color: 'var(--teal)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <T th="อ่านต่อ" en="Read more" /> <span className="mono">→</span>
                    </span>
                  </div>
                </Link>
              </Reveal>
            )}

            {/* Side stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {side.map((a, i) => (
                <Reveal as="div" key={a.id} variant="reveal-right" delay={i * 100}>
                  <Link
                    href={`/articles/${a.slug}`}
                    className="card card-cream"
                    style={{
                      padding: 18,
                      display: 'flex',
                      gap: 16,
                      cursor: 'pointer',
                      textDecoration: 'none',
                      color: 'var(--ink)',
                    }}
                  >
                    <div
                      className={`ph ${sideSwatches[i % sideSwatches.length]} card-media`}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 12,
                        flexShrink: 0,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {a.cover_image_url && (
                        <img
                          src={a.cover_image_url}
                          alt={a.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span className="tag" style={{ fontSize: 10 }}>
                          {categoryLabel(a.category, lang, categories)}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            fontFamily: 'JetBrains Mono',
                          }}
                        >
                          {formatArticleDate(a.date, lang)}
                        </span>
                      </div>
                      <h4
                        className="display-th"
                        style={{ fontSize: 17, margin: '0 0 6px', lineHeight: 1.25 }}
                      >
                        {a.title}
                      </h4>
                      {a.excerpt && (
                        <p
                          style={{
                            fontSize: 13,
                            color: 'var(--muted)',
                            margin: 0,
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {a.excerpt}
                        </p>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--teal)',
                          marginTop: 8,
                          fontFamily: 'JetBrains Mono',
                          letterSpacing: '.1em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <T th="อ่าน" en="read" /> →
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Reviews ---------- */
function Reviews() {
  const { lang } = useLang();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only admin-featured (ติดดาว) reviews, capped at 10, for the slider.
    fetch('/api/reviews?featured=1&limit=10')
      .then((r) => r.json() as Promise<{ reviews: PublicReview[]; total: number }>)
      .then((d) => setReviews(d.reviews || []))
      .catch(() => {});
  }, []);

  function slide(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('.rev-card') as HTMLElement | null;
    const step = card ? card.offsetWidth + 22 : el.clientWidth / 3;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  // Real reviews from the DB; fall back to the editorial samples if none yet.
  const reviewCards =
    reviews.length > 0
      ? reviews.map((r) => ({
          key: r.id,
          name: abbrevName(r.user_name),
          workshop: r.workshop_title || '',
          // Linked to a master → master info page; else the session detail page.
          href: r.master_id
            ? `/workshop-info/${r.master_id}`
            : r.workshop_id
              ? `/workshops/${r.workshop_id}`
              : undefined,
          quote: r.comment || '',
          rating: Math.max(1, Math.min(5, r.rating || 5)),
        }))
      : REVIEWS.map((r, i) => ({
          key: `sample-${i}`,
          name: pick(r.name, lang),
          workshop: r.workshop,
          href: undefined as string | undefined,
          quote: pick(r.quote, lang),
          rating: 5,
        }));

  return (
    <section className="section bg-teal-section" id="reviews" style={{ position: 'relative', overflow: 'hidden' }}>
      <Reveal draw style={{ position: 'absolute', top: 80, right: '8%', width: 120, opacity: 0.6, pointerEvents: 'none' }}>
        <Cloud color="var(--accent)" stroke={3} />
      </Reveal>
      <Reveal draw delay={200} style={{ position: 'absolute', top: 140, right: '24%', width: 28, pointerEvents: 'none' }}>
        <Sparkle color="var(--accent)" />
      </Reveal>

      <div className="container" style={{ position: 'relative' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 48, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            03 — <T th="รีวิว" en="reviews" />
          </span>
          <h2
            className="display-en"
            style={{ fontSize: 'clamp(56px, 9vw, 140px)', color: '#fff', margin: '18px 0 4px', textAlign: 'center' }}
          >
            <span style={{ color: 'var(--accent)' }}>&ldquo;</span>SOULFUL<span style={{ color: 'var(--accent)' }}>&rdquo;</span>
          </h2>
          <div className="hand" style={{ color: 'var(--accent)', fontSize: 30 }}>
            <T th="— จากผู้เข้าร่วม" en="— from our participants" />
          </div>
        </Reveal>

        <div className="rev-viewport" style={{ position: 'relative' }}>
          <button type="button" className="rev-arrow rev-arrow-l" onClick={() => slide(-1)} aria-label="ก่อนหน้า">‹</button>
          <button type="button" className="rev-arrow rev-arrow-r" onClick={() => slide(1)} aria-label="ถัดไป">›</button>
          <div className="rev-track" ref={trackRef}>
          {reviewCards.map((r, i) => (
            <article
              className="rev-card"
              key={r.key}
              style={{
                background: '#fff',
                color: 'var(--ink)',
                borderRadius: 22,
                padding: 26,
                position: 'relative',
                transform: `rotate(${i % 2 === 0 ? -1 : 1}deg)`,
                transition: 'transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -22,
                  left: 22,
                  fontFamily: 'Archivo Black',
                  fontSize: 80,
                  color: 'var(--accent)',
                  lineHeight: 1,
                }}
              >
                &ldquo;
              </div>
              <div style={{ display: 'flex', gap: 3, marginBottom: 12, marginTop: 16 }}>
                {[0, 1, 2, 3, 4].map((k) => (
                  <Star
                    key={k}
                    color={k < r.rating ? 'var(--accent)' : 'var(--cream-deep)'}
                    style={{ width: 18, height: 18 }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 15.5, lineHeight: 1.6, margin: '0 0 22px', whiteSpace: 'pre-line' }}>
                {r.quote}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontFamily: 'Mitr',
                  }}
                >
                  {(r.name || '—')[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                  {r.href ? (
                    <Link
                      href={r.href}
                      style={{
                        fontSize: 11,
                        color: 'var(--teal)',
                        fontFamily: 'JetBrains Mono',
                        letterSpacing: '.05em',
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      {r.workshop}
                    </Link>
                  ) : (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'JetBrains Mono',
                        letterSpacing: '.05em',
                      }}
                    >
                      {r.workshop}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .rev-track {
          display: flex;
          gap: 22px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding: 28px 4px 10px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .rev-track::-webkit-scrollbar { display: none; }
        .rev-card {
          flex: 0 0 calc((100% - 44px) / 3);
          scroll-snap-align: start;
        }
        .rev-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 3;
          width: 46px;
          height: 46px;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          background: #fff;
          color: var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          line-height: 1;
          box-shadow: 0 10px 26px -10px rgba(0, 0, 0, 0.45);
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .rev-arrow:hover { transform: translateY(-50%) scale(1.08); background: var(--accent); }
        .rev-arrow-l { left: -12px; }
        .rev-arrow-r { right: -12px; }
        @media (max-width: 900px) {
          .rev-card { flex-basis: calc((100% - 22px) / 2); }
        }
        @media (max-width: 620px) {
          .rev-card { flex-basis: 86%; }
          .rev-arrow { width: 40px; height: 40px; font-size: 21px; }
          .rev-arrow-l { left: -6px; }
          .rev-arrow-r { right: -6px; }
        }
      `}</style>
    </section>
  );
}

/* ---------- Stats + Venues ---------- */
function StatsAndVenues() {
  const { lang } = useLang();
  return (
    <section className="section bg-cream" id="stats">
      <div className="container">
        <Reveal style={{ maxWidth: 760, marginBottom: 48 }}>
          <span className="eyebrow">
            04 — <T th="ตัวเลข" en="by the numbers" />
          </span>
          <h2 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 64px)', margin: '18px 0 0' }}>
            <T
              th={
                <>
                  ตัวเลขที่ทำให้เรา{' '}
                  <span style={{ position: 'relative', display: 'inline-block' }}>
                    ภูมิใจ
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
                  เงียบ ๆ
                </>
              }
              en={
                <>
                  Numbers we are quietly{' '}
                  <span style={{ position: 'relative', display: 'inline-block' }}>
                    proud
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
                  of
                </>
              }
            />
          </h2>
        </Reveal>

        <StatsRow />

        <div
          className="grid-x g-half"
          id="venues"
          style={{ marginTop: 80, gap: 48, alignItems: 'center' }}
        >
          <Reveal variant="reveal-left">
            <span className="eyebrow">organize · venue</span>
            <h3
              className="display-th"
              style={{ fontSize: 'clamp(28px, 4vw, 46px)', margin: '14px 0 16px', lineHeight: 1.1 }}
            >
              <T
                th={
                  <>
                    จัดงาน workshop
                    <br />
                    ของคุณกับเรา<span style={{ color: 'var(--teal)' }}>.</span>
                  </>
                }
                en={
                  <>
                    Organize your workshop
                    <br />
                    with us<span style={{ color: 'var(--teal)' }}>.</span>
                  </>
                }
              />
            </h3>
            <p
              style={{
                fontSize: 'clamp(15px, 1.3vw, 16.5px)',
                color: 'var(--muted)',
                lineHeight: 1.65,
                margin: '0 0 22px',
                maxWidth: 480,
              }}
            >
              <T
                th="เรามีสถานที่ในกรุงเทพฯ หัวหิน และเขาใหญ่ — รับ organize ตั้งแต่ workshop เล็ก 8 คน ไปจนถึง camp 60 คน เต็มระบบ: สถานที่ · อาหาร · facilitator · ของที่ระลึก."
                en="We host venues in Bangkok, Hua Hin and Khao Yai — and organize end-to-end, from small 8-person workshops to 60-person camps: venue, food, facilitators, take-home keepsakes."
              />
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Btn kind="teal" href="#contact">
                {tr(lang, 'คุยกับทีม', 'Talk to the team')}
              </Btn>
              <Btn kind="paper" href="#">
                {tr(lang, 'ดู portfolio', 'See portfolio')}
              </Btn>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 28, paddingTop: 20 }}>
              {[
                ['38', tr(lang, 'สถานที่', 'venues')],
                ['180+', tr(lang, 'งานที่จัด', 'events run')],
                ['8–60', tr(lang, 'คน/ครั้ง', 'per event')],
              ].map(([n, l]) => (
                <div key={l} style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      fontFamily: 'Archivo Black',
                      fontSize: 'clamp(22px, 2.6vw, 30px)',
                      letterSpacing: '-.02em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <CountWhenSeen value={n} />
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: 'var(--muted)',
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      marginTop: 4,
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal
            variant="reveal-right"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
          >
            <div
              className="ph ph-teal"
              style={{ borderRadius: 18, height: 200, gridRow: 'span 2', position: 'relative', overflow: 'hidden' }}
            >
              <span
                style={{
                  position: 'absolute',
                  bottom: 14,
                  left: 14,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  opacity: 0.65,
                }}
              >
                venue · {tr(lang, 'หัวหิน', 'Hua Hin')}
              </span>
              <Cloud
                color="var(--teal)"
                stroke={3}
                style={{ position: 'absolute', top: 14, right: 14, width: 60, height: 38 }}
              />
            </div>
            <div className="ph ph-ink" style={{ borderRadius: 18, height: 93, position: 'relative', overflow: 'hidden' }}>
              <span
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 14,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  opacity: 0.75,
                }}
              >
                {tr(lang, 'เขาใหญ่', 'Khao Yai')}
              </span>
              <ZigZag
                color="var(--accent)"
                stroke={3}
                style={{ position: 'absolute', bottom: 8, left: 8, right: 8, width: 'calc(100% - 16px)', height: 18 }}
              />
            </div>
            <div className="ph ph-cream" style={{ borderRadius: 18, height: 93, position: 'relative', overflow: 'hidden' }}>
              <span
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 14,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {tr(lang, 'อารีย์ · กทม.', 'Ari · Bangkok')}
              </span>
              <Sparkle
                color="var(--teal)"
                stroke={2.5}
                style={{ position: 'absolute', top: 10, right: 10, width: 18 }}
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function StatsRow() {
  const { lang } = useLang();
  // Same live stats as the hero (base seed + real counts).
  const [stats, setStats] = useState({ workshops: 11, participants: 125, locations: 0 });
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<{ workshops: number; participants: number; locations: number }>)
      .then((d) => setStats({ workshops: d.workshops ?? 11, participants: d.participants ?? 125, locations: d.locations ?? 0 }))
      .catch(() => {});
  }, []);
  const nums = [String(stats.workshops), String(stats.participants), String(stats.locations)];
  return (
    <Reveal
      className="grid-x g-stats4"
      style={{ gap: 0, background: 'var(--paper)', borderRadius: 24, overflow: 'hidden' }}
    >
      {STATS.map((s, i) => (
        <div key={i} className="stat-cell">
          <div className="stat-num">
            <StatNumber value={nums[i] ?? s.num} index={i} />
            <span style={{ color: 'var(--accent)' }}>.</span>
          </div>
          <div className="display-th" style={{ fontSize: 20, marginTop: 6 }}>
            {pick(s.label, lang)}
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
            {pick(s.sub, lang)}
          </div>
        </div>
      ))}
    </Reveal>
  );
}

function StatNumber({ value, index }: { value: string; index: number }) {
  return <CountWhenSeen value={value} duration={1400 + index * 120} />;
}

/* ---------- CTA + Contact + Footer ---------- */
function CTA() {
  const { lang } = useLang();
  return (
    <section className="bg-ink-section" id="contact" style={{ position: 'relative', overflow: 'hidden' }}>
      <Reveal draw delay={150} style={{ position: 'absolute', top: 90, left: '10%', width: 30, pointerEvents: 'none' }}>
        <Sparkle color="var(--accent)" />
      </Reveal>
      <Reveal draw delay={250} style={{ position: 'absolute', top: 140, right: '14%', width: 22, pointerEvents: 'none' }}>
        <Sparkle color="var(--teal-200)" />
      </Reveal>

      <div className="container" style={{ position: 'relative', padding: '96px 32px 0' }}>
        <Reveal style={{ textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            05 — <T th="เริ่มกันเลย" en="let's start" />
          </span>
          <h2
            className="display-en"
            style={{ fontSize: 'clamp(56px, 11vw, 168px)', color: '#fff', margin: '24px 0 0', lineHeight: 0.88 }}
          >
            ENJOY
            <br />
            THE&nbsp;
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span style={{ color: 'var(--accent)' }}>JOURNEY</span>
              <Reveal
                draw
                style={{ position: 'absolute', left: '-2%', right: '-2%', bottom: '-8px', width: '104%', height: 18 }}
              >
                <Squiggle color="var(--accent)" stroke={6} />
              </Reveal>
            </span>
          </h2>
          <div className="hand" style={{ color: 'var(--accent)', fontSize: 32, marginTop: 18 }}>
            it can be fun! ✺
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
              th="พร้อมเรียนรู้นอกห้องเรียนแล้วหรือยัง? เลือกกิจกรรมที่ใช่, หรือบอกเราว่าคุณอยากจัดงานแบบไหน."
              en="Ready to learn outside the room? Pick an event, or tell us what you want to organize."
            />
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Btn kind="teal" href="#workshops">
              {tr(lang, 'จองกิจกรรมเลย', 'Book an event')} →
            </Btn>
            <Btn kind="paper" href="#contact-form">
              {tr(lang, 'คุยกับทีม organize', 'Chat with organize team')}
            </Btn>
          </div>
        </Reveal>

        <div className="grid-x g-contact" style={{ marginTop: 64, gap: 32, alignItems: 'start' }}>
          <Reveal
            variant="reveal-left"
            id="contact-form"
            style={{ background: 'rgba(255,255,255,.04)', borderRadius: 22, padding: 28 }}
          >
            <div className="hand" style={{ color: 'var(--accent)', fontSize: 22, marginBottom: 6 }}>
              say hello
            </div>
            <h3 className="display-th" style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', margin: '0 0 22px' }}>
              <T th="ส่งข้อความหาทีม" en="Drop the team a line" />
            </h3>
            <div className="grid-x g-half" style={{ gap: 10, marginBottom: 10 }}>
              <input className="field field-dark" placeholder={tr(lang, 'ชื่อ', 'Name')} />
              <input className="field field-dark" placeholder={tr(lang, 'อีเมล', 'Email')} />
            </div>
            <select className="field field-dark" style={{ marginBottom: 10 }}>
              <option style={{ color: '#000' }}>{tr(lang, 'หัวข้อ — จองกิจกรรม', 'Topic — book an event')}</option>
              <option style={{ color: '#000' }}>{tr(lang, 'หัวข้อ — จัดงาน organize', 'Topic — organize')}</option>
              <option style={{ color: '#000' }}>{tr(lang, 'หัวข้อ — เป็น facilitator', 'Topic — facilitate')}</option>
              <option style={{ color: '#000' }}>{tr(lang, 'หัวข้อ — ทั่วไป', 'Topic — general')}</option>
            </select>
            <textarea
              className="field field-dark"
              rows={4}
              placeholder={tr(lang, 'ข้อความ', 'Message')}
              style={{ marginBottom: 14, resize: 'vertical' }}
            />
            <Btn kind="teal" style={{ width: '100%', justifyContent: 'center' }}>
              {tr(lang, 'ส่งข้อความ', 'Send message')} →
            </Btn>
          </Reveal>

          <Reveal variant="reveal-right" style={{ paddingTop: 8 }}>
            <div
              className="mono"
              style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 16 }}
            >
              contact
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 14.5 }}>
              <div>
                <div
                  style={{
                    color: '#7f9794',
                    fontSize: 11.5,
                    marginBottom: 4,
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tr(lang, 'อีเมล', 'Email')}
                </div>
                <a href="mailto:hello@soulsilent.co" style={{ color: '#fff', textDecoration: 'none' }}>
                  hello@soulsilent.co
                </a>
              </div>
              <div>
                <div
                  style={{
                    color: '#7f9794',
                    fontSize: 11.5,
                    marginBottom: 4,
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tr(lang, 'โทรศัพท์', 'Phone')}
                </div>
                <a href="tel:+6620000000" style={{ color: '#fff', textDecoration: 'none' }}>
                  +66 2 000 0000
                </a>
              </div>
              <div>
                <div
                  style={{
                    color: '#7f9794',
                    fontSize: 11.5,
                    marginBottom: 4,
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tr(lang, 'ที่ตั้ง', 'Office')}
                </div>
                <div style={{ color: '#fff' }}>
                  <T
                    th={
                      <>
                        32/4 ซอยอารีย์ 1, พญาไท
                        <br />
                        กรุงเทพมหานคร 10400
                      </>
                    }
                    en={
                      <>
                        32/4 Soi Ari 1, Phayathai
                        <br />
                        Bangkok 10400
                      </>
                    }
                  />
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: '#7f9794',
                    fontSize: 11.5,
                    marginBottom: 8,
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tr(lang, 'โซเชียล', 'Social')}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Line'].map((s) => (
                    <a
                      key={s}
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      style={{
                        padding: '7px 13px',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,.06)',
                        fontSize: 12,
                        color: '#fff',
                        textDecoration: 'none',
                      }}
                    >
                      {s}
                    </a>
                  ))}
                </div>
              </div>
              <div
                style={{
                  background: 'var(--accent)',
                  color: 'var(--ink)',
                  padding: 18,
                  borderRadius: 18,
                  marginTop: 10,
                }}
              >
                <div className="hand" style={{ fontSize: 22, marginBottom: 4 }}>
                  <T th="กำลังหาคอร์สออนไลน์?" en="Looking for online courses?" />
                </div>
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                  <T th="เรียนได้ทุกที่ทุกเวลา ที่แพลตฟอร์มน้องสาวของเรา" en="Learn anytime, anywhere — on our sister platform" />
                </div>
                <Link
                  href="/allsoullearn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--ink)',
                    color: '#fff',
                    padding: '10px 16px',
                    borderRadius: 999,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  AllSoulLearn ↗
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <footer className="site-footer" style={{ padding: '48px 0 28px', marginTop: 80 }}>
        <div
          className="container"
          style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: 'var(--ink)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Mitr',
                fontWeight: 600,
              }}
            >
              s
            </span>
            <span style={{ fontFamily: 'Mitr', fontWeight: 500, fontSize: 17 }}>
              soulsilent<span style={{ color: 'var(--accent)' }}>.</span>
            </span>
            <span style={{ fontSize: 12, color: '#7f9794', marginLeft: 8 }}>
              © 2026 · learn outside the room
            </span>
          </div>
          <div style={{ display: 'flex', gap: 18, fontSize: 13, flexWrap: 'wrap' }}>
            <a href="#">{tr(lang, 'ความเป็นส่วนตัว', 'Privacy')}</a>
            <a href="#">{tr(lang, 'เงื่อนไขการใช้', 'Terms')}</a>
            <a href="#">FAQ</a>
            <Link href="/allsoullearn">↗ AllSoulLearn</Link>
          </div>
        </div>
      </footer>
    </section>
  );
}
