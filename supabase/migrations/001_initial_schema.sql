-- ParaPo initial schema — Phase 0/1
-- Apply via: supabase db push  (local)  or MCP apply_migration  (remote)

-- PostGIS for spatial queries (isochrones, KNN stop lookup, ST_DWithin)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── Transit catalog ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lines (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('jeepney', 'bus', 'mrt', 'lrt')),
  color      TEXT NOT NULL DEFAULT '#666666',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stops (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  -- Computed geometry column for PostGIS spatial queries
  location   GEOMETRY(POINT, 4326)
               GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordered stop sequence per line
CREATE TABLE IF NOT EXISTS line_stops (
  id            BIGSERIAL PRIMARY KEY,
  line_id       BIGINT NOT NULL REFERENCES lines(id)  ON DELETE CASCADE,
  stop_id       BIGINT NOT NULL REFERENCES stops(id)  ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL,
  UNIQUE (line_id, stop_sequence),
  UNIQUE (line_id, stop_id)
);

-- Fare rules — per-line or per-mode defaults (lineId NULL = mode-wide default)
CREATE TABLE IF NOT EXISTS fare_rules (
  id           BIGSERIAL PRIMARY KEY,
  line_id      BIGINT REFERENCES lines(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('jeepney', 'bus', 'mrt', 'lrt')),
  base_fare    NUMERIC(8, 2) NOT NULL,
  per_km_rate  NUMERIC(8, 2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── User data ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_routes (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  origin_lat   DOUBLE PRECISION NOT NULL,
  origin_lng   DOUBLE PRECISION NOT NULL,
  origin_name  TEXT NOT NULL,
  dest_lat     DOUBLE PRECISION NOT NULL,
  dest_lng     DOUBLE PRECISION NOT NULL,
  dest_name    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Analytics ───────────────────────────────────────────────────────────────

-- Anonymised search log — no user_id, no IP stored
CREATE TABLE IF NOT EXISTS search_logs (
  id           BIGSERIAL PRIMARY KEY,
  origin_lat   DOUBLE PRECISION NOT NULL,
  origin_lng   DOUBLE PRECISION NOT NULL,
  dest_lat     DOUBLE PRECISION NOT NULL,
  dest_lng     DOUBLE PRECISION NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Spatial indices ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS stops_location_gist ON stops USING GIST (location);
CREATE INDEX IF NOT EXISTS line_stops_line_id  ON line_stops (line_id);
CREATE INDEX IF NOT EXISTS line_stops_stop_id  ON line_stops (stop_id);
CREATE INDEX IF NOT EXISTS saved_routes_user   ON saved_routes (user_id);
CREATE INDEX IF NOT EXISTS search_logs_ts      ON search_logs (created_at);

-- ─── Row-Level Security ──────────────────────────────────────────────────────

ALTER TABLE lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_stops   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs  ENABLE ROW LEVEL SECURITY;

-- Transit catalog: public read, service-role writes only
CREATE POLICY "lines_public_read"        ON lines        FOR SELECT USING (true);
CREATE POLICY "stops_public_read"        ON stops        FOR SELECT USING (true);
CREATE POLICY "line_stops_public_read"   ON line_stops   FOR SELECT USING (true);
CREATE POLICY "fare_rules_public_read"   ON fare_rules   FOR SELECT USING (true);

-- Saved routes: each user sees and modifies only their own rows
CREATE POLICY "saved_routes_select" ON saved_routes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_routes_insert" ON saved_routes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_routes_delete" ON saved_routes
  FOR DELETE USING (auth.uid() = user_id);

-- Search logs: anyone can insert (anonymised), no reads via anon key
CREATE POLICY "search_logs_insert" ON search_logs
  FOR INSERT WITH CHECK (true);
