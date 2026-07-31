# ParaPo — Build Baseline

> Last updated: 2026-06-20
> This document is the single source of truth for the project. When code and BASELINE.md disagree, fix one on purpose — never drift silently.

> **Scope change (2026-07-26):** ParaPo has no accounts. Login/signup, saved
> commutes (F5), trip history, and the internal admin surface were removed —
> the product is now exactly: plan a route, see directions/fares/ETA, track
> it live via GPS. Every `/api/v1/*` endpoint is anonymous. Sections below
> that reference auth-gated features (F5, the `me/` API namespace, the
> admin station-accessibility page) describe removed functionality — kept
> here as history per the no-silent-drift rule above, not as current spec.

> **Scope change (2026-07-31) — crowdsourced live vehicle tracking (F16):**
> No PH operator publishes a real-time vehicle feed, so live positions are
> estimated from opted-in riders' phones. This narrows the §7.7 privacy
> invariant below, deliberately and in exactly one place: a rider who
> explicitly opts in **per trip** sends anonymous positions that live in
> Redis under a 180 s TTL and are never written to Postgres. Everything
> else holds — GPS is still never persisted, still never in a log, still
> never leaves the browser for riders who don't opt in (the default).
> Jeepneys are excluded by design: overlapping routes on shared roads make
> honest attribution impossible. See `lib/live/`, `docs/api-contracts.md`
> (`/api/v1/live/*`), and `/privacy` §3.

---

## §1 Vision

ParaPo is a Metro Manila commute-intelligence platform. **Routing engine first, UI second.** Competitive delta over Sakay.ph / Google Maps:

- From-scratch multimodal A* — no Google Directions wrapper
- Quantified ETA vs scheduled time (live error %)
- Isochrone reachability explorer
- Accessibility-scored stops
- Disruption rerouting from current GPS
- Ride-hailing option aggregation (fare estimate + deep-link, never booking)

---

## §2 Architecture

```
Browser → /api/v1/* Route Handlers → Supabase Postgres (PostGIS)
                                   ↘ Upstash Redis (cache / rate-limit)
lib/routing/ (pure TS) — zero Supabase / Next.js / Redis imports
```

---

## §3 Project Layout

### §3.1 Directory Tree

```
app/
  api/
    health/           # liveness + readiness probes
    v1/
      catalog/        # lines, stops (F4)
      routes/         # plan, reroute (F1–F3, F13)
      geo/            # isochrone (F6)
      accessibility/  # stop score (F7)
      transport/      # ride-hailing options (F14)
      disruptions/    # disruption feed (F13)
      me/             # saved commutes, RLS-scoped (F5)
  (app)/              # client pages
  trip/               # active trip UI (F15)
lib/
  api/                # envelope.ts + error helpers
  routing/            # pure engine — no framework imports
  supabase/           # server.ts (service-role) + browser.ts (anon key)
  redis/              # client.ts + ratelimit helpers
  trip/               # F15 client-side state: context, geo, types
docs/
  api-contracts.md    # all endpoint contracts (spec before code)
  routing-engine.md
  architecture.md
  adr/                # ADR-0001…
supabase/
  migrations/         # every schema change lives here
  seed/
scripts/
  check-migrations.mjs
  env-check.mjs
perf/                 # k6 load test scripts
```

### §3.2 Active-Trip State (F15)

Active-trip state is **client-side only**. `lib/trip/` holds the context, types, and geo utilities. `app/trip/page.tsx` is the UI.

- **TripContext** (`lib/trip/context.tsx`) — React context that stores `{ itinerary, currentLegIndex, position, status, reroutes, rideOptions, activeDisruption }`. Status: `idle | active | rerouting | arrived | ended`.
- **Itinerary handoff** — planner stores the chosen `Itinerary` in `sessionStorage` under key `parapo:active_trip` then navigates to `/trip`. The trip page reads it on mount and calls `startTrip()`.
- **GPS** — held in React state only. `useGeoWatch()` calls `navigator.geolocation.watchPosition` (opt-in, HTTPS-only, foreground). The watcher ID is cleaned up on `endTrip()` / component unmount. GPS coordinates are **never persisted** — not to Supabase, not to Redis, not to any log.
- **Auto-advance** — `checkAutoAdvance(currentPos, itinerary, legIndex)` computes haversine distance to the arrival stop of the current leg. When `< ADVANCE_THRESHOLD_KM` (150 m), it increments `currentLegIndex`. On the last leg, status transitions to `arrived`.
- **Disruption check** — every 30 s while a trip is active, the client polls `GET /api/v1/disruptions?lineId=<current ride leg's corridor id>`. An active disruption surfaces a banner; the user can tap it to trigger a reroute.
- **Reroute flow** — "I'm stuck / line down" sends `POST /api/v1/routes/reroute` with `{ origin: currentGPS, destination: originalDest, excludeLines: [currentLineId] }` and `GET /api/v1/transport/options`. Results render inline without leaving the trip screen.
- **Privacy invariant** — analytics, if any, must use anonymised geohash with no user identifier. No raw GPS traces are stored anywhere.

---

## §4 Locked Stack

> Do not change without an ADR checked into `docs/adr/`.

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| DB | Supabase Postgres + PostGIS |
| Auth | Supabase Auth |
| Cache / rate-limit | Upstash Redis (`@upstash/ratelimit`) |
| Maps | Leaflet + react-leaflet |
| Charts | Recharts |
| Unit tests | Vitest |
| E2E | Playwright |
| Load tests | k6 |
| CI | GitHub Actions + gitleaks |

---

## §5 Scaffold

```sh
npm create next-app@latest parapo -- --typescript --app --tailwind --eslint --import-alias '@/*'
```

Required env vars (blank in `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_APP_URL=http://localhost:3000
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
```

---

## §6 Hard Boundaries

1. **Service-role key server-only.** `lib/supabase/server.ts` is the only file that may hold the service-role key. Never import it from a Client Component or send it to the browser. `lib/supabase/browser.ts` uses the anon key only.

2. **Single API boundary.** Browser calls `/api/v1/*` Route Handlers only. It never queries Supabase directly with the service-role client.

3. **Routing engine is a pure module.** `lib/routing/` has zero imports from Next.js, Supabase, or Redis. Input: `TransitGraph + PlanQuery`. Output: `Itinerary[]`. This makes it unit-testable in isolation.

4. **No Google Directions for core routing.** The multimodal router is built from scratch. Wrapping a third-party directions API as the core is an automatic reject.

5. **No hardcoded keys, URLs, or magic numbers in business logic.** All values come from `process.env`. Provide `.env.example` with blank values.

6. **RLS on every table.** Run Supabase security advisors after every schema change.

---

## §7 Data Model & Feature Specs

### §7.1 Existing DB Schema

Adapt code to this schema. **Do not create parallel tables.**

| Table | Purpose |
|---|---|
| `corridors` | Transit lines — has `color` column; `mode` = `'train'|'bus'|'jeepney'|'uv_express'` |
| `stops` | Stops — `geom` is PostGIS point; `lat`/`lng` are generated columns |
| `routes` | Directional variants of a corridor |
| `route_stops` | Stop sequence per route (`route_id`, `stop_id`, `seq`) |
| `fares` | Fare rules per route (`base_fare`, `per_km`) |
| `trips` | Historical trip telemetry (feeds ETA model) |
| `eta_predictions` | Pre-computed ETA by route/segment/hour (1 680 rows) |
| `crowd_reports` | User-filed crowd reports |
| `saved_routes` | User-saved commutes — RLS-scoped to `user_id` |
| `search_logs` | Anonymised search events (drives F8 analytics) |

DB `'train'` → check corridor name for `'LRT'` → engine `'lrt'` else `'mrt'`. DB `'uv_express'` → engine `'bus'`.

### §7.2 Feature List

| ID | Feature | Phase |
|---|---|---|
| F1 | Multimodal route planner | 2 |
| F2 | Step-by-step itinerary | 2 |
| F3 | Fare breakdown | 2 |
| F4 | Lines / stops catalog + Leaflet map | 1 |
| F5 | Saved commutes (auth-required) | 3 |
| F6 | Isochrone explorer | 5 |
| F7 | Accessibility score | 5 |
| F8 | Intelligence dashboard (Recharts) | 5 |
| F13 | Disruption rerouting | 4 |
| F14 | Ride-hailing options (estimate + deep-link) | 4 |
| F15 | Active Trip Tracking / Trip Companion | 4 |

### §7.3 Routing Engine Spec

- **State**: `(stopId, currentLineId)`. `null` = at origin (never boarded). `-1` = transfer walk in progress (was on transit). These are distinct so the transfer counter increments correctly.
- **Edges**: ride edges (bidirectional, per consecutive stop pair); transfer edges (stops within 500 m on different lines, walk speed 80 m/min).
- **Algorithm**: time-dependent A*. Heuristic = `haversine(stop, dest) / 60 km/h * 60 * timeFactor`.
- **Multi-objective**: three independent searches:
  - `fastest` — timeFactor=1, transferPenalty=5, fareFactor=0
  - `fewest_transfers` — timeFactor=1, transferPenalty=30, fareFactor=0
  - `cheapest` — timeFactor=0.3, transferPenalty=3, fareFactor=2
- **Dedup**: itineraries deduped by ride-leg signature (line + from + to) before returning.
- **Short-circuit**: if origin and destination are `< 0.05 km` apart, return `[]` immediately.

### §7.4 Fare Model (2026 LTFRB / DOTr rates; verified 2026-07-08)

| Mode / line | Base fare | Flag km (free) | Per-km after |
|---|---|---|---|
| Jeepney (traditional) | ₱14 | 4 km | ₱2.00/km |
| Bus (A/C city) | ₱18 | 5 km | ₱2.98/km |
| MRT-3 (50% DOTr discount) | ₱6 | 0 km | ₱0.48/km |
| LRT-2 (50% DOTr discount) | ₱8 | 0 km | ₱0.46/km |
| LRT-1 (LRMC — **not** discounted) | ₱16.25 | 0 km | ₱1.47/km |

The Mar 23 2026 DOTr 50% discount covers MRT-3 and LRT-2 only. Because both
LRT-1 and LRT-2 map to engine mode `'lrt'`, fare rules are **per line** (one
`fares` row per route; the loader emits `lineId`-scoped `FareRule`s). Mode-level
averaging is forbidden.

**Critical rule**: `computeFare()` must be called **once per boarding** (full leg distance), never once per edge or segment.

### §7.5 F13 — Disruption Rerouting

New table: `service_disruptions(id, corridor_id, start_at, end_at, description)`.
Endpoint: `POST /api/v1/routes/reroute` — accepts current GPS + destination + `excludeLines[]` + `excludeModes[]`.
Engine: filter graph edges for excluded lines/modes before running `planRoute()`. Pass `excludeLines` as a `Set<number>` parameter.

### §7.6 F14 — Ride-Hailing Options

New tables: `ride_providers(id, name, deep_link_template)`, `provider_fare_rules(...)`.
Endpoint: `GET /api/v1/transport/options?originLat=&originLng=&destLat=&destLng=`.

**Hard rules**:
- Fare ranges are **estimates only**. Never label them as official or live prices.
- Add a visible disclaimer on all fare estimates.
- Deep-link for booking; ParaPo **never processes payment**.
- Verify current LTFRB/Grab/Angkas rates before seeding — do not hardcode guessed numbers.
- No scraping of third-party pricing pages.

### §7.7 F15 — Active Trip Tracking ("Trip Companion")

After a user starts a planned itinerary, the app enters an active-trip state and follows their GPS along the legs in real time. It:

**(a)** Shows live progress — current leg, next transfer, distance and ETA to next stop.

**(b)** Auto-advances legs via proximity — when the device is within `ADVANCE_THRESHOLD_KM` (150 m) of the arrival stop of the current leg, the next leg activates. This is computed client-side using haversine distance; no server call is needed.

**(c)** Instant rerouting on disruption — when the user taps "I'm stuck / line down" **or** an active community/admin flag fires on their current line, the app immediately calls `POST /api/v1/routes/reroute` with their **current GPS** as origin, the **original destination** unchanged, and `excludeLines = [currentLineId]`. It simultaneously calls `GET /api/v1/transport/options` for ride-hailing estimates. Results render inline without re-entering origin.

**Honesty note:** The app cannot auto-detect transit breakdowns. There is no public real-time breakdown feed in the Philippines. Disruption is user-triggered **or** community/admin-flagged via `/api/v1/disruptions`. Trip tracking makes the reroute response instant and location-aware; it does not provide automatic failure detection.

**Privacy rules (hard — these mirror §6):**

- GPS watcher is **opt-in**. The browser Geolocation prompt must fire; no silent location capture.
- Tracking runs **foreground only**. No background location.
- A visible **"End trip / Stop tracking"** control must always be reachable.
- Raw GPS coordinates are **never persisted** — not to Supabase, not to Redis, not to any log. GPS lives in React state in the browser tab only.
- If any event is logged for analytics (e.g. "reroute triggered"), it must be **anonymised + geohashed** with **no user identifier attached**.

**Active-trip persistence model:**

- The chosen `Itinerary` is stored in `sessionStorage` under key `parapo:active_trip` and read by `/trip` on mount. `sessionStorage` clears automatically when the tab closes — no trip state leaks between sessions.
- Only if the user explicitly saves a trip (F5 "saved commutes") is anything written to Supabase, and even then only the origin/destination, never a GPS trace.

---

## §8 API Envelope & Status Codes

All responses — no exceptions:

```typescript
// Success (single)
{ "data": <payload> }

// Success (list)
{ "data": [...], "page": { "cursor": "...", "hasMore": true } }

// Error
{ "error": { "code": "snake_case_code", "message": "Human string", "details": {} } }
```

| Situation | Status |
|---|---|
| OK / created | 200 / 201 |
| Validation error | 400 |
| Unauthenticated | 401 |
| Forbidden (RLS) | 403 |
| Not found | 404 |
| Conflict | 409 |
| Rate limited | 429 |
| Internal error | 500 |

Use helpers from `lib/api/envelope.ts`: `ok()`, `okList()`, `err()`, `Errors.*`.

---

## §9 Testing Standards

### §9.1 Unit tests (routing engine)

All routing logic tested against fixture graphs in `lib/routing/__tests__/`. Required cases: reachable A→E, multimodal (2 modes), transfer count = 1, fare > 0, unreachable origin/dest, same-stop returns 0 ride legs.

### §9.2 API contract tests

Every Route Handler has a test in a sibling `__tests__/` directory.

### §9.3 RLS tests

Every table with user-scoped data: authenticated user accesses own rows only; unauthenticated gets 401 or empty result set.

### §9.4 Contract test checklist (required for every endpoint)

Each endpoint's test file must cover **all six**:

1. **Validation** — missing required field → 400 `{ error: { code, message } }`
2. **Response shape** — all required fields present, correct types, envelope correct
3. **Error envelope** — `error.code` is `snake_case`; `error.message` is a non-empty string
4. **Status codes** — 2xx for success; correct 4xx for every documented error case
5. **RLS** — unauthenticated → 401; authenticated user cannot read another user's data
6. **Minimum 3 failure tests** per endpoint

---

## §10 Handoff Format

Output this block at the end of every working session:

```
## Handoff
- **Phase**: <phase number + feature name>
- **Completed**: <bullet list of what was implemented or fixed>
- **`npm run verify`**: PASS | FAIL (<what failed>)
- **Contracts added**: <doc/api-contracts.md entries, or "none">
- **Migrations added**: <supabase/migrations/ filenames, or "none">
- **Next**: <what the following session should tackle first>
- **Blockers**: <unresolved decisions or inputs needed from user>
```

---

## §11 Verify Gate

Must pass before every meaningful commit to `main`:

```sh
npm run verify
# Runs: lint → typecheck → test → build → audit (--audit-level=high) → check:migrations
```

Individual commands:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:cov       # coverage report
npm run build
npm run check:migrations
npm run e2e            # Playwright (requires running dev server)
```

CI runs all of the above except `e2e` (smoke-tested separately on deploy).

---

## §12 Phase Roadmap

| Phase | Scope | DoD |
|---|---|---|
| 0 | Foundations: scaffold, health endpoint, CI skeleton, docs stubs, `.env.example` | CI green on push; `/api/health` returns `{ status: "ok" }` |
| 1 | Data & catalog: migrations, seed data, RLS, catalog API (`/api/v1/catalog/*`), Leaflet map | F4 acceptance criteria met; lines/stops render from real API |
| 2 | Routing engine: A* + fare model + plan API + planner UI + engine tests | F1, F2, F3 met; 6/6 engine unit tests pass |
| 3 | Production hardening: Redis cache, rate limiting, saved commutes (F5), RLS tests, idempotency | §9 checklist fully green; F5 working with auth |
| 4 | Live location & disruption: F13 + F14 endpoints + UI | F13 + F14 acceptance criteria met |
| 5 | Differentiators: isochrone (F6), accessibility (F7), dashboard (F8) | All three features demoed end-to-end |
| 6 | Polish & benchmark: k6 perf scripts, README with benchmark table, demo account, RAPTOR ADR | §13 portfolio bar met; CI green |

---

## §13 Portfolio Bar

Minimum for submission:

- Live deploy URL (Vercel recommended)
- `README.md`: what it is, competitive delta vs Sakay, architecture diagram, benchmark table (cold vs warm p50/p95 latency)
- All Core features (F1–F5) working end-to-end
- At least 2 differentiators from: F6 (isochrone), F7 (accessibility), F8 (dashboard), F15 (active trip tracking)
- CI green on `main`
- k6 results showing `p95 < 500 ms` at 50 VU for `/api/v1/routes/plan`

---

## §14 Anti-Goals

These are automatic rejects / merge-blockers:

| Banned | Why |
|---|---|
| Service-role key in browser or Client Component | Bypasses RLS; exposes admin credentials |
| Google / third-party Directions API as core router | Defeats the entire point of the project |
| Hardcoded Supabase URLs / keys / Redis tokens in source | Secret leak; gitleaks CI blocks |
| Stretch features (F9–F12) before Core (F1–F5) + 2 differentiators | Scope creep |
| `npm run verify` failures committed to `main` | Breaks CI contract |
| Schema changes w
ithout a checked-in migration | Migration drift |
| `any` type without `// TODO: type this properly` | Type safety erosion |
| Ride-hailing fares labeled as official or live prices | Consumer protection / legal |
| Raw GPS traces persisted beyond the request | Privacy |
| Ride-hailing fares hardcoded without verifying current rates | Accuracy |
