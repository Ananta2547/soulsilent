'use client';

/**
 * Registers the service worker (public/sw.js) that makes the site an
 * installable app, and wires the install events (usePwa). Mounted once in the
 * root layout.
 *
 * Production only: in `next dev` the JS files are not content-hashed, so a
 * caching worker would serve stale code. To try it locally anyway, set
 * localStorage "asl-sw" to "1".
 */
import { useEffect } from 'react';
import { wirePwaEvents } from './usePwa';
import { countAppOpen, countInstall } from './appStats';

export function PwaRegister() {
  useEffect(() => {
    wirePwaEvents();
    window.addEventListener('appinstalled', countInstall);
    countAppOpen();
    if (!('serviceWorker' in navigator)) return;
    let devOptIn = false;
    try {
      devOptIn = localStorage.getItem('asl-sw') === '1';
    } catch {}
    if (process.env.NODE_ENV !== 'production' && !devOptIn) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((e) => {
      console.warn('Service worker registration failed', e);
    });
  }, []);
  return null;
}

export default PwaRegister;
