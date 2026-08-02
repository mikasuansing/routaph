'use client';

/*
 * Route-level error boundary. Wraps every page under app/ (planner, trip,
 * privacy, offline) since none of them declare a nested layout of their
 * own, so one file here covers the whole app rather than needing a copy
 * per route.
 *
 * Before this file existed, any thrown error (a malformed API response, a
 * null itinerary field the UI didn't guard) took the whole screen to a
 * blank white page with no way back except a manual reload. This is a
 * transit app: someone hits this mid-commute, on a phone, maybe with a
 * weak signal. "Try again" has to be one tap away.
 *
 * NOT a standard Next.js error boundary API — this project is on a
 * version where the primary recovery hook is `unstable_retry` (re-fetches
 * and re-renders the boundary's children) rather than the classic `reset`
 * (which only clears local error state without re-fetching). See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 */

import { useEffect } from 'react';
import { captureError } from '@/lib/monitoring';

const C = {
  bg:     'var(--color-bg)',
  card:   'var(--color-card)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
};

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Sentry (when NEXT_PUBLIC_SENTRY_DSN is set — see lib/monitoring.ts)
    // captures this; logging here too so it shows up in Vercel's own
    // function logs even before a DSN is configured.
    console.error('RoutaPH route error:', error);
    captureError(error, { boundary: 'app/error.tsx' });
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: 'var(--font-sans)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
          letterSpacing: '-0.02em', color: C.accent,
        }}>
          RoutaPH<span style={{ color: C.ink }}>.</span>
        </span>

        <h1 style={{
          margin: '18px 0 0', fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)', fontWeight: 800, letterSpacing: '-0.02em', color: C.ink,
        }}>
          Something went wrong
        </h1>

        <p style={{ margin: '12px 0 0', fontSize: 15, color: C.body, lineHeight: 1.7 }}>
          This screen hit an error and could not load. It is on our side,
          not something you did. Tap retry, and if it keeps happening,
          head back to the planner and start again.
        </p>

        {error.digest && (
          <p className="tnum" style={{ margin: '10px 0 0', fontSize: 12, color: C.muted }}>
            Reference: {error.digest}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            onClick={() => unstable_retry()}
            style={{
              flex: 1, padding: '15px 16px', borderRadius: 'var(--radius-pill)',
              border: 'none', background: 'var(--gradient-primary)',
              color: 'var(--color-on-primary)', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: 'var(--shadow-accent)',
            }}
          >
            Try again
          </button>
          <a
            href="/planner"
            style={{
              flex: 1, padding: '15px 16px', borderRadius: 'var(--radius-pill)',
              border: `1.5px solid ${C.border}`, background: 'transparent',
              color: C.ink, fontSize: 15, fontWeight: 700, textAlign: 'center',
              textDecoration: 'none', fontFamily: 'inherit',
            }}
          >
            Back to planner
          </a>
        </div>
      </div>
    </div>
  );
}
