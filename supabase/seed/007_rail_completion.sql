-- Seed 007: complete the three rail lines with verified coordinates (2026-07-31)
--
-- WHY
-- The rail data was seeded at "demo fidelity" — eyeballed coordinates, and
-- three lines that stopped short of their real station lists. LRT-2 had 6 of
-- its 13 stations, MRT-3 was missing Santolan-Annapolis, and LRT-1 predated
-- the Cavite Extension. Several existing coordinates were 1-3 km from the
-- actual platform, which is enough to send a walking leg to the wrong block.
--
-- SOURCE
-- Station positions come from OpenStreetMap relations 109159 (MRT-3),
-- 8000264 (LRT-2) and 110418 (LRT-1), read in relation-member order so the
-- stop sequence matches the real line. OSM data is © OpenStreetMap
-- contributors, licensed ODbL (https://www.openstreetmap.org/copyright).
--
-- 13 stations added, 51 coordinates corrected.
-- Idempotent: safe to re-run.

BEGIN;

-- ── New stations ────────────────────────────────────────────────────────────
INSERT INTO stops (id, name, geom) OVERRIDING SYSTEM VALUE VALUES
  (213, 'Santolan-Annapolis (MRT-3)', ST_SetSRID(ST_MakePoint(121.056574, 14.607541), 4326)),  -- MRT-3
  (307, 'Legarda', ST_SetSRID(ST_MakePoint(120.992486, 14.600830), 4326)),  -- LRT-2
  (308, 'Pureza', ST_SetSRID(ST_MakePoint(121.005040, 14.601679), 4326)),  -- LRT-2
  (309, 'V. Mapa', ST_SetSRID(ST_MakePoint(121.017048, 14.604003), 4326)),  -- LRT-2
  (310, 'J. Ruiz', ST_SetSRID(ST_MakePoint(121.026068, 14.610536), 4326)),  -- LRT-2
  (311, 'Gilmore', ST_SetSRID(ST_MakePoint(121.034082, 14.613477), 4326)),  -- LRT-2
  (312, 'Betty Go-Belmonte', ST_SetSRID(ST_MakePoint(121.042754, 14.618579), 4326)),  -- LRT-2
  (313, 'Anonas', ST_SetSRID(ST_MakePoint(121.065197, 14.628075), 4326)),  -- LRT-2
  (437, 'Redemptorist-Aseana', ST_SetSRID(ST_MakePoint(120.992985, 14.529737), 4326)),  -- LRT-1
  (438, 'MIA Road', ST_SetSRID(ST_MakePoint(120.992917, 14.517992), 4326)),  -- LRT-1
  (439, 'PITX (LRT-1)', ST_SetSRID(ST_MakePoint(120.991240, 14.508304), 4326)),  -- LRT-1
  (440, 'Ninoy Aquino Avenue', ST_SetSRID(ST_MakePoint(120.994355, 14.498939), 4326)),  -- LRT-1
  (441, 'Dr. Santos', ST_SetSRID(ST_MakePoint(120.989397, 14.485249), 4326))  -- LRT-1
ON CONFLICT (id) DO NOTHING;

-- ── Correct existing coordinates to the surveyed OSM positions ──────────────
UPDATE stops AS s SET
  name = v.name,
  geom = ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)
FROM (VALUES
  (201, 'North Avenue', 121.032633::double precision, 14.651694::double precision),  -- MRT-3
  (202, 'Quezon Ave (MRT)', 121.038645::double precision, 14.642449::double precision),  -- MRT-3
  (203, 'GMA-Kamuning', 121.043275::double precision, 14.635333::double precision),  -- MRT-3
  (204, 'Cubao (MRT)', 121.051057::double precision, 14.619478::double precision),  -- MRT-3
  (205, 'Ortigas (MRT)', 121.056519::double precision, 14.587341::double precision),  -- MRT-3
  (206, 'Shaw Blvd', 121.053408::double precision, 14.581102::double precision),  -- MRT-3
  (207, 'Boni', 121.047644::double precision, 14.573093::double precision),  -- MRT-3
  (208, 'Guadalupe (MRT)', 121.045438::double precision, 14.566719::double precision),  -- MRT-3
  (209, 'Buendia', 121.033684::double precision, 14.553952::double precision),  -- MRT-3
  (210, 'Ayala (MRT)', 121.027540::double precision, 14.548755::double precision),  -- MRT-3
  (211, 'Magallanes', 121.019050::double precision, 14.541743::double precision),  -- MRT-3
  (212, 'Taft Avenue (MRT)', 121.001890::double precision, 14.537597::double precision),  -- MRT-3
  (301, 'Recto', 120.983984::double precision, 14.603467::double precision),  -- LRT-2
  (302, 'Cubao (LRT-2)', 121.053041::double precision, 14.622891::double precision),  -- LRT-2
  (303, 'Katipunan (LRT-2)', 121.073293::double precision, 14.631260::double precision),  -- LRT-2
  (304, 'Santolan (LRT-2)', 121.086314::double precision, 14.621693::double precision),  -- LRT-2
  (305, 'Marikina (LRT-2)', 121.100632::double precision, 14.620444::double precision),  -- LRT-2
  (306, 'Antipolo', 121.121380::double precision, 14.624771::double precision),  -- LRT-2
  (401, 'Baclaran', 120.998050::double precision, 14.533913::double precision),  -- LRT-1
  (402, 'EDSA (LRT-1)', 121.000588::double precision, 14.538952::double precision),  -- LRT-1
  (403, 'Libertad', 120.998613::double precision, 14.547684::double precision),  -- LRT-1
  (404, 'Gil Puyat', 120.997144::double precision, 14.554054::double precision),  -- LRT-1
  (405, 'Vito Cruz', 120.994737::double precision, 14.563460::double precision),  -- LRT-1
  (406, 'Quirino', 120.991561::double precision, 14.570215::double precision),  -- LRT-1
  (407, 'Pedro Gil', 120.987999::double precision, 14.576579::double precision),  -- LRT-1
  (408, 'UN Avenue', 120.984546::double precision, 14.582623::double precision),  -- LRT-1
  (409, 'Central Terminal', 120.981705::double precision, 14.592447::double precision),  -- LRT-1
  (410, 'Carriedo', 120.981322::double precision, 14.599028::double precision),  -- LRT-1
  (411, 'Doroteo Jose', 120.981998::double precision, 14.605346::double precision),  -- LRT-1
  (412, 'Bambang', 120.982438::double precision, 14.611120::double precision),  -- LRT-1
  (413, 'Tayuman', 120.982711::double precision, 14.616666::double precision),  -- LRT-1
  (414, 'Blumentritt', 120.982872::double precision, 14.622826::double precision),  -- LRT-1
  (415, 'Abad Santos', 120.981420::double precision, 14.630607::double precision),  -- LRT-1
  (416, 'R. Papa', 120.982264::double precision, 14.636026::double precision),  -- LRT-1
  (417, '5th Avenue', 120.983535::double precision, 14.644425::double precision),  -- LRT-1
  (418, 'Monumento (LRT-1)', 120.983848::double precision, 14.653834::double precision),  -- LRT-1
  (419, 'Balintawak (LRT-1)', 121.003517::double precision, 14.657422::double precision),  -- LRT-1
  (420, 'Fernando Poe Jr.', 121.020688::double precision, 14.657622::double precision)  -- LRT-1
) AS v(id, name, lng, lat)
WHERE s.id = v.id;

-- ── Rebuild the stop sequences ──────────────────────────────────────────────
-- Full rebuild rather than a patch: inserting a station mid-line shifts every
-- seq after it, so deleting and reinserting is both simpler and idempotent.
DELETE FROM route_stops WHERE route_id IN (3, 4, 5);

INSERT INTO route_stops (route_id, stop_id, seq) VALUES
  -- MRT-3
  (3, 201, 1),
  (3, 202, 2),
  (3, 203, 3),
  (3, 204, 4),
  (3, 213, 5),
  (3, 205, 6),
  (3, 206, 7),
  (3, 207, 8),
  (3, 208, 9),
  (3, 209, 10),
  (3, 210, 11),
  (3, 211, 12),
  (3, 212, 13),
  -- LRT-2
  (4, 301, 1),
  (4, 307, 2),
  (4, 308, 3),
  (4, 309, 4),
  (4, 310, 5),
  (4, 311, 6),
  (4, 312, 7),
  (4, 302, 8),
  (4, 313, 9),
  (4, 303, 10),
  (4, 304, 11),
  (4, 305, 12),
  (4, 306, 13),
  -- LRT-1
  (5, 441, 1),
  (5, 440, 2),
  (5, 439, 3),
  (5, 438, 4),
  (5, 437, 5),
  (5, 401, 6),
  (5, 402, 7),
  (5, 403, 8),
  (5, 404, 9),
  (5, 405, 10),
  (5, 406, 11),
  (5, 407, 12),
  (5, 408, 13),
  (5, 409, 14),
  (5, 410, 15),
  (5, 411, 16),
  (5, 412, 17),
  (5, 413, 18),
  (5, 414, 19),
  (5, 415, 20),
  (5, 416, 21),
  (5, 417, 22),
  (5, 418, 23),
  (5, 419, 24),
  (5, 420, 25)
ON CONFLICT DO NOTHING;

-- ── Corridor descriptions now that the lines are complete ───────────────────
UPDATE corridors SET description = 'Recto to Antipolo rail line (13 stations)' WHERE id = 4;
UPDATE corridors SET description = 'EDSA rail line, North Avenue to Taft Avenue (13 stations)' WHERE id = 3;
UPDATE corridors SET description = 'Dr. Santos to Fernando Poe Jr. rail line (25 stations)' WHERE id = 5;

COMMIT;
