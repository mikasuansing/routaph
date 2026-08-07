/**
 * Thin wrapper around Sentry so the rest of the app (error boundaries,
 * route handlers) never has to know whether monitoring is actually
 * configured.
 *
 * Sentry's SDK already no-ops safely when `dsn` is undefined (confirmed in
 * their own docs: `init({ dsn: undefined })` sends nothing and does not
 * throw), so this isn't strictly required for safety. It exists so the
 * call site reads `captureError(error)` instead of `Sentry.captureException`,
 * which keeps `app/error.tsx` from depending on knowing Sentry is the
 * provider at all — swapping monitoring vendors later touches this one
 * file, not every error boundary and route handler that reports to it.
 */

import * as Sentry from '@sentry/nextjs';

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
