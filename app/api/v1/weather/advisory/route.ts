import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { fetchOpenMeteoForecast, interpretForecast } from '@/lib/weather';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'weather:v1:metro-manila-advisory';
const CACHE_TTL_SEC = 600; // 10 min — Open-Meteo updates hourly at most; no need to hit it every planner load

export async function GET(req: NextRequest) {
  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  try {
    const { redis } = await import('@/lib/redis/client');
    const cached = await redis.get<string>(CACHE_KEY);
    if (cached) {
      const advisory = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return ok(advisory);
    }
  } catch {
    // Cache miss or Redis unconfigured — continue to fetch
  }

  try {
    const forecast = await fetchOpenMeteoForecast();
    const advisory = interpretForecast(forecast);

    try {
      const { redis } = await import('@/lib/redis/client');
      await redis.set(CACHE_KEY, JSON.stringify(advisory), { ex: CACHE_TTL_SEC });
    } catch {
      // non-fatal
    }

    return ok(advisory);
  } catch {
    // Open-Meteo down/unreachable — the planner home screen just shows no
    // banner rather than an error; this is a nudge, not a critical path.
    return ok({ heavyRainExpected: false, currentPrecipitationMm: 0, maxProbabilityPercent: 0, message: 'Weather unavailable' });
  }
}
