-- 011_flood_zones.sql
--
-- Flood-aware routing: Project NOAH flood hazard polygons, plus a PostGIS
-- function that flags which road segments cross them.
--
-- DATA SOURCE
--   Project NOAH (UP NOAH Center / DOST) flood hazard maps, Metro Manila,
--   25-year rainfall return period. License: ODC-ODbL. Attribution
--   ("Flood hazard data (c) Project NOAH, ODbL") must appear wherever the
--   result is shown. Mirrored at huggingface.co/datasets/bettergovph/
--   project-noah-hazard-maps. Rows are loaded by
--   scripts/import-flood-zones.mjs, not by this migration - see
--   docs/flood-data.md for the download and simplification steps.
--
-- WHY THESE CHOICES
--   - Only medium (0.5-1.5 m) and high (>1.5 m) hazard is imported. Low
--     hazard (0.1-0.5 m) is ankle-to-gutter water that jeepneys drive
--     through; flagging it would light up half the city and teach people
--     to ignore the warning.
--   - 25-year, not 5 or 100: 5-year understates a typhoon, 100-year flags
--     so much that the penalty stops discriminating between routes.
--   - These are hazard SCENARIOS, not live flooding. The engine only applies
--     them while the rain advisory is active, and the UI calls them
--     "flood-prone", never "flooded".
--   - Segments are straight lines between consecutive stops, not road
--     geometry, so a flag is approximate. Good enough to rank routes; not
--     good enough to claim a specific street is underwater.
--   - Rail is excluded: MRT-3 and LRT-1/2 run elevated or underground.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.flood_zones (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hazard           SMALLINT NOT NULL CHECK (hazard BETWEEN 1 AND 3),
  return_period_yr SMALLINT NOT NULL CHECK (return_period_yr IN (5, 25, 100)),
  source           TEXT NOT NULL,
  geom             GEOMETRY(POLYGON, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS flood_zones_geom_gix
  ON public.flood_zones USING GIST (geom);

ALTER TABLE public.flood_zones ENABLE ROW LEVEL SECURITY;

-- Public hazard data (ODbL), same read posture as the other reference
-- tables. No write policy: only the service role (import script) writes.
DROP POLICY IF EXISTS "flood_zones_public_read" ON public.flood_zones;
CREATE POLICY "flood_zones_public_read"
  ON public.flood_zones FOR SELECT USING (true);

-- Road segments (consecutive stops on a jeepney/bus route) that cross a
-- flood zone at or above p_min_hazard. One row per directed segment as
-- stored in route_stops; the engine applies it to both directions because
-- it builds both from a single stop order.
CREATE OR REPLACE FUNCTION public.flood_prone_segments(
  p_min_hazard    SMALLINT DEFAULT 2,
  p_return_period SMALLINT DEFAULT 25
)
RETURNS TABLE (route_id BIGINT, from_stop_id BIGINT, to_stop_id BIGINT, hazard SMALLINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH seg AS (
    SELECT rs.route_id,
           rs.stop_id AS from_stop_id,
           LEAD(rs.stop_id) OVER (PARTITION BY rs.route_id ORDER BY rs.seq) AS to_stop_id
    FROM route_stops rs
  )
  SELECT seg.route_id::BIGINT,
         seg.from_stop_id::BIGINT,
         seg.to_stop_id::BIGINT,
         MAX(z.hazard)::SMALLINT
  FROM seg
  JOIN routes r    ON r.id = seg.route_id
  JOIN corridors c ON c.id = r.corridor_id
  JOIN stops a     ON a.id = seg.from_stop_id
  JOIN stops b     ON b.id = seg.to_stop_id
  JOIN flood_zones z
    ON z.hazard >= p_min_hazard
   AND z.return_period_yr = p_return_period
   AND ST_Intersects(z.geom, ST_MakeLine(a.geom, b.geom))
  WHERE seg.to_stop_id IS NOT NULL
    AND c.mode IN ('jeepney', 'bus', 'uv_express')
  GROUP BY 1, 2, 3;
$$;

-- Server-only: the graph loader calls this with the service role.
REVOKE EXECUTE ON FUNCTION public.flood_prone_segments(SMALLINT, SMALLINT)
  FROM PUBLIC, anon, authenticated;
