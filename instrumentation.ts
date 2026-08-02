/**
 * Server-side monitoring bootstrap. Next calls `register()` once per
 * server instance, before it starts handling requests; `onRequestError`
 * fires whenever a Server Component, Route Handler, or middleware throws.
 *
 * Deliberately NOT wrapping next.config.ts with `withSentryConfig`. That
 * wrapper exists mainly for source-map upload at build time, which needs a
 * SENTRY_AUTH_TOKEN from a Sentry account this project doesn't have yet.
 * Error capture works fully without it; wrapping the config is a one-line
 * follow-up once there's an account and a token to give it.
 *
 * Safe with no DSN configured: Sentry's SDK no-ops on `dsn: undefined`
 * rather than throwing, so this file does nothing until
 * NEXT_PUBLIC_SENTRY_DSN is set in the environment.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  }
}

export const onRequestError = Sentry.captureRequestError;
