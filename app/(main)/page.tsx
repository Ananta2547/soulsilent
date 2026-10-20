import type { Metadata } from 'next';
import { loadHomeBundle } from '@/lib/home-bundle';
import { HomeClient } from './HomeClient';

// Read on every request: the first HTML must show today's journeys, reviews
// and numbers, not a copy cached at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

/** The bundle plus when it was read (the client learns the server clock from
 *  it). Null when the read fails; the client then fetches /api/home itself. */
async function loadInitial() {
  try {
    return { ...(await loadHomeBundle()), at: Date.now() };
  } catch (error) {
    console.error('Home page data error:', error);
    return null;
  }
}

export default async function HomePage() {
  return <HomeClient initial={await loadInitial()} />;
}
