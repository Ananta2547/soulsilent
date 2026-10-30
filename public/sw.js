/*
 * AllSoulLearn no longer runs as an installable app (PWA) — notifications go
 * through LINE. This file stays only to retire the old service worker on
 * devices that installed it: the browser fetches the new sw.js, which wipes
 * every cache it made, drops its push subscription, unregisters itself and
 * reloads open tabs so they come straight from the network.
 * Keep it here for a few months, then delete it.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('asl-')).map((k) => caches.delete(k)));
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch (e) {}
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: 'window' });
      tabs.forEach((c) => c.navigate(c.url).catch(() => {}));
    })(),
  );
});
