/*
 * ParaPo service worker.
 *
 * WHY THIS EXISTS
 * This is a transit app, so it stops working exactly where it is needed
 * most: inside an MRT tunnel, in an underground concourse, on a bus in a
 * dead spot. Without a service worker a rider mid-trip who lets the tab
 * reload gets nothing at all. With one, the app shell and the stop catalog
 * come from cache and the trip screen survives the tunnel.
 *
 * WHAT IT DELIBERATELY WILL NOT CACHE
 * Anything whose whole value is being current. Live vehicle positions,
 * route plans, service disruptions and the rain advisory are network-only:
 * a stale train position or a cleared disruption shown as active is worse
 * than an honest failure, and the app already degrades gracefully when a
 * fetch fails.
 *
 * Hand-written rather than generated. Serwist — the tool Next's own PWA
 * guide points at — still needs webpack config, and this project builds
 * with Turbopack.
 */

const VERSION = 'parapo-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE  = `${VERSION}-data`;
const TILE_CACHE  = `${VERSION}-tiles`;

const OFFLINE_URL = '/offline';

/** Map tiles are large and endless; keep the working area, not the country. */
const MAX_TILES = 300;

/** Routes worth having before the signal drops. */
const SHELL_URLS = [OFFLINE_URL, '/planner', '/trip', '/manifest.webmanifest'];

/**
 * Fetched at install rather than waiting to see them go by.
 *
 * The planner requests the catalog during hydration, which races the
 * worker taking control — on a first visit it usually wins, so the request
 * never passes through here and never lands in the cache. Offline, the stop
 * picker then had nothing to search and came up empty. These URLs are fixed
 * (unlike the content-hashed build output), so the worker can just ask for
 * them itself.
 */
const DATA_URLS = ['/api/v1/catalog/stops', '/api/v1/catalog/lines'];

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const data  = await caches.open(DATA_CACHE);
    // Individually, so one 404 can't fail the whole install and leave the
    // app with no worker at all.
    await Promise.allSettled([
      ...SHELL_URLS.map(url => shell.add(url)),
      ...DATA_URLS.map(url => data.add(url)),
    ]);
    await self.skipWaiting();
  })());
});

// ── Activate: drop caches from previous versions ─────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => !n.startsWith(VERSION)).map(n => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/** Serve cache immediately, refresh in the background for next time. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return hit ?? (await network) ?? Response.error();
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (fallbackUrl) {
      const offline = await cache.match(fallbackUrl);
      if (offline) return offline;
    }
    throw new Error('offline and nothing cached');
  }
}

/** Oldest-first eviction so a long session can't fill the disk with tiles. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
}

// ── Routing ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Map tiles — same imagery for everyone, safe and valuable to keep.
  if (/(basemaps\.cartocdn\.com|tiles\.openfreemap\.org|tile\.openstreetmap\.org)/.test(url.hostname)) {
    event.respondWith(
      cacheFirst(request, TILE_CACHE)
        .then(res => { event.waitUntil(trimCache(TILE_CACHE, MAX_TILES)); return res; })
        .catch(() => Response.error()),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Content-hashed build output — the URL changes when the file does, so a
  // cache hit is always correct.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    // The stop catalog is what the planner needs to be usable at all, and it
    // changes about as often as the network does — worth having offline.
    if (url.pathname.startsWith('/api/v1/catalog/')) {
      event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
      return;
    }
    // Everything else live stays network-only. See the header comment: a
    // stale answer here would be a lie, and the callers already handle a
    // failed fetch.
    return;
  }

  // Page navigations: prefer fresh, fall back to cache, then to /offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, OFFLINE_URL));
    return;
  }

  // Icons, fonts and other same-origin statics.
  event.respondWith(
    staleWhileRevalidate(request, SHELL_CACHE).catch(() => fetch(request)),
  );
});

self.addEventListener('message', event => {
  // Lets a newly deployed worker take over without waiting for every tab to
  // close — used by the registration script after an update is found.
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  /*
   * Warm the cache with the build assets this page actually loaded.
   *
   * A worker does not control the page that registers it, so every script
   * and stylesheet on the very first visit is fetched around the worker and
   * never cached. The next load — offline, in a tunnel — then found no
   * chunks, React never hydrated, and the app rendered as a dead shell.
   *
   * The build's filenames are content-hashed and unknowable to a static
   * worker, so the page reports what it loaded instead of the worker
   * guessing.
   */
  if (event.data && event.data.type === 'PRECACHE' && Array.isArray(event.data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const missing = [];
      for (const url of event.data.urls) {
        if (!(await cache.match(url))) missing.push(url);
      }
      // Individually: one failure shouldn't discard the rest.
      await Promise.allSettled(missing.map(url => cache.add(url)));
    })());
  }
});
