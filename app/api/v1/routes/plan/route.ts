import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { planRoute } from '@/lib/routing/engine';
import { Errors, ok } from '@/lib/api/envelope';
import { geohash, timeBucket } from '@/lib/routing/utils';

export const dynamic = 'force-dynamic';

const schema = z.object({
  origin:      z.object({ lat: z.number(), lng: z.number() }),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  departAt:    z.string().datetime().optional(),
  preference:  z.enum(['fastest', 'fewest_transfers', 'cheapest']).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { origin, destination, departAt, preference } = parsed.data;

  // Rate limiting (graceful degradation if Redis unconfigured)
  try {
    const { ratelimit } = await import('@/lib/redis/client');
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    const { success } = await ratelimit.limit(ip);
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip rate limiting in dev
  }

  // Cache check
  const ohash = geohash(origin.lat, origin.lng);
  const dhash = geohash(destination.lat, destination.lng);
  const bucket = timeBucket(departAt ? new Date(departAt) : undefined);
  const pref = preference ?? 'all';
  const cacheKey = `route:v1:${ohash}:${dhash}:${bucket}:${pref}`;

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
    preference,
  });

  if (itineraries.length === 0) return Errors.noRoute();

  // Write to cache
  try {
    const { redis, ROUTE_CACHE_TTL } = await import('@/lib/redis/client');
    await redis.set(cacheKey, JSON.stringify(itineraries), { ex: ROUTE_CACHE_TTL });
  } catch {
    // non-fatal
  }

  // Log search (fire-and-forget, non-fatal)
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
