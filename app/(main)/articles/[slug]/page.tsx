'use client';

import { ASPECTS } from '@/lib/image-aspects';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Article, ArticleBlock, ArticleCategory } from '@/lib/types';
import { categoryLabel, formatArticleDate, parseBody, parseTags } from '@/lib/article-utils';
import { useLang, T } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { ShareButton } from '@/components/design/ShareButton';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { cardPos } from '@/lib/article-card';
import { visibilityOf } from '@/lib/article-visibility';

type ArticleWithAuthor = Article & { author_name?: string | null; author_email?: string | null };

const swatchClass = (s?: string) =>
  s === 'cream' ? 'ph-cream' : s === 'ink' ? 'ph-ink' : s === 'accent' ? 'ph-accent' : 'ph-teal';

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const [article, setArticle] = useState<ArticleWithAuthor | null>(null);
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const track = useLoadingTracker();

  useEffect(() => {
    track(
      Promise.all([
        fetch(`/api/articles/${slug}`).then((r) => {
          if (r.status === 404) return null;
          return r.json() as Promise<{ article: ArticleWithAuthor }>;
        }),
        fetch('/api/articles').then((r) => r.json() as Promise<{ articles: Article[] }>),
        fetch('/api/article-categories').then(
          (r) => r.json() as Promise<{ categories: ArticleCategory[] }>
        ),
      ])
        .then(([detail, list, cats]) => {
          if (!detail || !detail.article) {
            setNotFound(true);
          } else {
            setArticle(detail.article);
          }
          setAllArticles(list.articles || []);
          setCategories(cats.categories || []);
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false)),
    );
    window.scrollTo(0, 0);
  }, [slug, track]);

  // Prev/next chronologically (newest = first in list)
  const { prev, next } = useMemo(() => {
    if (!article) return { prev: null, next: null };
    const idx = allArticles.findIndex((a) => a.id === article.id);
    return {
      next: idx > 0 ? allArticles[idx - 1] : null,
      prev: idx >= 0 && idx < allArticles.length - 1 ? allArticles[idx + 1] : null,
    };
  }, [article, allArticles]);

  // Related by category + tag overlap
  const related = useMemo(() => {
    if (!article) return [];
    const curTags = new Set(parseTags(article));
    return allArticles
      .filter((a) => a.id !== article.id)
      .map((a) => {
        const sameCat = a.category === article.category ? 1 : 0;
        const tagOverlap = parseTags(a).filter((t) => curTags.has(t)).length;
        return { a, score: sameCat * 3 + tagOverlap };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map((x) => x.a);
  }, [article, allArticles]);

  // Nothing to draw while the page's requests are open — the loading screen is
  // over it already (components/design/DataLoading.tsx).
  if (loading) return null;

  if (notFound || !article) {
    return (
      <div style={{ padding: '120px 0', textAlign: 'center' }}>
        <p className="display-th" style={{ fontSize: 24, marginBottom: 12 }}>
          <T th="ไม่พบบทความนี้" en="Article not found" />
        </p>
        <Link href="/articles" className="btn btn-teal">
          <T th="กลับไปหน้ารวมบทความ" en="Back to articles" />
        </Link>
      </div>
    );
  }

  const cat = categoryLabel(article.category, lang, categories);
  const date = formatArticleDate(article.date, lang);
  const body = parseBody(article);
  const tags = parseTags(article);

  return (
    <article>
      {/* Hero */}
      <header>
        {/* Cover first, edge to edge and low — a band across the top of the
            page (ASPECTS.ARTICLE_HERO, 3:1) rather than a tall framed picture. */}
        {/* No reveal animation: it sits above the fold, and a zoom that never
            fires leaves it at 95% with gaps at the edges. */}
        <div
            className={`ph ${swatchClass(article.cover_swatch)}`}
            style={{
              width: '100%',
              aspectRatio: String(ASPECTS.ARTICLE_HERO.ratio),
              maxHeight: 460,
              minHeight: 180,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {article.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={article.cover_image_url} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
          </div>
        <div className="container" style={{ maxWidth: 960, paddingTop: 40 }}>
          <Reveal>
            <Link
              href="/articles"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--muted)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 24,
                fontFamily: 'JetBrains Mono,IBM Plex Sans Thai, monospace',
                letterSpacing: '.04em',
              }}
            >
              ← <T th="กลับไปหน้ารวมบทความ" en="Back to all articles" />
            </Link>
          </Reveal>

          {visibilityOf(article.published) !== 'public' && (
            <>
              {/* Not listed anywhere, so keep search engines out too. */}
              <meta name="robots" content="noindex" />
              <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 12, background: '#fff8e1', borderLeft: '4px solid var(--accent)', fontSize: 13.5, color: 'var(--ink)' }}>
                {visibilityOf(article.published) === 'private' ? (
                  <T th="ส่วนตัว — บทความนี้เห็นเฉพาะผู้ดูแล" en="Private — only admins can see this article" />
                ) : (
                  <T th="ไม่เป็นสาธารณะ — เปิดได้เฉพาะคนที่มีลิงก์ และไม่ขึ้นในหน้าเว็บ" en="Unlisted — only people with the link can open it; it is not listed on the site" />
                )}
              </div>
            </>
          )}

          <Reveal delay={80}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 22,
                flexWrap: 'wrap',
              }}
            >
              <span className="tag tag-ink">{cat}</span>
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '.08em' }}
              >
                {date}
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <ShareButton title={article.title} text={article.excerpt || undefined} />
              </span>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <h1
              className="display-th"
              style={{
                margin: '0 0 28px',
                fontSize: 'clamp(32px, 5.4vw, 64px)',
                lineHeight: 1.08,
                letterSpacing: '-.012em',
              }}
            >
              {article.title}
            </h1>
          </Reveal>

          {article.excerpt && (
            <Reveal delay={200}>
              <p
                style={{
                  margin: '0 0 40px',
                  fontSize: 'clamp(17px, 1.6vw, 21px)',
                  lineHeight: 1.6,
                  color: 'var(--ink-soft)',
                  maxWidth: 720,
                }}
              >
                {article.excerpt}
              </p>
            </Reveal>
          )}

          {article.author_name && (
            <Reveal delay={260}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 36 }}>
                <AuthorAvatar name={article.author_name} size={36} />
                <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                  <span style={{ fontWeight: 600 }}>{article.author_name}</span>
                </div>
              </div>
            </Reveal>
          )}
        </div>

      </header>

      {/* Body */}
      <ArticleBodyView blocks={body} />

      {/* Tags */}
      {tags.length > 0 && (
        <div className="container" style={{ maxWidth: 680, padding: '24px 32px 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((t) => (
              <Link
                key={t}
                href={`/articles?q=${encodeURIComponent(t)}`}
                className="tag"
                style={{
                  background: 'var(--cream)',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  padding: '7px 14px',
                }}
              >
                #{t}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Prev/Next */}
      <PrevNext prev={prev} next={next} lang={lang} />

      {/* Related */}
      {related.length > 0 && <Related articles={related} lang={lang} categories={categories} />}
    </article>
  );
}

function ArticleBodyView({ blocks }: { blocks: ArticleBlock[] }) {
  if (blocks.length === 0) {
    return (
      <div className="container" style={{ maxWidth: 680 }}>
        <p style={{ color: 'var(--muted)', fontSize: 16, lineHeight: 1.7 }}>
          <T th="เนื้อหาบทความกำลังจัดเตรียม" en="Content is being prepared." />
        </p>
      </div>
    );
  }
  return (
    <div className="prose">
      <div className="container" style={{ maxWidth: 680 }}>
        {blocks.map((b, i) => {
          if (b.kind === 'h2') {
            return (
              <h2
                key={i}
                className="display-th"
                style={{
                  fontSize: 'clamp(24px,3vw,32px)',
                  margin: '48px 0 18px',
                  lineHeight: 1.2,
                  whiteSpace: 'pre-line',
                }}
              >
                {b.text}
              </h2>
            );
          }
          if (b.kind === 'h3') {
            return (
              <h3
                key={i}
                className="display-th"
                style={{ fontSize: 20, margin: '32px 0 12px', whiteSpace: 'pre-line' }}
              >
                {b.text}
              </h3>
            );
          }
          if (b.kind === 'p') {
            return (
              <p
                key={i}
                style={{
                  fontSize: 17,
                  lineHeight: 1.85,
                  color: 'var(--ink)',
                  margin: '0 0 22px',
                  // Keep the spaces and line breaks the writer typed in admin.
                  whiteSpace: 'pre-wrap',
                }}
              >
                {b.text}
              </p>
            );
          }
          if (b.kind === 'quote') {
            return (
              <blockquote
                key={i}
                style={{
                  margin: '40px 0',
                  padding: '24px 32px',
                  borderLeft: '3px solid var(--teal)',
                  background: 'var(--cream)',
                  borderRadius: '0 12px 12px 0',
                  position: 'relative',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'Mitr, sans-serif',
                    fontSize: 'clamp(18px,2vw,22px)',
                    lineHeight: 1.5,
                    color: 'var(--ink)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  &ldquo;{b.text}&rdquo;
                </p>
                {b.by && (
                  <cite
                    style={{
                      display: 'block',
                      marginTop: 12,
                      fontStyle: 'normal',
                      fontSize: 13.5,
                      color: 'var(--muted)',
                      fontFamily: 'JetBrains Mono,IBM Plex Sans Thai, monospace',
                    }}
                  >
                    — {b.by}
                  </cite>
                )}
              </blockquote>
            );
          }
          if (b.kind === 'caption') {
            return (
              <p
                key={i}
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--muted)',
                  fontStyle: 'italic',
                  margin: '0 0 32px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {b.text}
              </p>
            );
          }
          if (b.kind === 'image') {
            return (
              <figure key={i} style={{ margin: '32px 0' }}>
                <div
                  className={`ph ${swatchClass(b.swatch)}`}
                  style={{
                    aspectRatio: b.aspect || '16/9',
                    borderRadius: 18,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {b.url && (
                    <img
                      src={b.url}
                      alt={b.hint || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                </div>
              </figure>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function AuthorAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--teal-100)',
        color: 'var(--teal-deep)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Archivo Black,Mitr, sans-serif',
        fontSize: size * 0.36,
        flexShrink: 0,
      }}
    >
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

function PrevNext({ prev, next, lang }: { prev: Article | null; next: Article | null; lang: 'th' | 'en' }) {
  const Cell = ({ a, side }: { a: Article | null; side: 'prev' | 'next' }) => {
    if (!a) {
      return (
        <div
          style={{
            padding: '36px 32px',
            background: 'var(--cream)',
            color: 'var(--muted)',
            fontSize: 13,
            fontFamily: 'JetBrains Mono,IBM Plex Sans Thai, monospace',
            letterSpacing: '.08em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: side === 'prev' ? 'flex-start' : 'flex-end',
          }}
        >
          {lang === 'th' ? '— ไม่มีบทความ' : '— end of archive'}
        </div>
      );
    }
    return (
      <Link
        href={`/articles/${a.slug}`}
        style={{
          padding: '36px 32px',
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
          background: side === 'prev' ? 'var(--cream)' : 'var(--ink)',
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: side === 'prev' ? 'var(--teal)' : 'var(--accent)',
            marginBottom: 14,
            display: 'flex',
            justifyContent: side === 'prev' ? 'flex-start' : 'flex-end',
            gap: 8,
          }}
        >
          {side === 'prev'
            ? `← ${lang === 'th' ? 'บทความก่อนหน้า' : 'Previous'}`
            : `${lang === 'th' ? 'บทความถัดไป' : 'Next'} →`}
        </div>
        <div
          className="display-th"
          style={{
            fontSize: 'clamp(18px,2vw,22px)',
            lineHeight: 1.25,
            color: side === 'prev' ? 'var(--ink)' : '#fff',
            textAlign: side === 'prev' ? 'left' : 'right',
          }}
        >
          {a.title}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: side === 'prev' ? 'var(--muted)' : 'rgba(255,255,255,.6)',
            marginTop: 10,
            textAlign: side === 'prev' ? 'left' : 'right',
            letterSpacing: '.06em',
          }}
        >
          {formatArticleDate(a.date, lang)}
        </div>
      </Link>
    );
  };

  return (
    <section style={{ marginTop: 80 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }} className="prev-next-grid">
        <Cell a={prev} side="prev" />
        <Cell a={next} side="next" />
      </div>
      <style jsx>{`
        @media (max-width: 640px) {
          .prev-next-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}

function Related({
  articles,
  lang,
  categories,
}: {
  articles: Article[];
  lang: 'th' | 'en';
  categories?: ArticleCategory[];
}) {
  return (
    <section className="section" style={{ paddingTop: 96 }}>
      <div className="container">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap',
            marginBottom: 32,
          }}
        >
          <div>
            <span className="eyebrow">
              <T th="อ่านต่อ" en="keep reading" />
            </span>
            <h2
              className="display-th"
              style={{
                fontSize: 'clamp(28px, 3.4vw, 42px)',
                margin: '14px 0 0',
                lineHeight: 1.1,
              }}
            >
              <T th="บทความที่เกี่ยวข้อง" en="Related articles" />
            </h2>
          </div>
          <Link
            href="/articles"
            style={{
              background: 'var(--cream)',
              padding: '10px 18px',
              borderRadius: 999,
              color: 'var(--ink)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <T th="ดูทั้งหมด" en="View all" /> →
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/articles/${a.slug}`}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                textDecoration: 'none',
                color: 'inherit',
                overflow: 'hidden',
              }}
            >
              <div
                className={`ph ${swatchClass(a.cover_swatch)}`}
                style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden' }}
              >
                {a.cover_image_url && (
                  <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: cardPos(a) }} />
                )}
              </div>
              <div
                style={{
                  padding: '20px 22px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  flex: 1,
                }}
              >
                <div
                  style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <span className="tag">{categoryLabel(a.category, lang, categories)}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {formatArticleDate(a.date, lang)}
                  </span>
                </div>
                <h3
                  className="display-th"
                  style={{ margin: 0, fontSize: 19, lineHeight: 1.22 }}
                >
                  {a.title}
                </h3>
                <span
                  style={{
                    marginTop: 'auto',
                    color: 'var(--teal)',
                    fontWeight: 600,
                    fontSize: 13.5,
                  }}
                >
                  <T th="อ่านต่อ" en="Read more" /> →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
