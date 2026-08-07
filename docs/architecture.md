# ParaPo — Architecture

## Overview

ParaPo is a single Next.js 16 application. All server logic lives in Route Handlers under `app/api/`. Browser code only talks to those handlers — never directly to Supabase with the service-role key.

```
Browser
  └─ fetch /api/v1/*
       └─ Route Handler (server)
            ├─ lib/routing/engine.ts   (pure, no I/O)
            ├─ lib/supabase/server.ts  (service-role, server-only)
            └─ lib/redis/client.ts     (cache + rate limit)
```

## Boundaries

| Boundary | Rule |
|---|---|
| Key separation | `lib/supabase/server.ts` (service-role) vs `lib/supabase/browser.ts` (anon). Never mix. |
| Single API boundary | Browser → `/api/v1/*` only. No direct Supabase calls from client. |
| Pure routing module | `lib/routing/` imports nothing from Next.js, Supabase, or Redis. |
| Env-driven config | All secrets and tunables from `process.env`. No hardcoding. |

## Key directories

```
app/
  api/
    health/route.ts          — liveness + readiness (Supabase + Redis ping)
    v1/
      routes/plan/route.ts   — POST: multimodal route planning
      catalog/lines/route.ts — GET: transit lines
      catalog/stops/route.ts — GET: stops (with bbox filter)
      me/routes/route.ts     — GET/POST: saved routes (auth)
      me/routes/[id]/route.ts — DELETE: saved route (auth)
  (app)/                     — main planner UI
  dashboard/                 — analytics dashboard (F8)

lib/
  routing/                   — THE ENGINE (pure module)
    types.ts                 — shared types
    utils.ts                 — haversine, walk time, geohash
    fares.ts                 — fare computation
    graph.ts                 — graph builder (static seed → Phase 1: Supabase)
    engine.ts                — A* multimodal search
  supabase/
    server.ts                — service-role client (server-only)
    browser.ts               — anon client
  redis/
    client.ts                — Redis + rate limiter
  api/
    envelope.ts              — { data } / { error } response helpers

supabase/
  migrations/                — checked-in SQL migrations (run in order)
  seed/                      — seed data scripts

docs/
  architecture.md            — this file
  api-contracts.md           — dated API contract inventory
  routing-engine.md          — algorithm writeup
  adr/                       — Architecture Decision Records
```

## Data flow: route planning

1. `POST /api/v1/routes/plan` receives `{ origin, destination, preference }`.
2. Handler checks Redis cache (key: origin-geohash + dest-geohash + time-bucket + preference).
3. On cache miss: calls `planRoute(getGraph(), query)` — pure in-memory computation.
4. A* searches the transit graph (nodes = stops, edges = ride + transfer + walk).
5. Returns up to 3 ranked itineraries (fastest / fewest-transfers / cheapest).
6. Result is written to Redis with 5-minute TTL.

## Database schema

See `supabase/migrations/` for the full DDL. Key tables:

| Table | Notes |
|---|---|
| `corridors` | Transit lines. `mode`: jeepney/bus/mrt/lrt |
| `stops` | Stops. `geom` PostGIS POINT; `lat`/`lng` generated columns |
| `routes` | Directional variant of a corridor (northbound/southbound) |
| `route_stops` | Ordered stop sequence per route |
| `fares` | Base fare + per-km rate per route |
| `eta_predictions` | Pre-computed ETA by route/segment/day-of-week/hour (1680 rows) |
| `saved_routes` | User-saved commutes — RLS-scoped to `user_id` |
| `search_logs` | Anonymised search events for analytics |

RLS is enabled on every table. See migration `002` for policies.

## Security model

- **Anon key** in browser: can only do what RLS policies allow (public reads).
- **Service-role key** on server: bypasses RLS; used only in Route Handlers.
- **Rate limiting**: Upstash sliding-window on `/api/v1/routes/plan`.
- **No PII in search_logs**: only geohash-bucketed origin/destination.
