'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes ParaPo usable without signal —
 * see the header comment in `public/sw.js` for what it does and does not
 * cache.
 *
 * Production only. In development a cached app shell fights hot reload and
 * makes changes look like they didn't apply, which is a bad trade for a
 * feature whose entire benefit is on a real phone in a real tunnel.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    /*
     * Tell the worker which build assets this page loaded, so it can cache
     * them.
     *
     * A worker never controls the page that registered it, so on a first
     * visit every chunk is fetched around it. Without this the next load
     * offline found no JavaScript, React never hydrated, and the app came up
     * as a dead shell — rendered but completely inert. Filenames are
     * content-hashed at build time, so the page is the only thing that knows
     * them.
     */
    const warmCache = () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const urls = performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(name => name.startsWith(self.location.origin) && name.includes('/_next/static/'));
      if (urls.length) worker.postMessage({ type: 'PRECACHE', urls });
    };

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => {
        if (cancelled) return;

        // Either the worker already controls this page, or it is about to
        // after `clients.claim()` — cover both.
        if (navigator.serviceWorker.controller) warmCache();
        navigator.serviceWorker.addEventListener('controllerchange', warmCache);
        // A deploy landed while the app was open. Activate it straight away
        // rather than waiting for every tab to close — transit data going
        // stale is exactly what we don't want to sit on.
        registration.addEventListener('updatefound', () => {
          const next = registration.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              next.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => {
        // Registration can fail on an unsupported browser or a hard-refresh
        // race. Offline support is an enhancement, so the app carries on.
      });

    return () => { cancelled = true; };
  }, []);

  return null;
}
