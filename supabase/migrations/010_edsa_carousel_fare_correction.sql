-- 010: correct the EDSA Carousel fare rule (2026-08-02)
--
-- WHY
-- Migration 006 filed route 1 (EDSA Carousel) under the general LTFRB
-- "A/C city bus" fare hike (base P15 -> P18, effective 2026-03-19) without
-- a source specific to the Carousel itself. Checked against two
-- independent, dated public sources for the Carousel's actual matrix:
--
--   - https://edsacarousel.ph/bus-fare/ (2026): minimum P15 for the first
--     4 km, then P2.65/km. Maximum end-to-end (Monumento <-> PITX) is
--     P75.50 southbound, P73 northbound.
--   - https://www.topgear.com.ph (2025-10-22): "starting at P15 for
--     regular fares", maximum end-to-end "P74.50".
--
-- Both put the minimum at P15, not P18, and both independently land within
-- about a peso of a P74.50-75.50 ceiling for the full corridor. Neither
-- source is an LTFRB memorandum circular itself, so this is "two
-- consistent secondary sources", not primary regulatory text, and should
-- be revisited if a circular number surfaces. It is still a strictly
-- better source than the unsourced assumption it replaces.
--
-- This also explains a real bug: without a route-specific ceiling, the
-- engine's base+per-km approximation ran the full 27.9 km corridor out to
-- ~P90 (using the wrong P18/P2.98 rule with no cap at all) -- well past
-- what the operator can actually charge. Same failure mode migration 007
-- already fixed for MRT-3/LRT-2/LRT-1; the fix here is identical.
--
-- fares is append-only (INSERT, never UPDATE) so the graph loader's
-- newest-effective-on-wins logic naturally supersedes the 006 row without
-- deleting history.
--
-- Idempotent: safe to re-run.

INSERT INTO fares (route_id, base_fare, per_km, effective_on)
SELECT * FROM (VALUES
  (1, 15.00, 2.65, DATE '2026-08-02')  -- EDSA Carousel, corrected
) AS f(route_id, base_fare, per_km, effective_on)
WHERE NOT EXISTS (
  SELECT 1 FROM fares x
  WHERE x.route_id = f.route_id AND x.effective_on = f.effective_on
);
