import type { Metadata } from 'next';
import { getDB } from '@/lib/db';
import { roleSql } from '@/lib/roles';
import { absoluteUrl, metaText, SITE_NAME } from '@/lib/seo';

/* Search and share data for one host's page (the page is a client component). */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  let host: { id: string; name: string; bio: string | null; avatar_url: string | null } | null = null;
  try {
    const db = await getDB();
    host = await db
      .prepare(
        `SELECT u.id, COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS name, u.bio, u.avatar_url
           FROM users u WHERE u.id = ? AND ${roleSql('u', 'teacher')}`
      )
      .bind(id)
      .first();
  } catch {
    host = null;
  }
  if (!host) return { title: 'ผู้จัด', robots: { index: false } };
  const title = `${host.name} · ผู้จัด`;
  const description = metaText(host.bio) || `กิจกรรมและผลงานของ ${host.name} บน ${SITE_NAME}`;
  const images = host.avatar_url ? [{ url: absoluteUrl(host.avatar_url), alt: host.name }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/hosts/${host.id}` },
    openGraph: { type: 'profile', title, description, url: `/hosts/${host.id}`, images },
  };
}

export default function HostProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
