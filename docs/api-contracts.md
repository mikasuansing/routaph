# ParaPo — API Contracts

> Last verified from code: 2026-07-04

All responses use the standard envelope:

| Shape | Format |
|---|---|
| Success | `{ "data": <payload> }` |
| List | `{ "data": [...], "page": { "cursor": "...", "hasMore": true } }` |
| Error | `{ "error": { "code": "snake_case", "message": "Human string", "details": {} } }` |

Auth: `Authorization: Bearer <supabase-access-token>` where required.

---

## GET /api/health

**Auth:** None  
**Returns:** `{ ok: boolean, checks: { supabase, redis }, ts: string }`  
**Status codes:** 200 (all ok/unconfigured), 503 (any error)

---

## POST /api/v1/routes/plan

**Auth:** None  
**Body:**
```json
{
  "origin":      { "lat": number, "lng": number },
  "destination": { "lat": number, "lng": number },
  "departAt":     "ISO8601 datetime (optional)",
  "rush":         "boolean (optional) — force rush-hour congestion; defaults from departAt hour (Manila 7-9am / 5-7pm)",
  "preference":   "fastest | fewest_transfers | cheapest (optional, default: all three)",
  "excludeModes": ["jeepney" | "bus" | "mrt" | "lrt"]  // optional, max 3 of 4 — at least one mode must remain
}
```
**Returns:** `{ "data": Itinerary[] }`  
**Status codes:**
- 200 — itineraries found
- 400 — validation error
- 404 — `no_route_found` — no route between these points
- 429 — rate limited
- 500 — internal error

**Itinerary shape:**
```typescript
{
  legs: (RideLeg | WalkLeg)[];
  totalDurationMin: number;
  totalFare: number;
  transfers: number;
  objective: "fastest" | "fewest_transfers" | "cheapest";
}

RideLeg {
  type: "ride";
  mode: "jeepney" | "bus" | "mrt" | "lrt";
  line: { id, name, mode, color };
  from: Stop; to: Stop; stops: Stop[];
  distKm: number; durationMin: number; fare: number;
  fareRule?: { baseFare: number; perKmRate: number; flagDistanceKm: number };  // rule applied to this boarding
}

WalkLeg {
  type: "walk";
  fromName: string; toName: string;
  fromLat: number; fromLng: number;
  toLat: number; toLng: number;
  distKm: number; durationMin: number;
}
```

---

## GET /api/v1/catalog/lines

**Auth:** None  
**Returns:** `{ "data": Line[] }` — each line includes `stopCount` and ordered `stops[]`  
**Status codes:** 200, 500

---

## GET /api/v1/catalog/stops

**Auth:** None  
**Query params:** `?bbox=minLat,minLng,maxLat,maxLng` (optional)  
**Returns:** `{ "data": Stop[] }`  
**Status codes:** 200, 400 (invalid bbox), 500

---

## GET /api/v1/me/routes

**Auth:** Bearer token (required)  
**Returns:** `{ "data": SavedRoute[] }` ordered newest-first  
**Status codes:** 200, 401

---

## POST /api/v1/me/routes

**Auth:** Bearer token (required)  
**Body:**
```json
{
  "name":        "string (1–120 chars)",
  "originLat":   number,
  "originLng":   number,
  "originName":  "string",
  "destLat":     number,
  "destLng":     number,
  "destName":    "string"
}
```
**Returns:** `{ "data": SavedRoute }`  
**Status codes:** 201, 400, 401, 500

---

## DELETE /api/v1/me/routes/:id

**Auth:** Bearer token (required)  
**Returns:** `{ "data": { "ok": true } }`  
**Status codes:** 200, 401, 404, 500

---

## GET /api/v1/me/trips

**Auth:** Bearer token (required)  
**Returns:** `{ "data": TripHistory[] }` newest-first, max 50

```typescript
TripHistory {
  id: number;
  origin: string; destination: string;
  distanceKm: number; fareEstimate: number;
  modesUsed: string[];
  createdAt: string; // ISO8601
}
```
**Status codes:** 200, 401, 500  
*(POST /api/v1/me/trips already documented below — saves one trip, called only from the explicit "Save trip" action.)*

---

---

## POST /api/v1/routes/reroute

**Auth:** None  
**Body:**
```json
{
  "origin":        { "lat": number, "lng": number },
  "destination":   { "lat": number, "lng": number },
  "departAt":      "ISO8601 datetime (optional)",
  "preference":    "fastest | fewest_transfers | cheapest (optional)",
  "excludeLines":  [number],
  "excludeModes":  ["jeepney" | "bus" | "mrt" | "lrt"]
}
```
**Returns:** `{ "data": Itinerary[] }` — same shape as `/routes/plan`  
**Status codes:**
- 200 — alternatives found
- 400 — validation error (missing origin/destination, invalid coords)
- 404 — `no_route_found` — no alternative route after exclusions
- 429 — rate limited
- 500 — internal error

**Notes:**
- No Redis cache (reroutes are position-specific, reuse rate is near zero).
- `excludeLines` and `excludeModes` are validated but may both be empty arrays.
- Used by F13 (user-triggered disruption) and F15 (active trip tracking reroute).

---

## GET /api/v1/disruptions

**Auth:** None  
**Query params:** `?lineId=<number>` (optional — filter to a specific corridor)  
**Returns:** `{ "data": Disruption[] }`

```typescript
Disruption {
  id:          number;
  corridorId:  number;
  startAt:     string; // ISO8601
  endAt:       string | null;
  description: string;
}
```

**Status codes:** 200, 400 (invalid lineId), 500  
**Notes:** Only returns active disruptions where `start_at <= now AND (end_at IS NULL OR end_at > now)`. Falls back to empty array `[]` when DB is unconfigured.

---

## GET /api/v1/transport/options

**Auth:** None  
**Query params:** `?originLat=&originLng=&destLat=&destLng=` (all required)  
**Returns:** `{ "data": RideOption[] }`

```typescript
RideOption {
  provider:    string;
  fareMin:     number;   // PHP estimate — NOT an official or live quote
  fareMax:     number;
  etaMin:      number;   // minutes
  etaMax:      number;
  deepLink:    string;   // provider deep-link URL
  disclaimer:  string;   // must be shown in the UI alongside the fare
}
```

**Status codes:** 200, 400 (missing/invalid coords), 500  
**Hard rules (from §7.6 + §14):**
- `fareMin`/`fareMax` are distance-based **estimates only**. Never show them as official prices.
- The `disclaimer` string from each option **must** be rendered visibly in the UI.
- Deep-link opens in new tab; ParaPo never handles payment.
- No scraping of third-party pricing. Rates come from seeded `provider_fare_rules`.

---

## POST /api/v1/crowd-reports

**Auth:** Bearer token (required)
**Body:**
```json
{
  "stopId":   "number (optional)",
  "routeId":  "number (optional)",
  "category": "wrong_fare | wrong_stop | route_missing | other",
  "note":     "string, max 200 chars (optional)"
}
```
**Returns:** `{ "data": CrowdReport }`
**Status codes:** 201, 400, 401, 429, 500

**Notes:**
- The `crowd_reports` table predates this feature and only has `stop_id` /
  `route_id` / `crowding` / `note` columns — no dedicated issue-type column.
  Worse, the live `crowding` column has a DB CHECK constraint limited to
  `empty` / `moderate` / `packed` (confirmed by probing it directly; not
  captured in any migration — see `supabase/migrations/007_crowd_reports_own_only.sql`),
  so issue categories can't be stored there without schema-changing DDL this
  session couldn't run (PostgREST-only access, no SQL connection). The API
  therefore stores `category` as a `"[category] "` prefix on `note` server-side
  (`crowding` is always written as the inert filler `'moderate'`) and parses
  it back out on read — both directions handled in `app/api/v1/crowd-reports/route.ts`,
  entirely inside the API boundary. Clients only ever see `category` / `note`
  as separate fields. See `lib/validation.ts` (`IssueReportSchema`).
- `user_id` is set server-side from the authenticated session — never
  trusted from the request body.
- Rate limited (`crowdLimiter`, 5/min/user) per BASELINE §-referenced crowd
  endpoint budget.

---

## GET /api/v1/crowd-reports

**Auth:** Bearer token (required)
**Returns:** `{ "data": CrowdReport[] }` — the caller's own reports only, newest-first, max 50

```typescript
CrowdReport {
  id:        number;
  stopId:    number | null;
  routeId:   number | null;
  category:  string | null;
  note:      string | null;
  createdAt: string; // ISO8601
}
```
**Status codes:** 200, 401, 500

---

## GET /api/v1/station-accessibility

**Auth:** None
**Query params:** `?stopId=<number>` (optional — filter to one station)
**Returns:** `{ "data": StationAccessibility[] }`

```typescript
StationAccessibility {
  stopId:    number;
  feature:   "elevator" | "escalator";
  status:    "unknown" | "operational" | "out_of_service";
  note:      string | null;
  updatedAt: string; // ISO8601
}
```
**Status codes:** 200, 400 (invalid stopId), 500
**Notes:**
- Scoped to MRT-3 stations only (see `supabase/migrations/008_station_accessibility.sql`)
  — infrastructure for future real data; seed values are `'unknown'`, never
  a fabricated "operational".
- Falls back to `[]` if the table doesn't exist yet (not-yet-applied
  migration) or the DB is unconfigured — never a 500 for that case.

---

## PATCH /api/v1/admin/station-accessibility

**Auth:** Bearer token (required) **+** caller's email must be in the
`ADMIN_EMAILS` server env allowlist (comma-separated); everyone else gets
403. There's no roles table in this schema — this is deliberately the
simplest gate that isn't "anyone logged in."

**Body:**
```json
{
  "stopId":  number,
  "feature": "elevator" | "escalator",
  "status":  "unknown" | "operational" | "out_of_service",
  "note":    "string, max 200 chars (optional)"
}
```
**Returns:** `{ "data": StationAccessibility }`
**Status codes:** 200, 400, 401, 403, 500

---

## GET /api/v1/weather/advisory

**Auth:** None
**Returns:** `{ "data": RainAdvisory }`

```typescript
RainAdvisory {
  heavyRainExpected:      boolean;
  currentPrecipitationMm: number;
  maxProbabilityPercent:  number; // over the next 6 hours
  message:                string;
}
```
**Status codes:** 200, 429, (never 500 — see notes)
**Notes:**
- Backed by Open-Meteo (no API key), fixed to a single Metro-Manila-wide
  point — one citywide advisory, not per-station. See `lib/weather.ts`.
- Cached in Redis 10 min (`weather:v1:metro-manila-advisory`); degrades to
  an uncached direct fetch when Redis is unset.
- If Open-Meteo is unreachable, returns `heavyRainExpected: false` rather
  than an error — this is a planner-screen nudge, not a critical path.

---

## Planned (not yet implemented)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET  | /api/v1/analytics/od-pairs | None | Top origin-destination pairs (F8) |
| GET  | /api/v1/analytics/peak-demand | None | Hour-by-hour demand (F8) |
