import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/db';
import { SITE_ORIGIN } from '@/lib/seo';

// Read per request: the same build serves production and the preview Worker,
// and only production may be indexed.
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const env = await getEnv();
  if ((env.SITE_URL || '').replace(/\/$/, '') !== SITE_ORIGIN) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Accounts, tools and one-off links: nothing a search result should open.
      disallow: ['/api/', '/admin', '/host', '/me', '/auth', '/pay', '/invite', '/claim', '/survey', '/portfolio'],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
