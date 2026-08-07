-- Seed 008: LTFRB Route 3 — Antipolo–Quiapo via Aurora Boulevard (2026-07-31)
--
-- WHY
-- The network had exactly one bus corridor (EDSA Carousel) and one jeepney
-- corridor (4 stops in Katipunan), so any trip the rail lines didn't cover
-- returned nothing — the planner looked broken when it was simply empty.
-- Route 3 is the first road corridor imported from real survey data. It runs
-- parallel to LRT-2 and continues past Antipolo station into Rizal, so it
-- gives most of the LRT-2 corridor a genuine second option.
--
-- SOURCE
-- OpenStreetMap relation 8906890 (outbound, Antipolo -> Quiapo), read in
-- relation-member order. © OpenStreetMap contributors, ODbL
-- (https://www.openstreetmap.org/copyright). Authority for the route itself
-- is LTFRB MC 2020-019; operator Mega Manila Consortium Corporation.
--
-- MODELING NOTES
-- - Imported as ONE sequence. The routing engine builds edges both ways from
--   a single stop order, so importing the inbound relation as its own line
--   would duplicate the corridor and invent transfers between it and itself.
-- - OSM suffixes stop names " 1"/" 2" for the two sides of the road; that is
--   the same place to a commuter, so the suffix is stripped.
-- - mode 'bus': this is a modernised PUB under a franchised route, not a
--   traditional jeepney. It publishes a headway (30 min, 15 min peak) and
--   service hours (05:25-03:45), so an ETA here is honest.
--
-- 42 stops, 27 km. Idempotent: safe to re-run.

BEGIN;

INSERT INTO corridors (id, name, mode, description, color) OVERRIDING SYSTEM VALUE VALUES
  (6, 'Route 3 (Aurora Blvd)', 'bus', 'LTFRB Route 3: Antipolo to Quiapo via Aurora Boulevard', '#C2410C')
ON CONFLICT (id) DO NOTHING;

INSERT INTO routes (id, corridor_id, name, direction) OVERRIDING SYSTEM VALUE VALUES
  (6, 6, 'Route 3 - Antipolo to Quiapo', 'outbound')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stops (id, name, geom) OVERRIDING SYSTEM VALUE VALUES
  (501, 'Robinsons Place Antipolo', ST_SetSRID(ST_MakePoint(121.172412, 14.594111), 4326)),
  (502, 'Olalia Road', ST_SetSRID(ST_MakePoint(121.172952, 14.606704), 4326)),
  (503, 'Cloud 9', ST_SetSRID(ST_MakePoint(121.154585, 14.612892), 4326)),
  (504, 'Our Lady of Fatima University', ST_SetSRID(ST_MakePoint(121.151106, 14.619117), 4326)),
  (505, 'XentroMall Antipolo', ST_SetSRID(ST_MakePoint(121.135769, 14.617214), 4326)),
  (506, 'Masinag', ST_SetSRID(ST_MakePoint(121.123084, 14.625341), 4326)),
  (507, 'LRT Antipolo Station', ST_SetSRID(ST_MakePoint(121.120322, 14.624875), 4326)),
  (508, 'AMA East Rizal Campus', ST_SetSRID(ST_MakePoint(121.116246, 14.623946), 4326)),
  (509, 'Narra Village', ST_SetSRID(ST_MakePoint(121.106624, 14.621925), 4326)),
  (510, 'LRT Marikina-Pasig Station', ST_SetSRID(ST_MakePoint(121.100971, 14.620699), 4326)),
  (511, 'Ayala Malls Feliz', ST_SetSRID(ST_MakePoint(121.093589, 14.619266), 4326)),
  (512, 'LRT Santolan Station', ST_SetSRID(ST_MakePoint(121.086864, 14.622068), 4326)),
  (513, 'SM City Marikina', ST_SetSRID(ST_MakePoint(121.084138, 14.624701), 4326)),
  (514, 'Barangka', ST_SetSRID(ST_MakePoint(121.079531, 14.630057), 4326)),
  (515, 'Katipunan Flyover', ST_SetSRID(ST_MakePoint(121.074962, 14.632278), 4326)),
  (516, 'LRT Katipunan Station', ST_SetSRID(ST_MakePoint(121.072720, 14.631174), 4326)),
  (517, 'J. P. Rizal Street', ST_SetSRID(ST_MakePoint(121.068659, 14.629217), 4326)),
  (518, 'LRT Anonas Station', ST_SetSRID(ST_MakePoint(121.063897, 14.627965), 4326)),
  (519, 'La Salle Street', ST_SetSRID(ST_MakePoint(121.059703, 14.626260), 4326)),
  (520, 'Miami Street', ST_SetSRID(ST_MakePoint(121.057881, 14.625362), 4326)),
  (521, 'LRT Araneta Center-Cubao Station', ST_SetSRID(ST_MakePoint(121.052448, 14.622738), 4326)),
  (522, 'Aurora–N. Domingo', ST_SetSRID(ST_MakePoint(121.046309, 14.620216), 4326)),
  (523, 'LRT Betty Go-Belmonte Station', ST_SetSRID(ST_MakePoint(121.042689, 14.618705), 4326)),
  (524, 'Robinsons Magnolia', ST_SetSRID(ST_MakePoint(121.038056, 14.615901), 4326)),
  (525, 'St. Paul University', ST_SetSRID(ST_MakePoint(121.036447, 14.614948), 4326)),
  (526, 'LRT Gilmore Station', ST_SetSRID(ST_MakePoint(121.034144, 14.613663), 4326)),
  (527, 'LRT J. Ruiz Station', ST_SetSRID(ST_MakePoint(121.026659, 14.610822), 4326)),
  (528, 'UE Ramon Magsaysay Campus', ST_SetSRID(ST_MakePoint(121.020759, 14.607885), 4326)),
  (529, 'SM City Santa Mesa', ST_SetSRID(ST_MakePoint(121.017997, 14.605197), 4326)),
  (530, 'LRT V. Mapa Station', ST_SetSRID(ST_MakePoint(121.016664, 14.603861), 4326)),
  (531, 'Magsaysay–V. Mapa Intersection', ST_SetSRID(ST_MakePoint(121.015146, 14.602758), 4326)),
  (532, 'Old Santa Mesa Street', ST_SetSRID(ST_MakePoint(121.011029, 14.602395), 4326)),
  (533, 'Civil Registration Central Outlet', ST_SetSRID(ST_MakePoint(121.003777, 14.601692), 4326)),
  (534, 'M. Jhocson Street', ST_SetSRID(ST_MakePoint(120.995387, 14.600841), 4326)),
  (535, 'LRT Legarda Station', ST_SetSRID(ST_MakePoint(120.992220, 14.601388), 4326)),
  (536, 'Recto–Mendiola', ST_SetSRID(ST_MakePoint(120.990595, 14.599973), 4326)),
  (537, 'Tanduay-NTC', ST_SetSRID(ST_MakePoint(120.989631, 14.597936), 4326)),
  (538, 'TIP P. Casal Campus', ST_SetSRID(ST_MakePoint(120.989054, 14.595865), 4326)),
  (539, 'Philippine Normal University', ST_SetSRID(ST_MakePoint(120.983236, 14.586905), 4326)),
  (540, 'Liwasang Bonifacio', ST_SetSRID(ST_MakePoint(120.980799, 14.591065), 4326)),
  (541, 'Lawton', ST_SetSRID(ST_MakePoint(120.980154, 14.593120), 4326)),
  (542, 'Quiapo', ST_SetSRID(ST_MakePoint(120.984672, 14.600471), 4326))
ON CONFLICT (id) DO NOTHING;

DELETE FROM route_stops WHERE route_id = 6;
INSERT INTO route_stops (route_id, stop_id, seq) VALUES
  (6, 501, 1),
  (6, 502, 2),
  (6, 503, 3),
  (6, 504, 4),
  (6, 505, 5),
  (6, 506, 6),
  (6, 507, 7),
  (6, 508, 8),
  (6, 509, 9),
  (6, 510, 10),
  (6, 511, 11),
  (6, 512, 12),
  (6, 513, 13),
  (6, 514, 14),
  (6, 515, 15),
  (6, 516, 16),
  (6, 517, 17),
  (6, 518, 18),
  (6, 519, 19),
  (6, 520, 20),
  (6, 521, 21),
  (6, 522, 22),
  (6, 523, 23),
  (6, 524, 24),
  (6, 525, 25),
  (6, 526, 26),
  (6, 527, 27),
  (6, 528, 28),
  (6, 529, 29),
  (6, 530, 30),
  (6, 531, 31),
  (6, 532, 32),
  (6, 533, 33),
  (6, 534, 34),
  (6, 535, 35),
  (6, 536, 36),
  (6, 537, 37),
  (6, 538, 38),
  (6, 539, 39),
  (6, 540, 40),
  (6, 541, 41),
  (6, 542, 42)
ON CONFLICT DO NOTHING;

-- Fare: standard LTFRB 2026 PUB rate (base P18 for the first 5 km, then
-- P2.98/km). No line-specific rule needed — the mode default already applies.

COMMIT;
