/*
 * AllSoulLearn service worker — what makes the site an installable app (PWA).
 * Registered by components/pwa/PwaRegister.tsx; the manifest is app/manifest.ts.
 *
 * Rules, so the app never shows a stale site and never keeps what it shouldn't:
 *  - Pages always come from the network first. Only a short list of pages a
 *    member may want with no signal (bookings, Diary, calendar…) keeps a copy,
 *    used only when the network fails; anything else falls back to /offline.html.
 *  - Built JS/CSS (/_next/static, content-hashed) and icons are cached for good.
 *  - Event posters (/api/media) are cached, newest 80 kept.
 *  - API calls pass straight through, except the member's own booking list,
 *    which keeps its last copy for offline use (marked with x-sw-offline: 1).
 *    The page asks this worker to drop it on sign-out ("clear-user-data").
 *  - Admin, host dashboard, payment and sign-in traffic is never touched.
 *  - Push messages show a notification; tapping it opens its link.
 *
 * Bump VERSION when these rules change; old caches are deleted on activate.
 */
const VERSION = 'v3';
const STATIC = `asl-static-${VERSION}`;
const PAGES = `asl-pages-${VERSION}`;
const MEDIA = `asl-media-${VERSION}`;
const USER = `asl-user-${VERSION}`;
const KEEP = [STATIC, PAGES, MEDIA, USER];

// public/offline.html; Cloudflare serves it at /offline (and redirects the .html form).
const OFFLINE_URL = '/offline';
const MEDIA_MAX = 80;

/** Pages that keep a copy for offline use (matched by path, query ignored). */
const OFFLINE_PAGES = ['/', '/me', '/me/bookings', '/me/journey', '/calendar', '/journeys', '/app'];
/** Never handled by the worker: always the network, never cached. */
const BYPASS = [/^\/admin/, /^\/host(\/|$)/, /^\/pay\//, /^\/auth\//, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/payments\//, /^\/sw\.js$/];
/** API reads whose last copy is kept for offline use (personal data — cleared on sign-out). */
const USER_APIS = ['/api/bookings'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then(keepOfflinePage)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('asl-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'clear-user-data') {
    // Signed out: forget everything personal, including pages that showed it.
    event.waitUntil(
      Promise.all([caches.delete(USER), caches.delete(PAGES)]).then(() => caches.open(PAGES).then(keepOfflinePage)),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pageFirst(req, url));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (url.pathname.startsWith('/api/media/')) {
    event.respondWith(cacheFirst(req, MEDIA, MEDIA_MAX));
    return;
  }
  if (USER_APIS.includes(url.pathname) && url.searchParams.get('mine') === '1') {
    event.respondWith(apiWithOfflineCopy(req));
  }
  // Everything else: untouched (straight to the network).
});

/** Store the offline page as a plain response: a redirected one cannot answer a navigation. */
async function keepOfflinePage(cache) {
  const res = await fetch(OFFLINE_URL, { cache: 'no-store' });
  if (!res.ok) return;
  await cache.put(OFFLINE_URL, new Response(await res.blob(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}

async function pageFirst(req, url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const keep = OFFLINE_PAGES.includes(path);
  try {
    const res = await fetch(req);
    if (keep && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(path, copy));
    }
    return res;
  } catch (err) {
    const cache = await caches.open(PAGES);
    return (keep && (await cache.match(path))) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (max) trim(cache, max);
  }
  return res;
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function apiWithOfflineCopy(req) {
  const cache = await caches.open(USER);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    // Signed out on the server: the kept copy must not outlive the session.
    if (res.status === 401) await cache.delete(req);
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (!hit) throw err;
    const headers = new Headers(hit.headers);
    headers.set('x-sw-offline', '1');
    return new Response(await hit.blob(), { status: 200, headers });
  }
}

/* ---------------- Push notifications ---------------- */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'AllSoulLearn', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'AllSoulLearn', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Reuse an open window of the app when there is one.
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
