import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';
import { coordsLabel, geocodeCacheKey, GEOCODE_CACHE_TTL_SEC, type ReverseGeocode } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    lat: searchParams.get('lat'),
    lng: searchParams.get('lng'),
  });
  if (!parsed.success) return Errors.validation('lat and lng are required');

  const { lat, lng } = parsed.data;

  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  const key = geocodeCacheKey(lat, lng);

  // Cache first. Addresses don't change, and the cache is what keeps this
  // inside Nominatim's one-request-per-second policy while a rider drags
  // the map around.
  try {
    const { redis } = await import('@/lib/redis/client');
    const cached = await redis.get<ReverseGeocode>(key);
    if (cached) return ok(cached);
  } catch {
    // Cache miss or Redis down — fall through and ask upstream.
  }

  try {
    const { fetchReverseGeocode } = await import('@/lib/geocode');
    const result = await fetchReverseGeocode(lat, lng);

    // Only cache a real answer; a coords fallback should be retried later
    // rather than pinned for a month.
    if (result.source === 'osm') {
      try {
        const { redis } = await import('@/lib/redis/client');
        await redis.set(key, result, { ex: GEOCODE_CACHE_TTL_SEC });
      } catch { /* non-fatal */ }
    }

    return ok(result);
  } catch {
    // Never fail the picker over a geocoding hiccup: a rider who dropped a
    // pin still has a usable destination, just labelled by its coordinates.
    return ok({
      label: coordsLabel(lat, lng),
      fullLabel: coordsLabel(lat, lng),
      lat, lng,
      source: 'coords',
    } satisfies ReverseGeocode);
  }
}
