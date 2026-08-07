# RoutaPH

**Live: [parapo-chi.vercel.app](https://parapo-chi.vercel.app)** — free, no sign-up, works on any phone browser.

A commute planner for Metro Manila that actually routes across the whole
system — MRT, LRT, bus corridors, and jeepneys — instead of pretending only
rail exists or wrapping Google Directions. Built from scratch: real fare
math per LTFRB/DOTr 2026 rates, a routing engine that knows the difference
between a scheduled train and a jeepney with no fixed timetable, and live
GPS trip tracking that a rider can actually follow underground or on a
signal-poor jeepney ride.

## What it does

- **Plan a trip** — pick two stops (or drop a pin anywhere on the map) and
  get real routed itineraries across rail, bus, and jeepney, ranked by
  fastest / fewest transfers / cheapest, with a full fare breakdown per leg.
- **Live trip tracking** — once you start a trip, RoutaPH follows your GPS,
  auto-advances to the next leg as you approach each stop, and tells you
  when to get off — without you having to keep checking the screen.
- **Disruption-aware rerouting** — if a line goes down mid-trip, tap "I'm
  stuck" and it replans instantly from your current location, and also
  surfaces ride-hailing fare estimates as a fallback (estimate only, never
  a live price, never processes payment).
- **Honest jeepney handling** — traditional jeepneys have no fixed schedule
  and no fixed stops. RoutaPH never fabricates an ETA for one; it shows a
  fare range and a real corridor instead of pretending to know an arrival
  time nobody could know.
- **No accounts, no tracking of you** — there is no login. Nothing you
  search is tied to an identity. The only thing ever written to the
  database is an anonymised, geohashed search log used to see which routes
  people actually search for — never your name, never a raw GPS trace.
- Works offline-ish: once loaded, a lost signal (a tunnel, a weak jeepney
  ride) doesn't kill an active trip — progress and the map keep working
  from what's already cached.

## Try it

Just open **[parapo-chi.vercel.app](https://parapo-chi.vercel.app)** — that's
the whole install process. Optionally, "Add to Home Screen" from your
phone's browser menu to make it feel like a native app icon.

## Stack

Next.js 16 (App Router) · TypeScript · Supabase (Postgres + PostGIS) ·
Upstash Redis (rate limiting) · Leaflet / MapLibre (map rendering,
WebGL with a flat-tile fallback) · Vitest (unit + API contract tests) ·
Sentry (error monitoring) · Vercel (hosting)

The routing engine (`lib/routing/`) is a pure module — zero imports from
Next.js, Supabase, or Redis — so it's unit-testable in complete isolation
from the framework around it. It's a from-scratch time-dependent A* search
across a real transit graph, not a wrapper around a third-party directions
API.

## Data

Route and stop data for MRT-3, LRT-1, LRT-2, EDSA Carousel, and several
jeepney/bus corridors is imported from OpenStreetMap (© OpenStreetMap
contributors, ODbL) and cross-checked against LTFRB memorandum circulars.
Fare rules are sourced from published 2026 LTFRB/DOTr rates — see
`supabase/seed/` and `supabase/migrations/` for the sourcing notes on each
import.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Upstash credentials
npm run dev                  # http://localhost:3000
```

```bash
npm run verify   # lint + typecheck + test + build + audit + migration check
```

See `AGENTS.md` for the full contributor rules and `BASELINE.md` for the
canonical technical spec.
