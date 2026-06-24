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
