'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttribution, visitorId } from '@/lib/attribution';

const JOURNEY = /^\/journeys\/([\w-]+)\/?$/;

function send(body: Record<string, unknown>) {
  const vid = visitorId();
  if (!vid) return;
  const payload = JSON.stringify({ vid, ...body });
  try {
    if (navigator.sendBeacon?.('/api/track', new Blob([payload], { type: 'application/json' }))) return;
  } catch {}
  fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
}

/**
 * The quiet counters behind the Host Dashboard (migration 071):
 * - where this visit came from (?ref / utm / outside referrer) — lib/attribution
 * - one view per activity page per visitor per day
 * - activity cards that were actually on screen in a listing (half visible
 *   for a second), each counted once per page
 * Mounted once in the (main) layout; renders nothing.
 */
export function Tracker() {
  const pathname = usePathname();

  // Landing source + the page view, on every route change.
  useEffect(() => {
    const url = new URL(window.location.href);
    captureAttribution(url, document.referrer);
    const ref = url.searchParams.get('ref');
    const m = pathname.match(JOURNEY);
    if (m || ref) send({ view: m?.[1], ref: ref || undefined });
  }, [pathname]);

  // Cards linking to an activity, seen in a listing.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const own = pathname.match(JOURNEY)?.[1];
    const counted = new Set<string>();
    const pending = new Set<string>();
    const timers = new Map<Element, number>();
    let flushTimer = 0;
    const flush = () => {
      flushTimer = 0;
      if (!pending.size) return;
      send({ impressions: [...pending] });
      pending.clear();
    };
    const idOf = (el: Element) => (el.getAttribute('href') || '').split('?')[0].match(JOURNEY)?.[1];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = idOf(e.target);
          if (!id || id === own || counted.has(id)) continue;
          if (e.isIntersecting) {
            timers.set(
              e.target,
              window.setTimeout(() => {
                counted.add(id);
                pending.add(id);
                if (!flushTimer) flushTimer = window.setTimeout(flush, 3000);
              }, 1000),
            );
          } else {
            window.clearTimeout(timers.get(e.target));
            timers.delete(e.target);
          }
        }
      },
      { threshold: 0.5 },
    );
    const watched = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll('a[href^="/journeys/"]').forEach((a) => {
        if (!watched.has(a)) {
          watched.add(a);
          io.observe(a);
        }
      });
    };
    scan();
    // Listings load their cards after fetching; pick those up as they appear.
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      io.disconnect();
      mo.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [pathname]);

  return null;
}
