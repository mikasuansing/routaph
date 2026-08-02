-- Seed 009: Divisoria–Don Bosco Jeepney — LTFRB T366, via Moriones (2026-08-02)
--
-- WHY
-- Road coverage outside EDSA Carousel and Route 3 (Aurora Blvd) was still
-- thin — one 4-stop jeepney corridor total. This adds a second tracked
-- jeepney route in Tondo, Manila, so trips touching North Harbor / Divisoria
-- / Moriones have a real routed option instead of falling through to the
-- untracked "Suggested" fare-range card in lib/routing/jeepneySuggest.ts.
--
-- SOURCE
-- OpenStreetMap relation 11540864 (Divisoria -> Don Bosco), read in
-- relation-member order. © OpenStreetMap contributors, ODbL
-- (https://www.openstreetmap.org/copyright). Authority is LTFRB (network
-- "LTFRB National Capital Region", ref T366); operator New Don Bosco
-- Jeepney Operators and Drivers Association, Inc.
--
-- MODELING NOTES
-- - Imported as ONE sequence (outbound only), per the same rule as Route 3:
--   importing both directions would duplicate the corridor.
-- - Stop names come from the OSM highway=bus_stop tags on the same nodes
--   the relation references (not invented) — LTFRB-sourced for several of
--   them (source=Land Transportation Franchising and Regulatory Board).
--   Two stops both carried the OSM name "Herbosa Street" ~700m apart; the
--   second (route terminus) is disambiguated as "Herbosa–Don Bosco" using
--   the relation's own tagged endpoint name ("to": "Don Bosco").
-- - mode 'jeepney': the relation has no interval/opening_hours/duration
--   (unlike Route 3), and the operator name itself is a jeepney
--   association — despite the OSM route=bus tag, this is a traditional
--   jeepney, so it gets the default jeepney fare rule and no invented ETA
--   precision beyond the same speed model used for Katipunan Jeepney.
--
-- 11 stops, ~2.3 km. Idempotent: safe to re-run.

BEGIN;

INSERT INTO corridors (id, name, mode, description, color) OVERRIDING SYSTEM VALUE VALUES
  (7, 'Divisoria–Don Bosco Jeepney', 'jeepney', 'LTFRB T366: Divisoria to Don Bosco via Moriones, Tondo', '#8A5A2B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO routes (id, corridor_id, name, direction) OVERRIDING SYSTEM VALUE VALUES
  (7, 7, 'Divisoria to Don Bosco', 'outbound')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stops (id, name, geom) OVERRIDING SYSTEM VALUE VALUES
  (543, 'Padre Rada Street', ST_SetSRID(ST_MakePoint(120.969843, 14.606791), 4326)),
  (544, 'Padre Herrera Street', ST_SetSRID(ST_MakePoint(120.969245, 14.608093), 4326)),
  (545, 'Juan Luna Street', ST_SetSRID(ST_MakePoint(120.968609, 14.609858), 4326)),
  (546, 'Plaza Morga', ST_SetSRID(ST_MakePoint(120.965900, 14.610040), 4326)),
  (547, 'Abad Santos Street', ST_SetSRID(ST_MakePoint(120.963880, 14.609846), 4326)),
  (548, 'Masinop corner Moriones', ST_SetSRID(ST_MakePoint(120.962922, 14.610055), 4326)),
  (549, 'Tondo High School', ST_SetSRID(ST_MakePoint(120.962844, 14.611049), 4326)),
  (550, 'Coral Street (North Harbor)', ST_SetSRID(ST_MakePoint(120.962723, 14.614090), 4326)),
  (551, 'Dandan Street', ST_SetSRID(ST_MakePoint(120.962463, 14.616936), 4326)),
  (552, 'Herbosa Street', ST_SetSRID(ST_MakePoint(120.962082, 14.618183), 4326)),
  (553, 'Herbosa–Don Bosco', ST_SetSRID(ST_MakePoint(120.959850, 14.617409), 4326))
ON CONFLICT (id) DO NOTHING;

DELETE FROM route_stops WHERE route_id = 7;
INSERT INTO route_stops (route_id, stop_id, seq) VALUES
  (7, 543, 1),
  (7, 544, 2),
  (7, 545, 3),
  (7, 546, 4),
  (7, 547, 5),
  (7, 548, 6),
  (7, 549, 7),
  (7, 550, 8),
  (7, 551, 9),
  (7, 552, 10),
  (7, 553, 11)
ON CONFLICT DO NOTHING;

-- Fare: default jeepney fare rule (₱14 flagdown / 4 km, ₱2.00/km after) —
-- no line-specific override needed.

COMMIT;
