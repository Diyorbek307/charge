/* PowerGo — service worker.
 *
 * Goals, in order: never serve a stale build, keep the app openable offline,
 * and stay entirely out of the way of the live-sync channel.
 */

const VERSION = 'oc-v7';
/** Offline packs (map of a road, the app's code) outlive builds: only the driver deletes them. */
const KEEP = 'pg-offline';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = ['/', '/manifest.json', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

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
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION) && !k.startsWith(KEEP)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/** The network, unless it hangs: on a weak highway signal a request can stall for a minute. */
function fetchWithin(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      res => {
        clearTimeout(t);
        resolve(res);
      },
      err => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

/** Map files: the vector style, its tiles, icons and fonts. */
const MAP_HOSTS = ['tiles.openfreemap.org'];

function isAsset(url) {
  return url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // The map: a saved road's tiles come from the pack at once (no waiting on a dead network);
  // the style and tile manifest try the network briefly so a new map version is picked up.
  if (MAP_HOSTS.includes(url.hostname)) {
    const manifest = !/\.(pbf|png|jpg|webp)$/.test(url.pathname);
    event.respondWith(
      manifest
        ? fetchWithin(request, 4000).catch(() => caches.match(request.url).then(hit => hit || Response.error()))
        : caches.match(request.url).then(hit => hit || fetch(request)),
    );
    return;
  }

  // Otherwise only same-origin GETs.
  if (url.origin !== self.location.origin) return;

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
      fetchWithin(request, 8000)
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
      fetchWithin(request, 5000)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then(hit => hit || Response.error())),
    );
  }
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PowerGo', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // A live charge updates its own notice in place: quietly, and it stays until the charge ends.
      silent: !!data.silent,
      renotify: !!data.renotify && !!data.tag,
      requireInteraction: !!data.sticky,
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const open = windows.find(w => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then(w => (w.navigate ? w.navigate(target) : w));
      return self.clients.openWindow(target);
    }),
  );
});
