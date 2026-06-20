import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const requests = parseInt(process.env.RATE_LIMIT_REQUESTS ?? '60', 10);
const windowSec = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? '60', 10);

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(requests, `${windowSec}s`),
  analytics: true,
});

export const ROUTE_CACHE_TTL = 300; // 5 min

export function routeCacheKey(
  originGeohash: string,
  destGeohash: string,
  timeBucket: string,
  preference: string,
): string {
  return `route:v1:${originGeohash}:${destGeohash}:${timeBucket}:${preference}`;
}
