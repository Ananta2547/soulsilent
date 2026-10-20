import type { MetadataRoute } from 'next';
import { getDB } from '@/lib/db';
import { roleSql } from '@/lib/roles';
import { SITE_ORIGIN } from '@/lib/seo';
import { PUBLIC_STATUSES } from '@/lib/workshop-public';

// Built from the live database on each request.
export const dynamic = 'force-dynamic';

/** D1 "YYYY-MM-DD HH:MM:SS" (UTC) → Date; undefined when missing/invalid. */
function when(sqlTime: string | null | undefined): Date | undefined {
  if (!sqlTime) return undefined;
  const d = new Date(sqlTime.replace(' ', 'T') + (sqlTime.includes('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_ORIGIN}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_ORIGIN}/journeys`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_ORIGIN}/calendar`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_ORIGIN}/articles`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_ORIGIN}/hosts`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_ORIGIN}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_ORIGIN}/help`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_ORIGIN}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_ORIGIN}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  try {
    const db = await getDB();
    const statuses = PUBLIC_STATUSES.map((s) => `'${s}'`).join(', ');
    const [journeys, articles, hosts, portfolios] = await db.batch([
      db.prepare(`SELECT id, updated_at FROM workshops WHERE status IN (${statuses}) ORDER BY date DESC`),
      db.prepare('SELECT slug, updated_at FROM articles WHERE published = 1'),
      db.prepare(`SELECT u.id, u.updated_at FROM users u WHERE ${roleSql('u', 'teacher')} AND COALESCE(u.account_status, 'active') = 'active'`),
      db.prepare('SELECT id, updated_at FROM portfolios WHERE published = 1'),
    ]);
    for (const r of (journeys.results || []) as { id: string; updated_at: string }[]) {
      pages.push({ url: `${SITE_ORIGIN}/journeys/${r.id}`, lastModified: when(r.updated_at), changeFrequency: 'weekly', priority: 0.8 });
    }
    for (const r of (articles.results || []) as { slug: string; updated_at: string }[]) {
      pages.push({ url: `${SITE_ORIGIN}/articles/${encodeURIComponent(r.slug)}`, lastModified: when(r.updated_at), changeFrequency: 'monthly', priority: 0.6 });
    }
    for (const r of (hosts.results || []) as { id: string; updated_at: string }[]) {
      pages.push({ url: `${SITE_ORIGIN}/hosts/${r.id}`, lastModified: when(r.updated_at), changeFrequency: 'monthly', priority: 0.5 });
    }
    for (const r of (portfolios.results || []) as { id: string; updated_at: string }[]) {
      pages.push({ url: `${SITE_ORIGIN}/p/${r.id}`, lastModified: when(r.updated_at), changeFrequency: 'monthly', priority: 0.4 });
    }
  } catch (error) {
    // The static pages are still worth listing when the database is down.
    console.error('Sitemap error:', error);
  }
  return pages;
}
