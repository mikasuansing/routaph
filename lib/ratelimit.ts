import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis/client";

export const searchLimiter = new Ratelimit({
  redis,
  prefix: "rl:search",
  limiter: Ratelimit.slidingWindow(20, "60 s"),
});

export const crowdLimiter = new Ratelimit({
  redis,
  prefix: "rl:crowd",
  limiter: Ratelimit.slidingWindow(5, "60 s"),
});

// Live position pings are a fundamentally different shape of traffic from
// crowd reports: one rider contributes ~4/min for the length of a ride, and
// PH mobile carriers put many riders behind a single CGNAT address, so an
// IP here is a neighbourhood rather than a person. This is sized to let a
// busy train car through while still capping a runaway client.
export const liveLimiter = new Ratelimit({
  redis,
  prefix: "rl:live",
  limiter: Ratelimit.slidingWindow(120, "60 s"),
});

export const authLimiter = new Ratelimit({
  redis,
  prefix: "rl:auth",
  limiter: Ratelimit.slidingWindow(5, "60 s"),
});

export function clientKey(req: Request, userId?: string): string {
  if (userId) return `u:${userId}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `ip:${ip}`;
}
