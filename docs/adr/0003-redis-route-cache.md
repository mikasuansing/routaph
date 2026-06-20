# ADR 0003 — Redis route cache with geohash + time-bucket keys

**Date:** 2026-06-20  
**Status:** Accepted

## Context

The A\* search over a Metro Manila transit graph (hundreds of stops, thousands of edges) is fast in memory — typically < 10 ms. But at scale, with many concurrent users and three-objective searches, the CPU cost compounds. More importantly, re-running the same origin-to-destination query within a short window is wasteful — the answer won't change.

## Decision

Cache computed itineraries in **Upstash Redis** with a structured key:

```
route:v1:{origin-geohash}:{dest-geohash}:{time-bucket}:{preference}
```

Where:
- **origin/dest geohash** = `lat.toFixed(2),lng.toFixed(2)` — ~1 km grid cells.
- **time-bucket** = `HH:00` or `HH:30` — 30-minute windows (aligns with rush-hour transitions).
- **preference** = `fastest | fewest_transfers | cheapest | all`
- **TTL** = 300 seconds (5 minutes)

## Consequences

**Positive:**
- Warm-path latency drops from ~10 ms compute to ~2 ms Redis read.
- Geohash bucketing means nearby origins (within ~1 km) share cache entries — high hit rate in dense urban areas.
- 30-minute time buckets align naturally with peak/off-peak transitions, so cached results remain valid for their TTL.
- `@upstash/ratelimit` (same Redis instance) provides sliding-window rate limiting on the same connection.
- Upstash is serverless-native — no persistent connection issues with Next.js Route Handlers.

**Negative:**
- 1 km geohash is coarse — two users 900 m apart share a cache entry that may not be optimal for one of them. Acceptable for MVP; can tighten to 0.5° (~55 m) if precision complaints arise.
- Cold-path latency is unchanged. Cold p95 target: < 1 s.

**Metrics to publish in README:**
- Cold p50 / p95 (no cache)
- Warm p50 / p95 (Redis hit)
- Cache hit rate under realistic load (k6 script in `perf/`)
