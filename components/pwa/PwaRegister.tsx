'use client';

/**
 * The site is no longer an installable app (PWA); notifications go through
 * LINE. Mounted once in the root layout, this retires what the app left on a
 * device: its push subscription and the service worker (public/sw.js now
 * unregisters itself too, for devices that never load this page again).
 * Remove together with public/sw.js after a few months.
 */
import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) =>
        Promise.all(
          regs.map(async (r) => {
            try {
              const sub = await r.pushManager.getSubscription();
              if (sub) await sub.unsubscribe();
            } catch {}
            return r.unregister();
          }),
        ),
      )
      .catch(() => {});
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('asl-')).map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }, []);
  return null;
}

export default PwaRegister;
