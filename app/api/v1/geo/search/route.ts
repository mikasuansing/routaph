import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';
import { forwardGeocodeCacheKey, GEOCODE_CACHE_TTL_SEC, type ForwardGeocodeResult } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(3).max(120),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ q: searchParams.get('q') });
  if (!parsed.success) return Errors.validation('q must be 3-120 characters');

  const { q } = parsed.data;

  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured - skip in dev
  }

  const key = forwardGeocodeCacheKey(q);

  try {
    const { redis } = await import('@/lib/redis/client');
    const cached = await redis.get<ForwardGeocodeResult[]>(key);
    if (cached) return ok(cached);
  } catch {
    // Cache miss or Redis down - fall through and ask upstream.
  }

  try {
    const { fetchForwardGeocode } = await import('@/lib/geocode');
    const results = await fetchForwardGeocode(q);

    try {
      const { redis } = await import('@/lib/redis/client');
      await redis.set(key, results, { ex: GEOCODE_CACHE_TTL_SEC });
    } catch { /* non-fatal */ }

    return ok(results);
  } catch {
    // A geocoding hiccup shouldn't break the search box - just no results.
    return ok([] as ForwardGeocodeResult[]);
  }
}
