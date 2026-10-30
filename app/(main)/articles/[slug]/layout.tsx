import type { Metadata } from 'next';
import { cache } from 'react';
import { getDB } from '@/lib/db';
import Script from 'next/script';
import { absoluteUrl, metaText, SITE_NAME } from '@/lib/seo';
import { ADSENSE_CLIENT } from '@/lib/adsense';

/* Search and share data for one article (the page is a client component). */

type Row = { slug: string; title: string; excerpt: string | null; cover_image_url: string | null; date: string | null; updated_at: string | null };

const loadArticle = cache(async (slug: string): Promise<Row | null> => {
  try {
    const db = await getDB();
    return await db
      .prepare('SELECT slug, title, excerpt, cover_image_url, date, updated_at FROM articles WHERE slug = ? AND published = 1')
      .bind(slug)
      .first<Row>();
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadArticle(decodeURIComponent(slug));
  if (!a) return { title: 'บทความ', robots: { index: false } };
  const description = metaText(a.excerpt) || `${a.title} บน ${SITE_NAME}`;
  const path = `/articles/${encodeURIComponent(a.slug)}`;
  const images = a.cover_image_url ? [{ url: absoluteUrl(a.cover_image_url), alt: a.title }] : undefined;
  return {
    title: a.title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'article', title: a.title, description, url: path, images, publishedTime: a.date || undefined },
    twitter: { card: 'summary_large_image', title: a.title, description, images: images?.map((i) => i.url) },
  };
}

export default async function ArticleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await loadArticle(decodeURIComponent(slug));
  const ld = a && {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: metaText(a.excerpt, 300) || undefined,
    image: a.cover_image_url ? [absoluteUrl(a.cover_image_url)] : undefined,
    datePublished: a.date || undefined,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
    mainEntityOfPage: absoluteUrl(`/articles/${encodeURIComponent(a.slug)}`),
  };
  return (
    <>
      {ld && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      )}
      {/* Google AdSense, on published articles only (a draft opened by share link has no row here). */}
      {a && <Script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} crossOrigin="anonymous" strategy="afterInteractive" />}
      {children}
    </>
  );
}
