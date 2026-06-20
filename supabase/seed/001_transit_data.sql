-- ParaPo seed data — Metro Manila transit network subset
-- Matches the static seed in lib/routing/graph.ts.
-- Run after applying the migration.

-- ─── Lines ───────────────────────────────────────────────────────────────────

INSERT INTO lines (id, name, mode, color) VALUES
  (1, 'MRT-3 (EDSA Line)',    'mrt',     '#E63946'),
  (2, 'LRT-2 (Meralco Ave)',  'lrt',     '#2A9D8F'),
  (3, 'EDSA Bus Carousel',    'bus',     '#D05A28'),
  (4, 'Katipunan Jeepney',    'jeepney', '#B8962E')
ON CONFLICT (id) DO NOTHING;

-- ─── Stops ───────────────────────────────────────────────────────────────────

INSERT INTO stops (id, name, lat, lng) VALUES
  -- MRT-3 stations (south → north)
  ( 1, 'Taft Avenue (MRT)',        14.5395, 120.9985),
  ( 2, 'Magallanes',               14.5401, 121.0038),
  ( 3, 'Ayala',                    14.5487, 121.0279),
  ( 4, 'Buendia',                  14.5536, 121.0347),
  ( 5, 'Guadalupe',                14.5658, 121.0469),
  ( 6, 'Ortigas (MRT)',            14.5876, 121.0583),
  ( 7, 'Shaw Blvd',                14.5811, 121.0543),
  ( 8, 'Boni',                     14.5762, 121.0477),
  ( 9, 'Cubao (MRT)',              14.6228, 121.0526),
  (10, 'GMA-Kamuning',             14.6378, 121.0484),
  (11, 'Quezon Ave (MRT)',         14.6449, 121.0403),
  (12, 'North Avenue',             14.6521, 121.0322),

  -- LRT-2 stations (west → east)
  (20, 'Recto',                    14.5987, 120.9844),
  (21, 'Legarda',                  14.5979, 121.0024),
  (22, 'Pureza',                   14.6015, 121.0202),
  (23, 'V. Mapa',                  14.5922, 121.0406),
  (24, 'J. Ruiz',                  14.6009, 121.0479),
  (25, 'Gilmore',                  14.6083, 121.0528),
  (26, 'Betty Go-Belmonte',        14.6145, 121.0530),
  (27, 'Cubao (LRT-2)',            14.6224, 121.0524),
  (28, 'Anonas',                   14.6282, 121.0700),
  (29, 'Katipunan (LRT-2)',        14.6284, 121.0731),
  (30, 'Santolan (LRT-2)',         14.6280, 121.0826),
  (31, 'Marikina-Pasig',           14.6362, 121.1068),
  (32, 'Antipolo',                 14.6249, 121.1240),

  -- EDSA Bus Carousel
  (40, 'Monumento (Bus)',          14.6543, 120.9840),
  (41, 'Trinoma',                  14.6520, 121.0320),
  (42, 'Cubao (Bus)',              14.6197, 121.0510),
  (43, 'Ortigas (Bus)',            14.5870, 121.0576),
  (44, 'Magallanes (Bus)',         14.5410, 121.0030),
  (45, 'Taft Ave (Bus)',           14.5545, 120.9942),

  -- Katipunan Jeepney
  (50, 'Katipunan LRT2 (Jeep)',    14.6284, 121.0730),
  (51, 'Ateneo Gate',              14.6395, 121.0775),
  (52, 'UP Diliman',               14.6540, 121.0685),
  (53, 'Balara',                   14.6700, 121.0720),
  (54, 'Tandang Sora',             14.6820, 121.0440)
ON CONFLICT (id) DO NOTHING;

-- ─── Line stops ──────────────────────────────────────────────────────────────

-- MRT-3 (line 1)
INSERT INTO line_stops (line_id, stop_id, stop_sequence) VALUES
  (1,  1,  1), (1,  2,  2), (1,  3,  3), (1,  4,  4),
  (1,  5,  5), (1,  8,  6), (1,  7,  7), (1,  6,  8),
  (1,  9,  9), (1, 10, 10), (1, 11, 11), (1, 12, 12)
ON CONFLICT (line_id, stop_id) DO NOTHING;

-- LRT-2 (line 2)
INSERT INTO line_stops (line_id, stop_id, stop_sequence) VALUES
  (2, 20,  1), (2, 21,  2), (2, 22,  3), (2, 23,  4),
  (2, 24,  5), (2, 25,  6), (2, 26,  7), (2, 27,  8),
  (2, 28,  9), (2, 29, 10), (2, 30, 11), (2, 31, 12), (2, 32, 13)
ON CONFLICT (line_id, stop_id) DO NOTHING;

-- EDSA Bus (line 3)
INSERT INTO line_stops (line_id, stop_id, stop_sequence) VALUES
  (3, 40, 1), (3, 41, 2), (3, 42, 3), (3, 43, 4), (3, 44, 5), (3, 45, 6)
ON CONFLICT (line_id, stop_id) DO NOTHING;

-- Katipunan Jeepney (line 4)
INSERT INTO line_stops (line_id, stop_id, stop_sequence) VALUES
  (4, 50, 1), (4, 51, 2), (4, 52, 3), (4, 53, 4), (4, 54, 5)
ON CONFLICT (line_id, stop_id) DO NOTHING;

-- ─── Fare rules ──────────────────────────────────────────────────────────────

INSERT INTO fare_rules (line_id, mode, base_fare, per_km_rate) VALUES
  (NULL, 'jeepney', 13.00, 1.80),
  (NULL, 'bus',     13.00, 2.20),
  (NULL, 'mrt',     13.00, 2.50),
  (NULL, 'lrt',     12.00, 2.40)
ON CONFLICT DO NOTHING;
