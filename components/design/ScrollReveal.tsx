'use client';

import { useEffect } from 'react';

/**
 * Global scroll-reveal. Any element with the `reveal-up` class fades + slides up
 * once (via the `.in` class → CSS animation). Elements that come in together get
 * an incremental animation-delay so they cascade one-by-one (Stagger).
 *
 * Fail-safe by design — content is NEVER left stuck hidden:
 *  - anything already in the viewport is revealed immediately (no dependency on
 *    the IntersectionObserver actually firing),
 *  - only below-the-fold elements wait for the observer to scroll them in.
 *
 * Mounted ONCE for the app lifetime; a MutationObserver (rAF-debounced) re-scans
 * so async / route-changed content is picked up without recreating observers
 * (recreating per route stranded the next page's elements → the "text only shows
 * after a refresh" bug). Disabled under prefers-reduced-motion (CSS then shows
 * `.reveal-up` content immediately).
 */
export function ScrollReveal() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .forEach((e, i) => reveal(e.target as HTMLElement, i));
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );

    // Reveal via the Web Animations API — NOT by adding a class or inline style.
    // Mutating className/style on a React-rendered node causes a hydration
    // mismatch when a Suspense boundary (route loading.tsx / a page that reads
    // params as a promise) hydrates AFTER this runs. WAAPI animations aren't
    // reflected in DOM attributes, so React never sees a diff. `fill: 'both'`
    // holds opacity:0 during the stagger delay and opacity:1 after.
    const done = new WeakSet<Element>();
    function reveal(el: HTMLElement, i = 0) {
      if (done.has(el)) return;
      done.add(el);
      io.unobserve(el);
      el.animate(
        [
          { opacity: 0, translate: '0 26px' },
          { opacity: 1, translate: '0 0' },
        ],
        { duration: 600, delay: Math.min(i, 8) * 70, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both' },
      );
    }

    const inViewport = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.95 && r.bottom > 0;
    };

    // Track observed (below-fold) elements in JS, not via a DOM attribute.
    const seen = new WeakSet<Element>();

    function scan() {
      let batch = 0;
      document.querySelectorAll<HTMLElement>('.reveal-up').forEach((el) => {
        if (done.has(el)) return;
        if (inViewport(el)) {
          reveal(el, batch++); // visible now → reveal immediately (fail-safe)
        } else if (!seen.has(el)) {
          seen.add(el);
          io.observe(el); // below the fold → reveal on scroll
        }
      });
    }

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    };

    scan();
    schedule(); // re-check after layout / scroll-to-top settles on route change
    const root = document.querySelector('main') ?? document.body;
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
