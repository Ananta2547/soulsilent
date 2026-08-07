'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PageLoader } from './PageLoader';

/**
 * Global route-change loading curtain. On every navigation it drops a
 * full-screen AllSoulLearn loader over the page, holds briefly, then slides it
 * DOWN to reveal the new page. This gives every page a loading screen with a
 * consistent slide-down exit (Suspense fallbacks can't animate their own exit).
 * Skipped on the very first paint (the route loading.tsx covers that) and under
 * prefers-reduced-motion.
 */
const HOLD_MS = 450; // covered time before it starts sliding away
const SLIDE_MS = 900; // must match .asl-curtain--exit animation duration

export function RouteTransition() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'idle' | 'cover' | 'exit'>('idle');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // don't cover the initial load
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    setPhase('cover');
    const t1 = setTimeout(() => setPhase('exit'), HOLD_MS);
    const t2 = setTimeout(() => setPhase('idle'), HOLD_MS + SLIDE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  if (phase === 'idle') return null;

  return (
    <div className={`asl-curtain ${phase === 'exit' ? 'asl-curtain--exit' : ''}`} aria-hidden>
      <PageLoader variant="inline" />
    </div>
  );
}

export default RouteTransition;
