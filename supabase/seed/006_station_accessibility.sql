-- Seed: station_accessibility for the 12 MRT-3 stations (2026-07-26)
--
-- All rows start 'unknown' — this is infrastructure for future real data
-- (a live feed, or manual admin updates via the internal page), not a
-- guess at actual elevator/escalator uptime. Scoped to MRT-3 only: the
-- line where multi-level elevated stations with elevators/escalators
-- matter most, per the roadmap's own fallback when precise per-station
-- accessibility data isn't otherwise available.
--
-- Depends on supabase/migrations/008_station_accessibility.sql.
-- Idempotent: safe to re-run.

INSERT INTO station_accessibility (stop_id, feature, status)
SELECT s.id, f.feature, 'unknown'
FROM stops s
CROSS JOIN (VALUES ('elevator'), ('escalator')) AS f(feature)
WHERE s.name IN (
  'Taft Avenue (MRT)', 'Magallanes', 'Ayala', 'Buendia', 'Guadalupe',
  'Ortigas (MRT)', 'Shaw Blvd', 'Boni', 'Cubao (MRT)', 'GMA-Kamuning',
  'Quezon Ave (MRT)', 'North Avenue'
)
ON CONFLICT (stop_id, feature) DO NOTHING;
