-- Migration: enable RLS on all tables, add lat/lng to stops, create saved_routes + search_logs
-- Applied: 2026-06-20

-- Add extracted lat/lng columns to stops for easier application use
ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y(geom)) STORED,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION GENERATED ALWAYS AS (ST_X(geom)) STORED;

-- Add color branding to corridors
ALTER TABLE corridors ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#666666';
UPDATE corridors SET color = '#E63946' WHERE mode = 'mrt';
UPDATE corridors SET color = '#2A9D8F' WHERE mode = 'lrt';
UPDATE corridors SET color = '#D05A28' WHERE mode = 'bus';
UPDATE corridors SET color = '#B8962E' WHERE mode = 'jeepney';

-- Saved routes (F5 — auth-gated)
CREATE TABLE IF NOT EXISTS saved_routes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  origin_lat  DOUBLE PRECISION NOT NULL,
  origin_lng  DOUBLE PRECISION NOT NULL,
  origin_name TEXT NOT NULL,
  dest_lat    DOUBLE PRECISION NOT NULL,
  dest_lng    DOUBLE PRECISION NOT NULL,
  dest_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Search logs — anonymised, drives F8 analytics dashboard
CREATE TABLE IF NOT EXISTS search_logs (
  id             BIGSERIAL PRIMARY KEY,
  origin_geohash TEXT NOT NULL,
  dest_geohash   TEXT NOT NULL,
  preference     TEXT,
  result_count   INTEGER,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Enable RLS on every table ────────────────────────────────────────────────
ALTER TABLE corridors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops           ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fares           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE eta_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs     ENABLE ROW LEVEL SECURITY;

-- ── Public read for all catalog / transit data ───────────────────────────────
CREATE POLICY "corridors_public_read"        ON corridors       FOR SELECT USING (true);
CREATE POLICY "stops_public_read"            ON stops           FOR SELECT USING (true);
CREATE POLICY "routes_public_read"           ON routes          FOR SELECT USING (true);
CREATE POLICY "route_stops_public_read"      ON route_stops     FOR SELECT USING (true);
CREATE POLICY "fares_public_read"            ON fares           FOR SELECT USING (true);
CREATE POLICY "trips_public_read"            ON trips           FOR SELECT USING (true);
CREATE POLICY "eta_predictions_public_read"  ON eta_predictions FOR SELECT USING (true);
CREATE POLICY "crowd_reports_public_read"    ON crowd_reports   FOR SELECT USING (true);

CREATE POLICY "crowd_reports_auth_insert" ON crowd_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Saved routes: user-scoped ────────────────────────────────────────────────
CREATE POLICY "saved_routes_user_select" ON saved_routes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_routes_user_insert" ON saved_routes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_routes_user_delete" ON saved_routes FOR DELETE USING (auth.uid() = user_id);

-- ── Search logs: insert-only from anyone ─────────────────────────────────────
CREATE POLICY "search_logs_public_insert" ON search_logs FOR INSERT WITH CHECK (true);
