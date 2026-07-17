'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Cloud, ZigZag, UnderlineMark, Sparkle, DotCluster } from '@/components/design/Doodles';
import { getWorkshopTags, getEffectivePrice } from '@/lib/workshop-utils';

export default function WorkshopsListingPage() {
  const { lang } = useLang();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('');

  useEffect(() => {
    fetch('/api/workshops?status=active')
      .then((r) => r.json() as Promise<{ workshops: Workshop[] }>)
      .then((d) => {
        setWorkshops(d.workshops || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Distinct category + tag list — derived from actual data
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

  const filtered = useMemo(() => {
    return workshops.filter((w) => {
      if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
      if (tagFilter && !getWorkshopTags(w).includes(tagFilter)) return false;
      return true;
    });
  }, [workshops, categoryFilter, tagFilter]);

  return (
    <>
      <section className="section" style={{ paddingTop: 48, paddingBottom: 32, position: 'relative', overflow: 'hidden' }}>
        <Sparkle color="var(--accent)" style={{ position: 'absolute', top: 80, right: '12%', width: 28, pointerEvents: 'none' }} />
        <DotCluster color="var(--teal-200)" rows={4} cols={4} style={{ position: 'absolute', left: '10%', top: '60%', width: 36 }} />

        <div className="container" style={{ position: 'relative' }}>
          <Reveal>
            <span className="eyebrow">
              <T th="กิจกรรมทั้งหมด" en="All events" />
            </span>
            <h1
              className="display-th"
              style={{
                fontSize: 'clamp(40px, 7vw, 96px)',
                margin: '18px 0 12px',
                position: 'relative',
                display: 'inline-block',
              }}
            >
              <T
                th={
                  <>
                    เลือก<span style={{ color: 'var(--teal)' }}>กิจกรรม</span>ที่ใช่กับคุณ
                  </>
                }
                en={
                  <>
                    Find your <span style={{ color: 'var(--teal)' }}>workshop</span>
                  </>
                }
              />
              <Reveal
                draw
                delay={400}
                style={{ position: 'absolute', left: 0, bottom: -10, width: '40%', height: 18, pointerEvents: 'none' }}
              >
                <UnderlineMark color="var(--accent)" stroke={6} />
              </Reveal>
            </h1>
            <p style={{ fontSize: 'clamp(15px, 1.3vw, 17px)', color: 'var(--muted)', maxWidth: 560, lineHeight: 1.65 }}>
              <T
                th="ทั้ง workshop, camp และ talk — เลือกแบบที่เหมาะกับเวลาและจังหวะของคุณ. ที่นั่งจำกัดเสมอ."
                en="Workshops, camps, and talks — choose what fits your time and pace. Seats are always limited."
              />
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section bg-cream" style={{ paddingTop: 56 }}>
        <div className="container">
          {/* Category filter */}
          <Reveal variant="reveal-right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <FilterPill active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
              {tr(lang, 'ทั้งหมด', 'All')}
            </FilterPill>
            {categories.map((c) => (
              <FilterPill key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
                {c}
              </FilterPill>
            ))}
          </Reveal>

          {/* Tag filter */}
          {tags.length > 0 && (
            <Reveal
              variant="reveal-right"
              delay={80}
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 32, alignItems: 'center' }}
            >
              <span
                className="mono"
                style={{ fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 4 }}
              >
                #tags
              </span>
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                  className="tag"
                  style={{
                    cursor: 'pointer',
                    background: tagFilter === t ? 'var(--teal)' : 'var(--teal-50)',
                    color: tagFilter === t ? '#fff' : 'var(--teal-deep)',
                    border: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  {t}
                </button>
              ))}
              {tagFilter && (
                <button
                  onClick={() => setTagFilter('')}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {tr(lang, 'ล้างแท็ก', 'clear tag')}
                </button>
              )}
            </Reveal>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '2px solid var(--teal)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  margin: '0 auto',
                  animation: 'float 1s linear infinite',
                }}
              />
            </div>
          ) : (
            <div className="grid-x g-cards">
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                  {tr(lang, 'ไม่พบกิจกรรมที่ตรงกับตัวกรอง', 'No events match the filters')}
                </div>
              )}
              {filtered.map((w, i) => (
                <Reveal key={w.id} variant="reveal-zoom" delay={i * 70}>
                  <Card w={w} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        border: 0,
        background: active ? 'var(--ink)' : 'var(--paper)',
        color: active ? '#fff' : 'var(--ink)',
        transition: 'all .2s ease',
      }}
    >
      {children}
    </button>
  );
}

function Card({ w }: { w: Workshop }) {
  const { lang } = useLang();
  const tags = getWorkshopTags(w);
  const eff = getEffectivePrice(w);

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
      <div
        className="ph ph-teal card-media"
        style={{ aspectRatio: '297 / 420', borderRadius: 14, marginBottom: 16, position: 'relative', overflow: 'hidden' }}
      >
        {w.image_url ? (
          <img src={w.image_url} alt={w.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          </>
        )}
        {eff.isPromo && (
          <span
            className="tag tag-accent"
            style={{ position: 'absolute', top: 10, right: 10, fontWeight: 700 }}
          >
            {tr(lang, 'ลด', 'SAVE')} {Math.round((1 - eff.price / eff.originalPrice) * 100)}%
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {w.category && <span className="tag">{w.category}</span>}
        <span className="tag tag-accent">{tr(lang, 'เปิดจอง', 'Open')}</span>
      </div>
      <h3 className="display-th" style={{ fontSize: 20, margin: '0 0 6px', lineHeight: 1.2 }}>
        {w.title}
      </h3>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                background: 'var(--cream)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      )}
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
            {w.payment_type === 'free' || eff.price <= 0 ? tr(lang, 'ค่าเข้าร่วม', 'Entry') : tr(lang, 'เริ่มต้น', 'From')}
          </div>
          {w.payment_type === 'free' || eff.price <= 0 ? (
            <div style={{ fontFamily: 'Archivo Black', fontSize: 22, color: 'var(--teal)' }}>
              {tr(lang, 'ฟรี', 'Free')}
            </div>
          ) : eff.isPromo ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'Archivo Black', fontSize: 22, color: 'var(--teal)' }}>
                ฿{eff.price.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  textDecoration: 'line-through',
                }}
              >
                ฿{eff.originalPrice.toLocaleString()}
              </span>
            </div>
          ) : (
            <div style={{ fontFamily: 'Archivo Black', fontSize: 22 }}>
              ฿{eff.price.toLocaleString()}
            </div>
          )}
        </div>
        <span className="btn btn-teal btn-sm" aria-hidden>
          {tr(lang, 'จอง', 'Book')} <span className="mono">→</span>
        </span>
      </div>
    </Link>
  );
}
