-- Seed: MRT-3 and LRT-2 rail corridors (2026-07-02)
--
-- The initial seed (001_transit_data.sql) only loaded the EDSA Carousel bus
-- and Katipunan jeepney corridors, so most planner searches (which offer
-- MRT/LRT stations) had no routable network. This adds both rail lines with
-- station names matching the planner catalog exactly.
--
-- Stop names must match app/planner STOP_COORDS keys — the map draws
-- polylines by stop name. Fares: 2024 DOTr matrix (MRT ₱13 + ₱0.94/km,
-- LRT ₱12 + ₱0.89/km from km 0).
--
-- Idempotent: safe to re-run. Applied to the live project 2026-07-03.
-- Note: id columns are GENERATED ALWAYS identities; direction check allows
-- only 'inbound' | 'outbound'.

-- ── Corridors ────────────────────────────────────────────────────────────────
INSERT INTO corridors (id, name, mode, description, color) OVERRIDING SYSTEM VALUE VALUES
  (3, 'MRT-3', 'train', 'EDSA rail line, North Avenue to Taft Avenue', '#6366F1'),
  (4, 'LRT-2', 'train', 'Recto to Antipolo rail line',                 '#06B6D4')
ON CONFLICT (id) DO NOTHING;

-- ── Routes (one directional variant each; engine rides edges both ways) ─────
INSERT INTO routes (id, corridor_id, name, direction) OVERRIDING SYSTEM VALUE VALUES
  (3, 3, 'MRT-3 - Southbound', 'outbound'),
  (4, 4, 'LRT-2 - Eastbound',  'outbound')
ON CONFLICT (id) DO NOTHING;

-- ── Stops ────────────────────────────────────────────────────────────────────
INSERT INTO stops (id, name, geom) OVERRIDING SYSTEM VALUE VALUES
  -- MRT-3, north to south
  (201, 'North Avenue',      ST_SetSRID(ST_MakePoint(121.0322, 14.6521), 4326)),
  (202, 'Quezon Ave (MRT)',  ST_SetSRID(ST_MakePoint(121.0403, 14.6449), 4326)),
  (203, 'GMA-Kamuning',      ST_SetSRID(ST_MakePoint(121.0484, 14.6378), 4326)),
  (204, 'Cubao (MRT)',       ST_SetSRID(ST_MakePoint(121.0526, 14.6228), 4326)),
  (205, 'Ortigas (MRT)',     ST_SetSRID(ST_MakePoint(121.0583, 14.5876), 4326)),
  (206, 'Shaw Blvd',         ST_SetSRID(ST_MakePoint(121.0543, 14.5811), 4326)),
  (207, 'Boni',              ST_SetSRID(ST_MakePoint(121.0477, 14.5762), 4326)),
  (208, 'Guadalupe',         ST_SetSRID(ST_MakePoint(121.0469, 14.5658), 4326)),
  (209, 'Buendia',           ST_SetSRID(ST_MakePoint(121.0347, 14.5536), 4326)),
  (210, 'Ayala',             ST_SetSRID(ST_MakePoint(121.0279, 14.5487), 4326)),
  (211, 'Magallanes',        ST_SetSRID(ST_MakePoint(121.0038, 14.5401), 4326)),
  (212, 'Taft Avenue (MRT)', ST_SetSRID(ST_MakePoint(120.9985, 14.5395), 4326)),
  -- LRT-2, west to east
  (301, 'Recto',             ST_SetSRID(ST_MakePoint(120.9844, 14.5987), 4326)),
  (302, 'Cubao (LRT-2)',     ST_SetSRID(ST_MakePoint(121.0524, 14.6224), 4326)),
  (303, 'Katipunan (LRT-2)', ST_SetSRID(ST_MakePoint(121.0731, 14.6284), 4326)),
  (304, 'Santolan (LRT-2)',  ST_SetSRID(ST_MakePoint(121.0883, 14.6221), 4326)),
  (305, 'Marikina (LRT-2)',  ST_SetSRID(ST_MakePoint(121.1012, 14.6217), 4326)),
  (306, 'Antipolo',          ST_SetSRID(ST_MakePoint(121.1240, 14.6249), 4326))
ON CONFLICT (id) DO NOTHING;

-- ── Stop sequences ───────────────────────────────────────────────────────────
INSERT INTO route_stops (route_id, stop_id, seq)
SELECT 3, s.stop_id, s.seq FROM (VALUES
  (201, 1), (202, 2), (203, 3), (204, 4), (205, 5), (206, 6),
  (207, 7), (208, 8), (209, 9), (210, 10), (211, 11), (212, 12)
) AS s(stop_id, seq)
WHERE NOT EXISTS (SELECT 1 FROM route_stops WHERE route_id = 3)
UNION ALL
SELECT 4, s.stop_id, s.seq FROM (VALUES
  (301, 1), (302, 2), (303, 3), (304, 4), (305, 5), (306, 6)
) AS s(stop_id, seq)
WHERE NOT EXISTS (SELECT 1 FROM route_stops WHERE route_id = 4);

-- ── Fares (2024 DOTr rail matrix) ────────────────────────────────────────────
INSERT INTO fares (route_id, base_fare, per_km, effective_on)
SELECT * FROM (VALUES
  (3, 13.00, 0.94, DATE '2024-01-01'),
  (4, 12.00, 0.89, DATE '2024-01-01')
) AS f(route_id, base_fare, per_km, effective_on)
WHERE NOT EXISTS (SELECT 1 FROM fares WHERE route_id IN (3, 4));

-- Keep serial sequences ahead of the explicit ids used above
SELECT setval(pg_get_serial_sequence('corridors', 'id'),   (SELECT MAX(id) FROM corridors));
SELECT setval(pg_get_serial_sequence('routes', 'id'),      (SELECT MAX(id) FROM routes));
SELECT setval(pg_get_serial_sequence('stops', 'id'),       (SELECT MAX(id) FROM stops));
SELECT setval(pg_get_serial_sequence('fares', 'id'),       (SELECT MAX(id) FROM fares));
