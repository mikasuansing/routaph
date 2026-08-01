# ADR 0004 — MapLibre GL for the 3D pin picker

**Date:** 2026-07-31
**Status:** Accepted — **extended 2026-08-01 to the trip screen**

> **Update, 2026-08-01.** The scoped exception below asked to be revisited
> once the picker had been used. It was, and the answer arrived from the
> product side: the trip screen should navigate like a driving app — camera
> locked to the rider, tilted forward, and the map turned so the direction
> of travel points up. Leaflet has no camera at all, so this was not
> reachable by adjusting it.
>
> The trip map is therefore MapLibre too. The route is drawn as GeoJSON
> (ride legs solid in the line's own colour over a casing, walk legs
> dashed), the rider is an arrow that rotates to their heading, and the
> camera eases to follow. Dragging the map releases the camera and offers a
> Recenter button, the way a navigation app stops fighting you the moment
> you pan.
>
> Heading comes from `GeolocationCoordinates.heading` where the device
> provides it, and otherwise from the bearing between consecutive fixes —
> but only above a walking pace, since a stationary phone produces bearings
> that swing wildly and would spin the map while a rider stands on a
> platform. See `bearingBetween` / `bearingDelta` in `lib/trip/geo.ts`.
>
> **The planner map is still Leaflet.** It is a flat overview where tilt
> buys nothing, and it is the first thing that paints on load, so it is the
> worst place to spend 200 KB. Both libraries now ship, which the original
> decision called unacceptable as a permanent state — that remains true,
> and migrating the planner is the outstanding work that closes it.

## Context

`BASELINE.md` locks the map layer to **Leaflet + react-leaflet**, and that
choice still serves the planner and trip screens well: raster tiles, a tiny
bundle, and no WebGL requirement on low-end phones.

The drop-a-pin location picker was asked to render in 3D — a tilted camera
with extruded buildings, so a rider placing a pin on a street can recognise
the block they're looking at.

Leaflet cannot do this at all. It has no camera pitch, no rotation, and no
vector data to extrude; it composites pre-rendered raster tiles onto a flat
plane. This is not a gap that can be worked around, so the requirement and
the locked choice are genuinely in conflict.

Candidates:
- **MapLibre GL JS** — open-source fork of Mapbox GL, WebGL vector renderer
  with pitch, bearing and `fill-extrusion`. BSD-3. No account required.
- **Mapbox GL JS** — same lineage, but proprietary licence and a mandatory
  access token tied to a billed account.
- **CesiumJS / deck.gl** — far heavier, aimed at globe and large-scale data
  visualisation rather than a street-level picker.

Vector tiles need a source. **OpenFreeMap** serves OpenMapTiles-schema tiles
with no API key, no account, and no usage limit, under ODbL — and its
`liberty` style already carries a `building-3d` fill-extrusion layer.
MapTiler and Stadia were the alternatives, both requiring a key, which would
mean a new secret in the deploy and a signup step to run the project.

## Decision

Adopt **MapLibre GL JS for the pin picker only**, sourcing vector tiles from
**OpenFreeMap** (keyless).

Leaflet stays as the map layer for the planner and trip screens. This is
deliberately a scoped exception, not a migration: the picker is a
self-contained modal with no live GPS following, no route polylines and no
vehicle markers, so it is the one surface where a second renderer can be
evaluated without touching the parts of the app people depend on mid-commute.

## Consequences

**Positive:**
- Real 3D — tilt, rotate, extruded buildings — which raster tiles cannot give.
- No API key, so nothing new to configure and no signup to run the project.
- MapLibre is dynamically imported inside the picker, so the cost lands only
  when someone opens it, not on the planner's first paint.
- If it proves out, migrating the remaining surfaces is a known quantity.

**Negative:**
- Two map libraries in the tree until the migration finishes or is reverted.
  MapLibre is roughly 200 KB gzipped — acceptable behind a dynamic import,
  not acceptable as a permanent split. **This ADR should be revisited once
  the picker has been used in anger**, and resolved in one direction.
- Requires WebGL. Devices without it get a blank canvas, so the picker falls
  back to the flat Leaflet map when WebGL is unavailable.
- Vector tiles are heavier on first load than raster; the picker requests
  them only for the area actually viewed.
- Another third-party tile host. OpenFreeMap has no SLA — if it goes down the
  picker degrades, which is why the fallback path exists.

## Attribution

OpenFreeMap serves OpenStreetMap data. Both the map and the reverse-geocoded
address carry © OpenStreetMap contributors (ODbL), consistent with the
existing CARTO attribution on the other map surfaces.
