/*
 * Route-level loading UI, shown briefly while a page's JS chunk loads on
 * navigation (this app has no cacheComponents / unstable_instant enabled,
 * so this is the classic Suspense fallback, not the newer instant-nav
 * mechanism).
 *
 * A single file at the app root, since planner/trip/privacy/offline don't
 * declare nested layouts of their own, covers every route with no
 * per-route duplication.
 *
 * Deliberately minimal: the pages that actually fetch data (planner, trip)
 * do it client-side after mount and already show their own in-page loading
 * state for that (see `screen === 'loading'` in app/planner/page.tsx). This
 * file only covers the moment before any of that code has run, so it has
 * nothing to be specific about, it should just not be a blank flash.
 */
export default function Loading() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span
        aria-label="Loading"
        style={{
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800,
          letterSpacing: '-0.02em', color: 'var(--color-accent)',
          animation: 'pulse 1.6s ease-in-out infinite',
        }}
      >
        RoutaPH<span style={{ color: 'var(--color-ink)' }}>.</span>
      </span>
    </div>
  );
}
