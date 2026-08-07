-- 006: 2026 fare rates (verified against LTFRB/DOTr news coverage, 2026-07-08)
--
-- Two regulatory changes supersede the 2024 rates:
--   * LTFRB fare hike effective 2026-03-19 — traditional jeepney min ₱13→₱14
--     (₱2.00/km after 4 km); A/C city bus min ₱15→₱18 (₱2.98/km after 5 km);
--     TNVS sedan base component +₱20.
--   * DOTr 50% fare discount on MRT-3 and LRT-2 effective 2026-03-23 —
--     MRT-3 ₱6 min (~₱0.48/km, ₱6–₱14 matrix); LRT-2 ₱8 min (~₱0.46/km,
--     ₱8–₱18 matrix). LRT-1 (LRMC-operated) is NOT covered by the discount
--     and keeps its own matrix: ₱16.25 boarding + ₱1.47/km (₱15–₱30).
--
-- The `fares` table is route-scoped and dated; we INSERT new rows rather than
-- overwrite, and lib/supabase/graph-loader.ts picks the newest row per route.
-- Route ids: 1 = EDSA Carousel (bus), 2 = Katipunan (jeepney), 3 = MRT-3,
--            4 = LRT-2, 5 = LRT-1.
--
-- Idempotent: safe to re-run.

INSERT INTO fares (route_id, base_fare, per_km, effective_on)
SELECT * FROM (VALUES
  (1, 18.00, 2.98, DATE '2026-03-19'),  -- EDSA Carousel (A/C city bus)
  (2, 14.00, 2.00, DATE '2026-03-19'),  -- Katipunan jeepney (traditional)
  (3,  6.00, 0.48, DATE '2026-03-23'),  -- MRT-3 (50% DOTr discount)
  (4,  8.00, 0.46, DATE '2026-03-23'),  -- LRT-2 (50% DOTr discount)
  (5, 16.25, 1.47, DATE '2025-04-02')   -- LRT-1 (LRMC matrix, not discounted)
) AS f(route_id, base_fare, per_km, effective_on)
WHERE NOT EXISTS (
  SELECT 1 FROM fares x
  WHERE x.route_id = f.route_id AND x.effective_on = f.effective_on
);

-- Remove fictional placeholder rows for routes 1 (bus) and 2 (jeepney): the
-- initial project seed stamped them with the setup date 2026-06-19 and pre-hike
-- values (₱15 / ₱13). That date is LATER than the real 2026-03-19 hike, so the
-- graph loader (newest effective_on wins) picked the wrong fare. These rows were
-- never a real fare event, so drop them.
DELETE FROM fares
WHERE route_id IN (1, 2) AND effective_on = DATE '2026-06-19';

-- Ride-hailing estimate (ESTIMATE ONLY — disclaimer stays mandatory in the
-- API): TNVS sedan base fare component raised ₱20 by the same LTFRB ruling.
UPDATE provider_fare_rules pfr SET base_fare = 125.00
  FROM ride_providers rp
  WHERE pfr.provider_id = rp.id AND rp.name = 'Grab Car' AND pfr.base_fare < 125.00;
