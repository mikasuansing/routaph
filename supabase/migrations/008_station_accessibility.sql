-- 008: station accessibility (elevator/escalator status) — infrastructure
-- for future real data, NOT fake status. Seed values are 'unknown' unless
-- verified otherwise; this table exists so a real feed (or manual admin
-- updates) has somewhere to land, per the roadmap's Phase 4 scope.
--
-- STATUS: written but NOT YET APPLIED to the live project — this session
-- only had PostgREST (data-row) access, not a SQL connection, so this
-- CREATE TABLE couldn't be executed. Run via the Supabase SQL editor.
-- The API route (app/api/v1/station-accessibility) degrades gracefully
-- (empty list, no crash) if this table doesn't exist yet.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS station_accessibility (
  id          bigserial PRIMARY KEY,
  stop_id     bigint NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  feature     text NOT NULL CHECK (feature IN ('elevator', 'escalator')),
  status      text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'operational', 'out_of_service')),
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id),
  UNIQUE (stop_id, feature)
);

CREATE INDEX IF NOT EXISTS station_accessibility_stop_id ON station_accessibility (stop_id);

ALTER TABLE station_accessibility ENABLE ROW LEVEL SECURITY;

-- Public read — this is exactly what route detail screens show riders.
DROP POLICY IF EXISTS "station_accessibility_public_read" ON station_accessibility;
CREATE POLICY "station_accessibility_public_read"
  ON station_accessibility FOR SELECT
  USING (true);

-- No direct client writes — the admin page goes through the service-role
-- API route (app/api/v1/admin/station-accessibility), which checks the
-- ADMIN_EMAILS allowlist itself before writing. RLS denies everyone else
-- as defense-in-depth, same pattern as service_disruptions.
