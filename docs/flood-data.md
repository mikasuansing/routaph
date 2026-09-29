# Flood hazard data

> Last verified from code: 2026-09-27

Flood-aware routing penalizes jeepney and bus segments that cross a
flood-prone area, but only while the rain advisory is active. The polygons
come from Project NOAH and live in `public.flood_zones`
(`supabase/migrations/011_flood_zones.sql`).

## Source and license

| | |
|---|---|
| Dataset | Project NOAH flood hazard maps, Metro Manila, 25-year rainfall return period |
| Publisher | UP NOAH Center / DOST |
| Mirror | `huggingface.co/datasets/bettergovph/project-noah-hazard-maps`, file `Flood/25yr/MetroManila.zip` (36.2 MB) |
| License | ODC-ODbL |
| Hazard field | `Var`: 1 low (0.1-0.5 m), 2 medium (0.5-1.5 m), 3 high (>1.5 m) |

**Obligations.** Every surface that shows a flood flag must credit
"Flood hazard data (c) Project NOAH, ODbL". Anything that republishes the
derived data (the offline graph snapshot, if it carries flood flags) is a
derived database and must be offered under ODbL too. OSM, which the road
routes already come from, carries the same license.

**Rejected:** the Phil-LiDAR / LiPAD (`lipad-fmc.dream.upd.edu.ph`) maps.
Their license is non-transferable and limited to organizational and
educational use, which does not fit a public app.

## Preparing the file

The raw shapefile is three multipolygons with ~2.2M points, too large to
load as-is. Keep medium and high hazard, split into single polygons, drop
slivers, simplify to about 11 m:

```sh
ogr2ogr -f GPKG parts.gpkg MetroManila_Flood_25year.shp \
  -where "Var >= 2" -explodecollections -nln parts

ogr2ogr -f GeoJSON zones.geojson parts.gpkg -dialect sqlite -sql \
  "select cast(Var as int) hazard, ST_SimplifyPreserveTopology(geom, 0.0001) geom
   from parts where ST_Area(geom, 1) >= 1000" \
  -lco COORDINATE_PRECISION=5 -lco RFC7946=YES
```

Result (2026-09-27): 5,798 polygons, 154k points, 5.1 MB, retaining 99.9%
of the medium/high flooded area. Keep the files out of the repo.

Why these thresholds: low hazard is water jeepneys drive through, and
flagging it would mark half the city. Parts under 1,000 m2 are 84% of the
polygon count but 5% of the area. 11 m of simplification is well inside the
error of treating a segment as a straight line between stops.

## Loading

Apply migration 011 first, then:

```sh
node --env-file=.env.local scripts/import-flood-zones.mjs zones.geojson \
  --project <supabase-project-ref> --return-period 25
```

The script aborts unless `--project` matches the ref in
`NEXT_PUBLIC_SUPABASE_URL`, and refuses to run if rows for that return
period already exist. It never deletes.

## Limits to keep honest

- These are scenarios, not observations. The UI says "flood-prone", never
  "flooded", and only while it's raining or forecast to.
- Segments are straight lines between stops, not the road actually driven.
- Rail is never flagged: MRT-3 and LRT-1/2 are elevated or underground.
