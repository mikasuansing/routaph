-- Seed: LRT-1 line (2026-07-04) — Baclaran to Fernando Poe Jr.
--
-- Coordinates are approximate station locations (demo fidelity).
-- Transfers arise automatically from the engine's 500 m rule:
--   Doroteo Jose ↔ Recto (LRT-2), Monumento (LRT-1) ↔ Monumento (bus),
--   Balintawak (LRT-1) ↔ Balintawak (bus).
-- Names colliding with existing stops carry an (LRT-1) suffix because the
-- catalog keys stops by name.
--
-- Idempotent: safe to re-run. IDs: corridor 5 / route 5 / stops 401-420.

INSERT INTO corridors (id, name, mode, description, color) OVERRIDING SYSTEM VALUE VALUES
  (5, 'LRT-1', 'train', 'Baclaran to Fernando Poe Jr. rail line', '#0B7A45')
ON CONFLICT (id) DO NOTHING;

INSERT INTO routes (id, corridor_id, name, direction) OVERRIDING SYSTEM VALUE VALUES
  (5, 5, 'LRT-1 - Northbound', 'outbound')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stops (id, name, geom) OVERRIDING SYSTEM VALUE VALUES
  (401, 'Baclaran',            ST_SetSRID(ST_MakePoint(120.9981, 14.5311), 4326)),
  (402, 'EDSA (LRT-1)',        ST_SetSRID(ST_MakePoint(120.9917, 14.5385), 4326)),
  (403, 'Libertad',            ST_SetSRID(ST_MakePoint(120.9917, 14.5478), 4326)),
  (404, 'Gil Puyat',           ST_SetSRID(ST_MakePoint(120.9928, 14.5542), 4326)),
  (405, 'Vito Cruz',           ST_SetSRID(ST_MakePoint(120.9946, 14.5634), 4326)),
  (406, 'Quirino',             ST_SetSRID(ST_MakePoint(120.9942, 14.5701), 4326)),
  (407, 'Pedro Gil',           ST_SetSRID(ST_MakePoint(120.9886, 14.5765), 4326)),
  (408, 'UN Avenue',           ST_SetSRID(ST_MakePoint(120.9847, 14.5827), 4326)),
  (409, 'Central Terminal',    ST_SetSRID(ST_MakePoint(120.9817, 14.5926), 4326)),
  (410, 'Carriedo',            ST_SetSRID(ST_MakePoint(120.9812, 14.5989), 4326)),
  (411, 'Doroteo Jose',        ST_SetSRID(ST_MakePoint(120.9822, 14.6054), 4326)),
  (412, 'Bambang',             ST_SetSRID(ST_MakePoint(120.9825, 14.6111), 4326)),
  (413, 'Tayuman',             ST_SetSRID(ST_MakePoint(120.9827, 14.6167), 4326)),
  (414, 'Blumentritt',         ST_SetSRID(ST_MakePoint(120.9829, 14.6227), 4326)),
  (415, 'Abad Santos',         ST_SetSRID(ST_MakePoint(120.9814, 14.6306), 4326)),
  (416, 'R. Papa',             ST_SetSRID(ST_MakePoint(120.9822, 14.6360), 4326)),
  (417, '5th Avenue',          ST_SetSRID(ST_MakePoint(120.9836, 14.6444), 4326)),
  (418, 'Monumento (LRT-1)',   ST_SetSRID(ST_MakePoint(120.9838, 14.6541), 4326)),
  (419, 'Balintawak (LRT-1)',  ST_SetSRID(ST_MakePoint(121.0021, 14.6575), 4326)),
  (420, 'Fernando Poe Jr.',    ST_SetSRID(ST_MakePoint(121.0207, 14.6576), 4326))
ON CONFLICT (id) DO NOTHING;

INSERT INTO route_stops (route_id, stop_id, seq)
SELECT 5, s.stop_id, s.seq FROM (VALUES
  (401, 1),  (402, 2),  (403, 3),  (404, 4),  (405, 5),
  (406, 6),  (407, 7),  (408, 8),  (409, 9),  (410, 10),
  (411, 11), (412, 12), (413, 13), (414, 14), (415, 15),
  (416, 16), (417, 17), (418, 18), (419, 19), (420, 20)
) AS s(stop_id, seq)
WHERE NOT EXISTS (SELECT 1 FROM route_stops WHERE route_id = 5);

INSERT INTO fares (route_id, base_fare, per_km, effective_on)
SELECT 5, 12.00, 0.89, DATE '2024-01-01'
WHERE NOT EXISTS (SELECT 1 FROM fares WHERE route_id = 5);

SELECT setval(pg_get_serial_sequence('corridors', 'id'), (SELECT MAX(id) FROM corridors));
SELECT setval(pg_get_serial_sequence('routes', 'id'),    (SELECT MAX(id) FROM routes));
SELECT setval(pg_get_serial_sequence('stops', 'id'),     (SELECT MAX(id) FROM stops));
SELECT setval(pg_get_serial_sequence('fares', 'id'),     (SELECT MAX(id) FROM fares));
