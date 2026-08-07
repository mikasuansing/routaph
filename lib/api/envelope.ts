import { NextResponse } from 'next/server';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function okList<T>(
  data: T[],
  page?: { cursor?: string; hasMore: boolean },
): NextResponse {
  return NextResponse.json({ data, ...(page ? { page } : {}) });
}

export type ApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error'
  | 'service_unavailable'
  | 'no_route_found';

export function err(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, details: details ?? {} } }, { status });
}

export const Errors = {
  validation: (msg: string, details?: Record<string, unknown>) =>
    err('validation_error', msg, 400, details),
  unauthorized: () => err('unauthorized', 'Authentication required', 401),
  forbidden: () => err('forbidden', 'Insufficient permissions', 403),
  notFound: (resource: string) => err('not_found', `${resource} not found`, 404),
  conflict: (msg: string) => err('conflict', msg, 409),
  rateLimited: () => err('rate_limited', 'Too many requests', 429),
  internal: (msg = 'An unexpected error occurred') => err('internal_error', msg, 500),
  unavailable: (msg = 'Service temporarily unavailable') =>
    err('service_unavailable', msg, 503),
  noRoute: () => err('no_route_found', 'No route found between these points', 404),
};
