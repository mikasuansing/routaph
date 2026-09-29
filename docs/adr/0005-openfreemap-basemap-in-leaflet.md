# ADR 0005 — OpenFreeMap vector basemap inside Leaflet

**Date:** 2026-09-29
**Status:** Accepted

## Context

The planner and trip-summary maps are Leaflet with CARTO raster tiles. CARTO
now requires an API key and stamps keyless tiles with "API KEY REQUIRED".
The stack lists Leaflet + MapLibre; ADR 0004 already brought MapLibre in for
the pin picker and the navigation screen.

## Decision

Keep Leaflet as the map, and replace only the ground under it with an
OpenFreeMap vector style (Positron light / Dark dark) drawn by MapLibre
inside a Leaflet layer, via `@maplibre/maplibre-gl-leaflet`. Routes, pins
and live vehicles are untouched. Keyless, no signup, ODbL data.

Rewriting the 1,600-line planner onto MapLibre was rejected as far larger
than the problem. Raster tiles remain as a fallback (CARTO Voyager/Dark
Matter with `NEXT_PUBLIC_CARTO_API_KEY`, else OSM tiles) for devices without
WebGL and for a style that never arrives.

## Consequences

- **The MapLibre worker must be configured.** MapLibre 6 builds its worker
  URL from `import.meta.url`; Turbopack rewrites that to the page's own URL,
  so the module worker loads HTML and dies silently. The style loads on the
  main thread but no tile is ever decoded, and the map looks alive and blank.
  `scripts/copy-maplibre-worker.mjs` copies the worker (and the shared file
  it imports) to `public/maplibre/<version>/` on postinstall/predev/prebuild,
  and `configureMapLibreWorker()` calls `setWorkerUrl()`. This also affects
  the pin picker, which now calls it too.
- **Settled means the style arrived, not that the first frame finished.**
  MapLibre's `load` waits on every visible tile; a slow connection or a
  backgrounded tab can take longer than any sensible timeout. Fallback to
  raster triggers on a style error or 10 s without the style, not on `load`.
- **Attribution is set explicitly.** The plugin only derives it after load
  and only if `map.attributionControl` exists, which a hand-built control
  never sets. OpenFreeMap's terms require the credit.
- **Derived data.** The vector tiles are ODbL: credit "OpenFreeMap
  (c) OpenMapTiles, data from OpenStreetMap" must stay visible.
- New dependency: `@maplibre/maplibre-gl-leaflet` (~280 KB, loaded lazily).
