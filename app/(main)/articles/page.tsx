'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Article, ArticleCategory } from '@/lib/types';
import { DEFAULT_CATEGORIES, categoryLabel, formatArticleDate, parseTags } from '@/lib/article-utils';
import { useLang } from '@/lib/i18n';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { cardPos } from '@/lib/article-card';

/* ============================================================
   Articles / Journal — port of Design Composer "Articles.dc.html".
   Navbar stays as-is (SiteHeader from app/(main)/layout.tsx). Live D1
   data via /api/articles + /api/article-categories, Thai-only.
   ============================================================ */

/** Featured articles the lead card cycles through with its arrows. */
const LEAD_MAX = 3;
/** Grid cards per page; the page numbers below swap the cards in place. */
const PAGE_SIZE = 6;

const swatchClass = (s: string) =>
  s === 'cream' ? 'ph-cream' : s === 'ink' ? 'ph-ink' : s === 'accent' ? 'ph-accent' : 'ph-teal';

export default function ArticlesPage() {
  const { lang } = useLang();
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');
  // Both reset whenever the filter or search changes: each remembers the
  // filter it was set under and falls back to 0 for any other.
  const [leadAt, setLeadAt] = useState({ key: '', i: 0 });
  const [pageAt, setPageAt] = useState({ key: '', n: 0 });
  const gridTop = useRef<HTMLDivElement>(null);

  const track = useLoadingTracker();

  useEffect(() => {
    track(
      Promise.all([
        fetch('/api/articles').then((r) => r.json() as Promise<{ articles: Article[] }>),
        fetch('/api/article-categories').then((r) => r.json() as Promise<{ categories: ArticleCategory[] }>),
      ])
        .then(([a, c]) => {
          setArticles(a.articles || []);
          setCategories(c.categories || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    );
  }, [track]);

  const filterPills = categories.length > 0 ? [{ key: 'all', th: 'ทั้งหมด', en: 'All' }, ...categories] : DEFAULT_CATEGORIES;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (active !== 'all' && a.category !== active) return false;
      if (!q) return true;
      const blob = [a.title, a.excerpt || '', parseTags(a).join(' ')].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [articles, active, query]);

  // Up to three articles take turns in the lead card — featured ones first,
  // then the newest — and the grid below holds everything else.
  const filterKey = active + '|' + query.trim().toLowerCase();
  const leads = useMemo(() => [...filtered.filter((a) => a.featured), ...filtered.filter((a) => !a.featured)].slice(0, LEAD_MAX), [filtered]);
  const leadIdx = leadAt.key === filterKey ? Math.min(leadAt.i, Math.max(0, leads.length - 1)) : 0;
  const lead = leads[leadIdx];
  const rest = filtered.filter((a) => !leads.some((l) => l.id === a.id));
  const pages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const page = pageAt.key === filterKey ? Math.min(pageAt.n, pages - 1) : 0;
  const shown = rest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const stepLead = (d: number) => setLeadAt({ key: filterKey, i: (leadIdx + d + leads.length) % leads.length });
  const goPage = (n: number) => {
    setPageAt({ key: filterKey, n });
    gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="container art-hero" style={{ paddingTop: 52, paddingBottom: 36 }}>
        <div>
          <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 14 }}>— หน้าแรก · JOURNAL</div>
          <h1 className="display-th" style={{ fontSize: 'clamp(36px,5.8vw,64px)', margin: 0, color: 'var(--ink)', lineHeight: 1.2 }}>
            พื้นที่ของความทรงจำ<br /><span style={{ color: 'var(--teal)' }}>บทความ</span> ข่าวสาร
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)' }}>
            บันทึกจากเรื่องราว มุมมอง และประสบการณ์จากทีม Soul Silent<br />เปิดมาอ่านเล่นตอนว่างในวันหยุด หรือก่อนเข้านอน
          </p>
          <div style={{ display: 'flex', gap: 28, justifyContent: 'flex-end' }}>
            <div>
              <div style={{ fontFamily: 'Archivo Black, Mitr', fontSize: 30, color: 'var(--ink)' }}>{String(articles.length).padStart(2, '0')}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.1em' }}>บทความ</div>
            </div>
            <div>
              <div style={{ fontFamily: 'Archivo Black, Mitr', fontSize: 30, color: 'var(--teal)' }}>{String(categories.length).padStart(2, '0')}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.1em' }}>หมวด</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Filter bar ---- */}
      <section className="bg-cream" style={{ padding: '22px 0 28px' }}>
        <div className="container" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filterPills.map((c) => {
              const on = active === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setActive(c.key)}
                  className="filter-pill"
                  style={{ fontFamily: 'inherit', cursor: 'pointer', border: 0, borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, background: on ? 'var(--ink)' : 'var(--paper)', color: on ? '#fff' : 'var(--ink)', transition: 'background .2s ease, color .2s ease' }}
                >
                  {c.th}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper)', borderRadius: 999, padding: '9px 16px', minWidth: 200 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาบทความ…" style={{ border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--ink)', width: '100%' }} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{String(filtered.length).padStart(2, '0')} รายการ</span>
          </div>
        </div>
      </section>

      {/* ---- Featured + grid ---- */}
      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              {/* No spinner: the loading screen is over the page until this page's own requests land — see components/design/DataLoading.tsx. */}
            </div>
          ) : !lead ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--muted)' }}>ไม่พบบทความที่ตรงกับตัวกรอง</div>
          ) : (
            <>
              {/* Featured (lead) — arrows step through up to three articles */}
              <div className="art-lead-wrap">
              <Link key={lead.id} href={`/articles/${lead.slug}`} className="art-featured card art-lead-fade" style={{ padding: 0, color: 'var(--ink)', textDecoration: 'none' }}>
                <div className={`ph ${swatchClass(lead.cover_swatch)}`} style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden' }}>
                  {lead.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lead.cover_image_url} alt={lead.title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: cardPos(lead) }} />
                  ) : (
                    <span className="mono" style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 9, letterSpacing: '.1em', opacity: 0.5 }}>COVER · 16:11</span>
                  )}
                </div>
                <div style={{ padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span className="tag tag-ink">{categoryLabel(lead.category, lang, categories)}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatArticleDate(lead.date, lang)}</span>
                  </div>
                  <h2 className="display-th u-clamp-2" style={{ fontSize: 28, margin: '0 0 16px', lineHeight: 1.15 }}>{lead.title}</h2>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--teal)' }}>อ่านบทความเต็ม <span className="mono">→</span></span>
                </div>
              </Link>
              {leads.length > 1 && (
                <>
                  <button type="button" className="art-lead-arrow prev" aria-label="บทความก่อนหน้า" onClick={() => stepLead(-1)}>
                    ←
                  </button>
                  <button type="button" className="art-lead-arrow next" aria-label="บทความถัดไป" onClick={() => stepLead(1)}>
                    →
                  </button>
                  <div className="art-lead-dots">
                    {leads.map((l, i) => (
                      <button key={l.id} type="button" aria-label={`บทความเด่น ${i + 1}`} aria-current={i === leadIdx} className={i === leadIdx ? 'on' : ''} onClick={() => setLeadAt({ key: filterKey, i })} />
                    ))}
                  </div>
                </>
              )}
              </div>

              {/* Grid (rest) — paged in place, the URL never changes */}
              <div ref={gridTop} style={{ scrollMarginTop: 90 }} />
              {shown.length > 0 && (
                <div className="art-grid" key={page}>
                  {shown.map((a) => {
                    const dark = a.cover_swatch === 'ink';
                    return (
                      <Link key={a.id} href={`/articles/${a.slug}`} className="card" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', color: dark ? '#fff' : 'var(--ink)', background: dark ? 'var(--ink)' : undefined }}>
                        <div className={`ph ${swatchClass(a.cover_swatch)}`} style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden' }}>
                          {a.cover_image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: cardPos(a) }} />
                          )}
                        </div>
                        <div style={{ padding: 20 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="tag" style={dark ? { background: 'rgba(255,255,255,.16)', color: '#fff' } : undefined}>{categoryLabel(a.category, lang, categories)}</span>
                            <span className="mono" style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,.55)' : 'var(--muted)' }}>{formatArticleDate(a.date, lang)}</span>
                          </div>
                          <h3 className="display-th u-clamp-2" style={{ fontSize: 17, margin: '0 0 10px', lineHeight: 1.3, color: dark ? '#fff' : undefined }}>{a.title}</h3>
                          {dark && a.excerpt && <p className="u-clamp-2" style={{ fontSize: 12.5, color: 'rgba(255,255,255,.65)', margin: '0 0 10px', lineHeight: 1.5 }}>{a.excerpt}</p>}
                          <span style={{ fontWeight: 700, fontSize: 13, color: dark ? 'var(--accent)' : 'var(--teal)' }}>อ่าน <span className="mono">→</span></span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
              {pages > 1 && (
                <nav className="art-pager" aria-label="หน้าบทความ">
                  {Array.from({ length: pages }, (_, n) => (
                    <button key={n} type="button" className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => goPage(n)}>
                      {n + 1}
                    </button>
                  ))}
                </nav>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
