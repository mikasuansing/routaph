-- Seed: full EDSA Carousel bus route (2026-07-26)
--
-- Replaces the 8-stop demo subset seeded in the initial project setup
-- (corridor 1, route 1) with the real EDSA Carousel station list,
-- Monumento <-> PITX, verified against edsacarousel.ph / Wikipedia
-- (2026-07). The engine builds ride edges in both directions from a
-- single ordered stop sequence (lib/routing/graph.ts), so one route row
-- already serves northbound and southbound travel — matching the
-- established MRT-3 / LRT-1 / LRT-2 pattern of one route per corridor.
--
-- Station coordinates are approximate (demo fidelity, consistent with
-- every other seed file) — cross-checked against OpenStreetMap Nominatim
-- where a landmark match existed. Several stops (North Avenue, Quezon
-- Avenue, Nepa Q-Mart, Buendia) are deliberately placed within the
-- engine's 500 m transfer radius of the same-named MRT-3 station they
-- sit beside in real life, so the planner offers a walking transfer —
-- the same behavior already relied on for the Ayala/Guadalupe stops
-- reused below.
--
-- New stops are inserted WITHOUT explicit ids (`stops.id` is
-- GENERATED ALWAYS — unlike the earlier seed files, this one is written
-- to be appliable through a plain SQL runner without OVERRIDING SYSTEM
-- VALUE). route_stops is wired up by name lookup instead of hardcoded
-- ids, so this file is idempotent and re-runnable regardless of which
-- ids the identity sequence actually assigns.
--
-- Reuses existing stops 1/Monumento, 2/Balintawak, 3/Kamuning,
-- 4/Cubao (renamed "Main Avenue (Cubao)" below), 5/Ortigas,
-- 6/Guadalupe, 7/Ayala, 8/Taft Ave at their original sequence position.
-- Taft Ave (id 8) gets a corrected geom — its original coordinates
-- (14.5545, 120.9942) sat north of Ayala, which broke the route's
-- south-bound geography; real EDSA Carousel's Taft stop sits at the
-- MRT-3 Taft Avenue interchange.
--
-- Known gap: eta_predictions has 1000 synthetic rows keyed to route 1's
-- OLD 8-stop from_seq/to_seq pairs. That table isn't read by any app
-- code today (grep confirms), so this seed leaves it untouched rather
-- than fabricating 24-stop synthetic predictions — regenerating it is a
-- separate task if eta_predictions ever gets wired up.
--
-- Idempotent: safe to re-run.

-- ── New stops (16) — inserted only if a stop with that name doesn't exist ──
INSERT INTO stops (name, geom)
SELECT v.name, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)
FROM (VALUES
  ('Bagong Barrio',          120.9976, 14.6573),
  ('Kaingin Road',           121.0111, 14.6569),
  ('Roosevelt',              121.0211, 14.6576),
  ('SM North EDSA',          121.0313, 14.6571),
  ('North Avenue (Bus)',     121.0322, 14.6521),
  ('Philam',                 121.0345, 14.6480),
  ('Quezon Avenue',          121.0403, 14.6449),
  ('Nepa Q-Mart',            121.0470, 14.6284),
  ('Santolan (EDSA)',        121.0542, 14.6108),
  ('Buendia (Bus)',          121.0347, 14.5536),
  ('Tramo',                  121.0010, 14.5300),
  ('Roxas Boulevard',        120.9930, 14.5370),
  ('SM Mall of Asia',        120.9816, 14.5352),
  ('DFA (Aseana)',           120.9881, 14.5280),
  ('Ayala Malls Manila Bay', 120.9881, 14.5234),
  ('PITX',                   120.9914, 14.5100)
) AS v(name, lng, lat)
WHERE NOT EXISTS (SELECT 1 FROM stops s WHERE s.name = v.name);

-- ── Fix Taft Ave (id 8): was geographically north of Ayala, wrong for a
--    southbound route toward PITX. Align with the real MRT-3 interchange.
UPDATE stops SET geom = ST_SetSRID(ST_MakePoint(120.9980, 14.5390), 4326)
WHERE name = 'Taft Ave';

-- Stop 4's real name was "Cubao" (set in the original seed); the EDSA
-- Carousel's official name for this stop is "Main Avenue" (the busway
-- platform sits at EDSA cor. Main Ave). Relabel it so the planner picker
-- shows the name commuters actually see on-site.
UPDATE stops SET name = 'Main Avenue (Cubao)' WHERE name = 'Cubao';

-- ── Corridor / route naming: one bidirectional route, not "Southbound" ──────
UPDATE corridors SET description = 'EDSA median busway + airport road extension, Monumento to PITX'
WHERE id = 1;

UPDATE routes SET name = 'EDSA Carousel (Monumento <-> PITX)'
WHERE id = 1;

-- ── Full 24-station sequence (replaces the old 8-stop demo order) ──────────
DELETE FROM route_stops WHERE route_id = 1;

-- "Guadalupe" and "Ayala" are intentionally reused (not renamed): they're
-- real bus stops at the same MRT-3 interchange, so those two names each
-- match two rows (the MRT-3 stop and this bus stop) — not unique enough
-- to join by name. Address them by their known stop id instead (6 and 7,
-- the original demo corridor's Guadalupe/Ayala rows).
INSERT INTO route_stops (route_id, stop_id, seq)
SELECT 1, stops.id, v.seq
FROM (VALUES
  ('Monumento',              1),
  ('Bagong Barrio',          2),
  ('Balintawak',             3),
  ('Kaingin Road',           4),
  ('Roosevelt',              5),
  ('SM North EDSA',          6),
  ('North Avenue (Bus)',     7),
  ('Philam',                 8),
  ('Quezon Avenue',          9),
  ('Kamuning',               10),
  ('Nepa Q-Mart',            11),
  ('Main Avenue (Cubao)',    12),
  ('Santolan (EDSA)',        13),
  ('Ortigas',                14),
  ('Buendia (Bus)',          16),
  ('Tramo',                  18),
  ('Taft Ave',               19),
  ('Roxas Boulevard',        20),
  ('SM Mall of Asia',        21),
  ('DFA (Aseana)',           22),
  ('Ayala Malls Manila Bay', 23),
  ('PITX',                   24)
) AS v(name, seq)
JOIN stops ON stops.name = v.name
UNION ALL
SELECT 1, 6, 15  -- Guadalupe (bus stop)
UNION ALL
SELECT 1, 7, 17; -- Ayala (bus stop)
