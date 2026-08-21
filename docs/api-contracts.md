# ParaPo — API Contracts

> Last verified from code: 2026-07-26

All responses use the standard envelope:

| Shape | Format |
|---|---|
| Success | `{ "data": <payload> }` |
| List | `{ "data": [...], "page": { "cursor": "...", "hasMore": true } }` |
| Error | `{ "error": { "code": "snake_case", "message": "Human string", "details": {} } }` |

The app has no accounts — every endpoint below is anonymous (no
`Authorization` header). ParaPo's scope is directions, fares, ETA, and live
GPS trip tracking; there is no login, saved commutes, or trip history.

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

**Auth:** None — the app has no accounts; submissions are anonymous.
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
**Status codes:** 201, 400, 429, 500

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
- Writes go through the service-role key, so RLS never blocks the insert;
  `supabase/migrations/009_anonymous_app_no_auth.sql` (not yet applied) makes
  `user_id` nullable and adds an anon-insert policy as defense-in-depth for
  direct anon-key access. `user_id` is always `null` — there is no session to
  attach one to.
- Rate limited (`crowdLimiter`, 5/min/IP) — no per-user key without accounts.
- No GET: reports were never surfaced back to the submitter, and without
  accounts there's no "your reports" to scope a read to.

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

## POST /api/v1/live/ping

**Auth:** None
**Body:**

```typescript
{
  lineId:    number;  // corridor the rider is currently aboard
  riderKey:  string;  // 16–64 char ephemeral random token, regenerated per trip
  lat:       number;  // -90..90
  lng:       number;  // -180..180
  accuracyM: number;  // GPS accuracy in metres; > 150 is rejected
}
```

**Returns:** `{ "data": { "accepted": boolean } }`
**Status codes:** 202 (accepted), 400 (validation), 429, 503 (Redis unset)
**Notes:**
- Opt-in only. The trip screen never sends a ping unless the rider has
  explicitly enabled "Share my position" for that trip.
- `riderKey` is a random token generated client-side per trip and thrown
  away when the trip ends. It is not an account, device, or session ID and
  is never linked to anything. Its only purpose is inferring travel
  direction from a rider's own two most recent pings.
- **Nothing is written to Postgres.** Pings live only in Redis under
  `live:v1:line:<lineId>` (sorted set, score = epoch ms) and
  `live:v1:rider:<riderKey>`, both with a 180 s TTL. Raw positions expire on
  their own; there is no retention, export, or backup path. This preserves
  BASELINE §7.7 ("raw GPS traces are never persisted") — Redis holds a
  3-minute rolling window, not a trace.
- Low-quality fixes (`accuracyM > 150`) are rejected rather than stored,
  so a 500 m urban-canyon reading can't drag a vehicle estimate off-line.
- Rate limited by `liveLimiter` (120/min per IP), not the much tighter
  `crowdLimiter`. A rider pings roughly 4×/min for the length of a ride and
  PH mobile carriers put many riders behind one CGNAT address, so an IP
  here is closer to a neighbourhood than a person.
- `{ accepted: false }` is a normal, non-error outcome: the first ping of a
  trip has no previous position to infer direction from, and pings on an
  untracked mode or too far from the line are dropped the same way.

---

## GET /api/v1/live/vehicles

**Auth:** None
**Query:** `lineId` (optional, positive int — omit for all tracked lines)
**Returns:** `{ "data": VehicleEstimate[] }`

```typescript
VehicleEstimate {
  lineId:      number;
  lineName:    string;
  mode:        "mrt" | "lrt" | "bus";
  direction:   "forward" | "backward";
  lat:         number;
  lng:         number;
  nearStopId:  number;
  nearStopName: string;
  riderCount:  number;  // how many pings back this estimate
  confidence:  "low" | "medium" | "high";
  updatedAt:   string;  // ISO8601 of the newest ping in the cluster
}
```

**Status codes:** 200, 400 (invalid lineId), 429
**Notes:**
- **Crowdsourced, not an official feed.** No Philippine transit operator
  publishes a real-time vehicle feed, so positions are estimated purely
  from opted-in riders' phones. Every UI surface must label them as
  estimates from riders, never as official positions.
- Rail and the EDSA Carousel only. Jeepneys are excluded on purpose:
  their routes overlap heavily on shared roads, so a ping can't be
  attributed to a specific jeepney route honestly.
- Returns `[]` when no fresh pings exist — the map shows nothing rather
  than a simulated vehicle. Pings older than 120 s are ignored entirely.
- `confidence` is `low` for a single rider, `medium` for 2–3, `high` for 4+.
- Estimation logic lives in `lib/live/estimate.ts` (pure module, no
  Next/Supabase/Redis imports — same rule as `lib/routing/`).

---

## GET /api/v1/geo/reverse

**Auth:** None
**Query:** `lat` (-90..90, required), `lng` (-180..180, required)
**Returns:** `{ "data": ReverseGeocode }`

```typescript
ReverseGeocode {
  label:     string;        // "2296 Chino Roces Ave, Makati City"
  fullLabel: string;        // the complete address line as returned
  lat:       number;        // echoed back, rounded to the cache grid
  lng:       number;
  source:    "osm" | "coords";
}
```

**Status codes:** 200, 400 (validation), 429
**Notes:**
- Backs the drop-a-pin location picker: a rider chooses a point on the map
  and needs to see a street address rather than a decimal pair.
- Server-side only, so the Nominatim usage policy can actually be honoured:
  a real identifying `User-Agent` (`GEOCODER_USER_AGENT`), one request per
  second at most, and no bulk querying. A browser-side call could satisfy
  none of that, and it would also breach the single-API-boundary rule.
- Results are cached in Redis for 30 days keyed to a ~11 m coordinate grid
  (5 decimal places). Street addresses effectively never change, and the
  cache is what keeps us inside the rate limit.
- **Never errors on a geocoding failure.** If Nominatim is unreachable,
  rate-limited, or has nothing at the point, it returns
  `source: "coords"` with the coordinates formatted as the label. A rider
  who dropped a pin still gets a usable, if unlovely, destination.
- Attribution: address data © OpenStreetMap contributors (ODbL). The picker
  UI carries the credit, matching the existing map attribution.

---

## GET /api/v1/geo/search

**Auth:** None
**Query:** `q` (string, 3-120 chars, required)
**Returns:** `{ "data": ForwardGeocodeResult[] }`

```typescript
ForwardGeocodeResult {
  label: string;   // "2296 Chino Roces Ave, Makati City"
  lat:   number;
  lng:   number;
}
```

**Status codes:** 200, 400 (validation), 429
**Notes:**
- Backs typed address search in the From/To fields, so a trip can start or
  end anywhere - a house, a mall, a landmark - not only a named transit
  stop. Complements (does not replace) drop-a-pin: this is forward search
  (text to place), the pin picker is reverse (point to address).
- Same server-only rationale as `/api/v1/geo/reverse`: a real
  `GEOCODER_USER_AGENT`, Nominatim's rate limit, and the single-API-boundary
  rule all require this not to be called from the client.
- Queries are biased and bounded to a Metro Manila viewbox so "Manila"-named
  places elsewhere in the world don't surface.
- Results are cached in Redis for 30 days keyed to the lowercased query
  text - repeated searches (a common street, a mall name) don't re-hit
  Nominatim.
- Returns an empty array rather than an error on a geocoding hiccup or a
  missing `GEOCODER_USER_AGENT` - the search box just shows no results
  rather than breaking the form.
- Attribution: address data © OpenStreetMap contributors (ODbL).

---

## Planned (not yet implemented)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET  | /api/v1/analytics/od-pairs | None | Top origin-destination pairs (F8) |
| GET  | /api/v1/analytics/peak-demand | None | Hour-by-hour demand (F8) |
