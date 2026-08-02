/**
 * Client-side monitoring bootstrap. Runs before the app becomes
 * interactive; see instrumentation.ts for the server-side half.
 *
 * Safe with no DSN configured (see that file's header comment for why).
 * Session replay and a low trace sample rate are on; both are free-tier
 * Sentry features that matter for a GPS-heavy app where "what did the map
 * actually show when this broke" is hard to reconstruct from a stack
 * trace alone.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [Sentry.replayIntegration()],
  });
}
