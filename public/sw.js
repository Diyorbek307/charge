/* ONE CHARGE UZ — service worker.
 *
 * Goals, in order: never serve a stale build, keep the app openable offline,
 * and stay entirely out of the way of the live-sync channel.
 */

const VERSION = 'oc-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // A single missing entry must not fail the whole install.
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isAsset(url) {
  return url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GETs.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // The SSE channel must stream — caching or proxying it would break sync.
  if (url.pathname === '/api/stream') return;

  // Build assets are content-hashed, so cache-first is always safe.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        hit =>
          hit ||
          fetch(request).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then(c => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Shared state: prefer the network, fall back to the last good snapshot so
  // an offline portal still renders something truthful.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then(c => c.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            hit =>
              hit ||
              new Response(JSON.stringify({ error: 'Нет соединения' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }),
          ),
        ),
    );
    return;
  }

  // Navigations: network-first so a new deploy is picked up immediately,
  // with the cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then(hit => hit || Response.error())),
    );
  }
});
