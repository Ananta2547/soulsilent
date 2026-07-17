'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Article, ArticleCategory } from '@/lib/types';
import { DEFAULT_CATEGORIES, categoryLabel, formatArticleDate, parseTags } from '@/lib/article-utils';
import { useLang, T } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';

const swatchClass = (s: string) =>
  s === 'cream' ? 'ph-cream' : s === 'ink' ? 'ph-ink' : s === 'accent' ? 'ph-accent' : 'ph-teal';

export default function ArticlesPage() {
  const { lang } = useLang();
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/articles').then((r) => r.json() as Promise<{ articles: Article[] }>),
      fetch('/api/article-categories').then(
        (r) => r.json() as Promise<{ categories: ArticleCategory[] }>
      ),
    ])
      .then(([a, c]) => {
        setArticles(a.articles || []);
        setCategories(c.categories || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build the pill list: "ทั้งหมด" + admin-managed categories (fallback to defaults)
  const filterPills =
    categories.length > 0
      ? [{ key: 'all', th: 'ทั้งหมด', en: 'All' }, ...categories]
      : DEFAULT_CATEGORIES;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (active !== 'all' && a.category !== active) return false;
      if (!q) return true;
      const blob = [a.title, a.excerpt || '', parseTags(a).join(' ')].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [articles, active, query]);

  const lead = filtered.find((a) => a.featured) || filtered[0];
  const rest = filtered.filter((a) => a.id !== lead?.id);

  return (
    <>
      {/* Hero */}
      <section style={{ padding: '72px 0 32px' }}>
        <div className="container">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 32,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 480px' }}>
              <Reveal>
                <span className="eyebrow">
                  <T th="บทความ · journal" en="Journal · the archive" />
                </span>
              </Reveal>
              <Reveal delay={120}>
                <h1
                  className={lang === 'th' ? 'giant-th' : 'display-en'}
                  style={{
                    marginTop: 18,
                    fontSize:
                      lang === 'th' ? 'clamp(48px, 7.5vw, 116px)' : 'clamp(56px, 9vw, 144px)',
                    lineHeight: lang === 'th' ? 1.02 : 0.88,
                  }}
                >
                  {lang === 'th' ? (
                    <>
                      บันทึก
                      <br />
                      นอกห้อง<span style={{ color: 'var(--teal)' }}>.</span>
                    </>
                  ) : (
                    <>
                      Notes from
                      <br />
                      outside the room<span style={{ color: 'var(--teal)' }}>.</span>
                    </>
                  )}
                </h1>
              </Reveal>
            </div>
            <Reveal
              delay={200}
              style={{ flex: '0 1 380px', display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: 'var(--ink-soft)',
                }}
              >
                <T
                  th="รวมบทความ บันทึกภาคสนาม บทสนทนา และวิธีทำ ทุกเรื่องเขียนโดยทีม soulsilent หลังจากเวิร์กชอปจบไปแล้ว"
                  en="Articles, field notes, conversations, and how-tos — every piece written by the soulsilent team after a workshop ends."
                />
              </p>
              <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
                <StatBlock value={String(articles.length).padStart(2, '0')} label={lang === 'th' ? 'บทความ' : 'articles'} />
                <StatBlock
                  value={String(categories.length).padStart(2, '0')}
                  label={lang === 'th' ? 'หมวด' : 'categories'}
                  color="var(--teal)"
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Filter bar — sticky */}
      <div
        style={{
          position: 'sticky',
          top: 64,
          zIndex: 30,
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
          backdropFilter: 'saturate(160%) blur(12px)',
          WebkitBackdropFilter: 'saturate(160%) blur(12px)',
          padding: '18px 0',
          marginBottom: 32,
        }}
      >
        <div
          className="container"
          style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {filterPills.map((c) => {
              const on = c.key === active;
              return (
                <button
                  key={c.key}
                  onClick={() => setActive(c.key)}
                  style={{
                    border: 0,
                    cursor: 'pointer',
                    padding: '9px 16px',
                    borderRadius: 999,
                    background: on ? 'var(--ink)' : 'var(--cream)',
                    color: on ? '#fff' : 'var(--ink)',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    transition: 'background .18s ease, color .18s ease',
                  }}
                >
                  {lang === 'th' ? c.th : c.en}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 240 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === 'th' ? 'ค้นหาบทความ…' : 'Search articles…'}
                className="field"
                style={{ padding: '10px 14px 10px 38px', borderRadius: 999, fontSize: 13.5 }}
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="2"
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </div>
            <span
              className="mono"
              style={{
                fontSize: 11.5,
                color: 'var(--muted)',
                letterSpacing: '.08em',
                whiteSpace: 'nowrap',
              }}
            >
              {String(filtered.length).padStart(2, '0')} {lang === 'th' ? 'รายการ' : 'results'}
            </span>
          </div>
        </div>
      </div>

      {/* List */}
      <section style={{ paddingBottom: 96 }}>
        <div className="container">
          {loading ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
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
          ) : filtered.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <div className="display-th" style={{ fontSize: 28, marginBottom: 10 }}>
                <T th="ยังไม่มีบทความในหมวดนี้" en="No articles in this category yet" />
              </div>
              <div style={{ color: 'var(--muted)' }}>
                <T th="ลองเปลี่ยนหมวดหรือล้างคำค้น" en="Try a different category or clear the search." />
              </div>
            </div>
          ) : (
            <>
              {lead && (
                <Reveal style={{ marginBottom: 40 }}>
                  <ArticleCard a={lead} variant="lead" lang={lang} categories={categories} />
                </Reveal>
              )}
              {rest.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                    gap: 28,
                  }}
                >
                  {rest.map((a, i) => (
                    <Reveal key={a.id} delay={i * 60}>
                      <ArticleCard a={a} lang={lang} categories={categories} />
                    </Reveal>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Newsletter */}
      <section style={{ background: 'var(--cream)', padding: '72px 0' }}>
        <div className="container">
          <div
            style={{
              display: 'flex',
              gap: 48,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: '1 1 420px' }}>
              <span className="eyebrow">
                <T th="จดหมายข่าว" en="newsletter" />
              </span>
              <h2
                className="display-th"
                style={{
                  fontSize: 'clamp(28px, 3.4vw, 42px)',
                  margin: '14px 0 8px',
                  lineHeight: 1.15,
                }}
              >
                <T
                  th="รับบทความใหม่ทุกวันศุกร์เช้า"
                  en="New articles every Friday morning"
                />
              </h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 15.5, lineHeight: 1.65 }}>
                <T
                  th="หนึ่งฉบับต่อสัปดาห์ ไม่มีโฆษณา ยกเลิกเมื่อไรก็ได้"
                  en="One issue a week. No ads. Unsubscribe whenever."
                />
              </p>
            </div>
            <form
              onSubmit={(e) => e.preventDefault()}
              style={{ flex: '1 1 360px', display: 'flex', gap: 10, maxWidth: 480 }}
            >
              <input
                className="field"
                type="email"
                placeholder={lang === 'th' ? 'อีเมลของคุณ' : 'your email'}
                style={{ background: '#fff', flex: 1 }}
              />
              <Btn kind="ink" type="submit">
                <T th="สมัคร" en="Subscribe" />
              </Btn>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

function StatBlock({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div className="display-en" style={{ fontSize: 52, color: color || 'var(--ink)' }}>
        {value}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ArticleCard({
  a,
  variant = 'default',
  lang,
  categories,
}: {
  a: Article;
  variant?: 'default' | 'lead';
  lang: 'th' | 'en';
  categories?: ArticleCategory[];
}) {
  const cat = categoryLabel(a.category, lang, categories);
  const date = formatArticleDate(a.date, lang);
  const href = `/articles/${a.slug}`;
  const phCls = swatchClass(a.cover_swatch);

  if (variant === 'lead') {
    return (
      <Link
        href={href}
        className="card"
        style={{
          display: 'block',
          textDecoration: 'none',
          color: 'inherit',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 0 }} className="art-lead-grid">
          <div
            className={`ph ${phCls}`}
            style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden' }}
          >
            {a.cover_image_url && (
              <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <div
            style={{
              padding: '40px 36px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="tag tag-ink">{cat}</span>
              <span
                className="mono"
                style={{ fontSize: 11.5, color: 'var(--muted)', letterSpacing: '.06em' }}
              >
                {date}
              </span>
            </div>
            <h2
              className="display-th"
              style={{ margin: 0, fontSize: 'clamp(26px, 2.8vw, 38px)', lineHeight: 1.15 }}
            >
              {a.title}
            </h2>
            <p
              style={{
                margin: 0,
                color: 'var(--muted)',
                fontSize: 16,
                lineHeight: 1.65,
              }}
            >
              {a.excerpt}
            </p>
            <span
              style={{
                color: 'var(--teal)',
                fontWeight: 600,
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {lang === 'th' ? 'อ่านบทความเต็ม' : 'Read full article'} →
            </span>
          </div>
        </div>
        <style jsx>{`
          @media (max-width: 760px) {
            .art-lead-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        color: 'inherit',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <div
        className={`ph ${phCls} card-media`}
        style={{ aspectRatio: '16/10', position: 'relative', overflow: 'hidden' }}
      >
        {a.cover_image_url && (
          <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      <div
        style={{
          padding: '22px 22px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tag">{cat}</span>
          <span
            className="mono"
            style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em' }}
          >
            {date}
          </span>
        </div>
        <h3
          className="display-th"
          style={{ margin: 0, fontSize: 21, lineHeight: 1.22 }}
        >
          {a.title}
        </h3>
        <p
          style={{
            margin: 0,
            color: 'var(--muted)',
            fontSize: 14.5,
            lineHeight: 1.6,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {a.excerpt}
        </p>
        <span
          style={{
            marginTop: 'auto',
            color: 'var(--teal)',
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {lang === 'th' ? 'อ่าน' : 'Read'} →
        </span>
      </div>
    </Link>
  );
}
