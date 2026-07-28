# ParaPo — Next Feature Roadmap (paste into Claude Code)

Paste everything below the line into a Claude Code terminal session to
implement the next round of features.

---

I'm working on ParaPo, a Metro Manila commuter transit app (Next.js 16 App
Router + TypeScript, Supabase Postgres/PostGIS, Upstash Redis, Leaflet maps).
Canonical spec is BASELINE.md and AGENTS.md/CLAUDE.md at the repo root —
read those first, and follow their hard boundaries (service-role key
server-only, single /api/v1/* boundary, pure lib/routing/ engine, RLS on
every table, no hardcoded secrets).

Product direction: we're narrowing scope to be the BEST possible planner for
Metro Manila rail (MRT-3, LRT-1, LRT-2) and the EDSA Carousel bus, rather
than pretending to cover all jeepney routes (that data doesn't exist in a
clean, complete form anywhere — not our gap to solve today). Jeepneys stay
in the app, but are treated as free-schedule legs with no fake time
predictions, not omitted.

Existing structure to know before you start:
- lib/routing/ — pure A* multimodal engine (graph.ts, engine.ts, fares.ts,
  types.ts). Per-line fare rules already implemented (LRT-1 undiscounted,
  MRT-3/LRT-2 with the 2026 DOTr 50% discount).
- supabase/migrations/ + supabase/seed/ — schema and seed data, numbered
  sequentially. corridors/stops/routes/route_stops/fares tables exist.
  service_disruptions table exists (F13) but has no real data source.
  crowd_reports table exists in schema but is COMPLETELY UNUSED by the app.
- app/planner/page.tsx — main planner UI (cream+cobalt design tokens in
  app/globals.css, Baloo 2 display font, no Tailwind — inline styles + CSS
  vars only).
- app/trip/page.tsx + lib/trip/context.tsx — live GPS trip companion,
  already has position tracking, auto-advance, wake lock, accuracy
  filtering, reroute-on-disruption.
- app/api/v1/disruptions/route.ts — reads service_disruptions table.
- docs/api-contracts.md — keep this updated; add new endpoint contracts
  here BEFORE writing the handler, per project convention.

Work through these in order, doing each as a complete vertical slice
(schema/data → API → UI → tests) before moving to the next. Run
`npm run verify` after each slice and keep it green. Commit logically as
you go.

## Phase 1 — Complete rail + EDSA data quality

1. Fill in the full EDSA Carousel bus route (~24 real stations, southbound
   and northbound) in a new supabase/seed file — replace the current
   single-corridor demo data. Verify real EDSA Carousel stop names/order
   (search if needed) rather than guessing.
2. Add a "last train" awareness: rail lines close nightly (MRT-3 ~10:30 PM,
   LRT-1/LRT-2 similar — verify current official closing times). If a
   planned itinerary's rail leg would board after closing, or the trip
   won't finish before closing, show a clear warning on the route card/
   detail screen ("Last train has left" / "You'll just make the last
   train — boards at 10:15 PM").
3. Add a "I have a Beep card" toggle in the planner that adjusts fare
   display for card vs. single-journey ticket pricing (verify current
   Beep vs. cash fare differences for MRT-3/LRT-1/LRT-2 — they differ
   slightly). Persist the toggle preference in localStorage.

## Phase 2 — Jeepney honesty + community input

4. For itineraries where a walking gap could plausibly be covered by a
   known nearby jeepney corridor, but we don't have route-level data,
   render a distinct "Suggested — ask a jeepney toward X" card instead of
   a routed leg: no fake time/stop count, just direction + approximate
   fare range + a clear "not a tracked route" label.
5. Build a lightweight crowd-sourcing flow using the existing (currently
   unused) crowd_reports table: a "Report an issue" button on route detail
   and trip screens (wrong fare, wrong stop location, route doesn't exist)
   that POSTs to a new /api/v1/crowd-reports endpoint (add the contract to
   docs/api-contracts.md first). No admin UI needed yet — just capture the
   reports correctly with RLS so users can see their own submissions.

## Phase 3 — Trip companion polish

6. Add a "next stop approaching" browser Notification (with permission
   prompt) and vibration (navigator.vibrate) when within ~300m of the next
   stop during an active trip, in addition to the existing UI update.
   Respect notification permission state gracefully if denied.
7. Make the active trip resilient to signal loss (MRT tunnels kill GPS/
   data): cache the last-known position and itinerary state so the UI
   doesn't blank or error when fetches fail transiently; resume cleanly
   when connectivity returns. Don't silently advance legs from stale data.
8. For rail stations with multiple named entrances/exits (if we have that
   data — check the stops table; if not, this can be scoped to just MRT-3
   stations where it matters most), point the final walking leg to the
   entrance/exit nearest the destination rather than a generic station
   centroid.

## Phase 4 — Extras (do these last, lower priority)

9. Elevator/escalator status per rail station: add an `elevator_status`
   or similar field to stops (or a small new table), admin-editable via a
   simple internal page (behind auth), surfaced as a small icon/note on
   the station in route detail. Seed with "unknown" / "operational" for
   now — this is infrastructure for future real data, not fake status.
10. Rain/flood advisory banner: integrate a free weather API (e.g.
    Open-Meteo, no key required) to show a "heavy rain expected — jeepney/
    bus delays likely, consider rail" nudge on the planner home screen
    when current Metro Manila conditions warrant it.
11. Multi-stop trip chaining: let a user add a second destination after
    planning the first leg, producing a combined itinerary view (can reuse
    the existing planner search twice and stitch results — doesn't need
    engine changes).
12. Filipino/Taglish UI toggle for key strings (e.g. "Sakay dito," "Bumaba
    sa," "Maghintay ng jeep") — a simple i18n string map is enough, no
    full i18n library needed for this scope.
13. On the disruption banner, add a "Report to LTFRB/MMDA" link using their
    real current hotline/complaint channel (verify the current official
    link/number before hardcoding it).

Throughout: keep the cream+cobalt design system (no Tailwind, inline
styles + CSS vars from app/globals.css), keep GPS privacy rules from
BASELINE.md §7.7 (opt-in, foreground-only, never persisted raw), and keep
fare disclaimers wherever estimates appear. Update docs/production.md and
docs/api-contracts.md as you add real functionality. End with a
npm run verify PASS and a summary of what shipped vs. what's still open.
