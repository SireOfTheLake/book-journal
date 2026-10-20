// Keeps the app itself on the phone so it opens with no signal. The journal's data is not stored here (it lives in the app's own database).
// Pages and files are fetched fresh when there is a connection, and the saved copy is used when there is not.
const CACHE = 'book-journal-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cloud calls and fonts go straight out
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const hit = (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./'));
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
