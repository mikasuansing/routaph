import { type NextRequest } from 'next/server';
import { planRoute } from '@/lib/routing/engine';
import { Errors, ok } from '@/lib/api/envelope';
import { geohash, timeBucket } from '@/lib/routing/utils';
import { SearchBodySchema } from '@/lib/validation';
import { fetchOpenMeteoForecast, interpretForecast } from '@/lib/weather';

export const dynamic = 'force-dynamic';

// Guest-accessible (BASELINE §7.2 — only F5 saved commutes require auth).
// Abuse is contained by the rate limiter below.
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = SearchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { origin, destination, departAt, rush, preference, excludeModes } = parsed.data;

  // Rate limiting (graceful degradation if Redis unconfigured)
  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip rate limiting in dev
  }

  // Resolved after the rate limiter so a flood of requests can't fan out
  // into Open-Meteo calls.
  const floodAware = parsed.data.floodAware ?? await isHeavyRainExpected();

  // Cache check
  const ohash = geohash(origin.lat, origin.lng);
  const dhash = geohash(destination.lat, destination.lng);
  const bucket = timeBucket(departAt ? new Date(departAt) : undefined);
  const pref = preference ?? 'all';
  const modesKey = excludeModes?.length ? [...excludeModes].sort().join(',') : 'none';
  const rushKey = rush === undefined ? 'auto' : rush ? 'r1' : 'r0';
  const floodKey = floodAware ? 'f1' : 'f0';
  const cacheKey = `route:v1:${ohash}:${dhash}:${bucket}:${pref}:${modesKey}:${rushKey}:${floodKey}`;

  try {
    const { redis } = await import('@/lib/redis/client');
    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      const itineraries = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return ok(itineraries);
    }
  } catch {
    // Cache miss or Redis unconfigured — continue to compute
  }

  const { loadTransitGraph } = await import('@/lib/supabase/graph-loader');
  const graph = await loadTransitGraph();
  const itineraries = planRoute(graph, {
    originLat: origin.lat,
    originLng: origin.lng,
    destLat: destination.lat,
    destLng: destination.lng,
    departAt: departAt ? new Date(departAt) : undefined,
    rush,
    preference,
    excludeModes,
    floodAware,
  });

  if (itineraries.length === 0) return Errors.noRoute();

  // Write to cache
  try {
    const { redis, ROUTE_CACHE_TTL } = await import('@/lib/redis/client');
    await redis.set(cacheKey, JSON.stringify(itineraries), { ex: ROUTE_CACHE_TTL });
  } catch {
    // non-fatal
  }

  // Log search via service-role (fire-and-forget, never blocks the response)
  try {
    const { supabaseServer } = await import('@/lib/supabase/server');
    await supabaseServer.from('search_logs').insert({
      origin_geohash: ohash,
      dest_geohash:   dhash,
      preference:     preference ?? null,
      result_count:   itineraries.length,
    });
  } catch {
    // non-fatal
  }

  return ok(itineraries);
}

/**
 * Whether flood-prone segments should be penalized when the caller didn't
 * say. Reads the advisory the weather endpoint already caches (same key as
 * app/api/v1/weather/advisory/route.ts) before falling back to Open-Meteo.
 * Any failure counts as "no rain": a missing forecast must never turn the
 * penalty on and reroute everyone for nothing.
 */
const ADVISORY_CACHE_KEY = 'weather:v1:metro-manila-advisory';
const ADVISORY_CACHE_TTL_SEC = 600; // matches the weather endpoint

async function isHeavyRainExpected(): Promise<boolean> {
  try {
    const { redis } = await import('@/lib/redis/client');
    const cached = await redis.get<string | { heavyRainExpected: boolean }>(ADVISORY_CACHE_KEY);
    if (cached) {
      const advisory = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return advisory.heavyRainExpected === true;
    }
  } catch {
    // Redis unconfigured - fall through to a live fetch
  }
  try {
    const advisory = interpretForecast(await fetchOpenMeteoForecast());
    try {
      const { redis } = await import('@/lib/redis/client');
      await redis.set(ADVISORY_CACHE_KEY, JSON.stringify(advisory), { ex: ADVISORY_CACHE_TTL_SEC });
    } catch {
      // non-fatal
    }
    return advisory.heavyRainExpected;
  } catch {
    return false;
  }
}
