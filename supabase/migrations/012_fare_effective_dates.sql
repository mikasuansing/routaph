-- 012: correct the effective date of the 2026 LTFRB road fare hike (2026-09-29)
--
-- Migration 006 dated the road fares 2026-03-19, when the hike was announced.
-- It was suspended by the President amid the fuel crisis and only took effect
-- on 2026-09-28 (Philstar 2026-09-27, Top Gear 2026-09-28; news coverage, not
-- the LTFRB circular). Rail dates in 006 are right: the MRT-3/LRT-2 50%
-- discount began 2026-03-23 and is ongoing with no announced end date.
--
-- WHAT THIS DOES
--   Adds a row dated 2026-09-28 for route 2 (Katipunan jeepney, traditional:
--   P14 for 4 km, P2.00/km). The graph loader picks the newest row per route,
--   so quoted fares do not change; the date is now truthful.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - It does not invent the pre-hike rows for 2026-03-19..2026-09-27. The
--   old per-km rate was never sourced, and fares is append-only history.
--   - It does not touch route 1 (EDSA Carousel). Migration 010 set it to
--   P15 + P2.65/km from two sources that predate the hike, and whether the
--   Carousel moved on 2026-09-28 is unconfirmed. Do not guess.
--   - It does not add ordinary bus, modern jeepney or UV Express fares:
--   those need a per-route service class first (BASELINE.md 7.4).
--
-- Idempotent: safe to re-run.

INSERT INTO fares (route_id, base_fare, per_km, effective_on)
SELECT * FROM (VALUES
  (2, 14.00, 2.00, DATE '2026-09-28')  -- Katipunan jeepney (traditional), hike in force
) AS f(route_id, base_fare, per_km, effective_on)
WHERE NOT EXISTS (
  SELECT 1 FROM fares x
  WHERE x.route_id = f.route_id AND x.effective_on = f.effective_on
);
