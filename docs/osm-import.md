# Importing road routes from OpenStreetMap

> Last verified from code: 2026-07-31

ParaPo's rail data is complete, but the road network is barely started: one
bus corridor (EDSA Carousel), one 4-stop jeepney corridor (Katipunan), and
one imported route (Route 3, Aurora Blvd). Metro Manila has hundreds more.
This is how to import them.

## Where the data is

PH public-transport routes are mapped in OpenStreetMap, but **not** under the
tag you would guess. `route=share_taxi` returns almost nothing useful inside
Metro Manila. The real coverage is:

| Query | Count (Metro Manila bbox) |
|---|---|
| `rel[route=bus]` | ~752 |
| ↳ `network=LTFRB National Capital Region` | ~420 |
| ↳ `network=LTFRB Interregional Bus` | ~163 |
| ↳ `network=P2P` | ~56 |
| ↳ QCityBus / BGC Bus / Pasig Transport | ~34 |
| `rel[route=share_taxi]` or `minibus` | ~24 (mostly Cavite/Laguna UV Express) |

The LTFRB NCR set is the interesting one — franchised city routes, many
carrying `ref`, `from`, `to`, `via`, `operator`, `interval`, `duration`,
`opening_hours` and `source:ref` (the LTFRB memorandum circular).

Quality sample of 60 LTFRB NCR routes:

| Stop nodes mapped | Routes |
|---|---|
| 15+ | 29 |
| 5–14 | 13 |
| 1–4 | 7 |
| 0 (geometry only) | 11 |

**~70% have ≥5 stop nodes**, so roughly 290 routes are importable as-is. The
rest have road geometry but no boarding points; they need a different
treatment (or should be left out rather than have stops invented for them).

## Overpass queries

Find candidate routes:

```
[out:json][timeout:180];
rel["route"="bus"]["network"="LTFRB National Capital Region"](14.40,120.90,14.78,121.15);
out tags;
```

Find routes serving both ends of a trip — useful for checking whether a gap
in the planner is a data gap or a genuine one:

```
[out:json][timeout:180];
way(around:400,<lat>,<lng>)->.a;
rel(bw.a)["route"~"bus|share_taxi|minibus"];
out tags;
```

Pull one route's ordered stops:

```
[out:json][timeout:120];
rel(<id>);
out body;
```

Then resolve the node members — **in relation-member order**, which for a
`public_transport:version=2` relation is travel order. Do not use `node(r)`
and sort by anything else; you will get the stops in arbitrary order and the
line sequence will be wrong.

Overpass rate-limits aggressively. Retry on failure with ~20 s backoff.

## Modeling rules

These are decisions, not preferences — breaking them produces dishonest data.

1. **One sequence per corridor, not two.** `buildGraphFromData` creates edges
   in both directions from a single stop order. Importing the inbound
   relation as its own line duplicates the corridor and invents transfers
   between a route and itself.
2. **Strip the ` 1`/` 2` suffix** OSM uses for the two sides of a road. Those
   are the same place to a commuter. Collapse consecutive duplicates.
3. **Stop names must be globally unique** — the catalog keys stops by name.
   Suffix collisions with the line (`PITX (LRT-1)` vs the bus terminal
   `PITX`). `lib/routing/__tests__/seedData.test.ts` enforces this.
4. **Pick the mode honestly.** A franchised PUB that publishes `interval` and
   `opening_hours` is `bus` and can carry an ETA. A traditional jeepney has
   no schedule and no fixed stops — if imported at all it must never show an
   arrival time, only a fare range (see `lib/routing/jeepneySuggest.ts` for
   the existing pattern).
5. **Skip routes with no named stops.** Synthesising boarding points at
   intervals and labelling them by nearest street is fabrication.
6. **Sanity-check spacing.** Consecutive stops more than ~6 km apart usually
   mean the member order was not travel order.

## ID allocation

Stop ids are assigned in blocks so seed files stay independent:

| Block | Use |
|---|---|
| 1–12 | original transit data |
| 201–213 | MRT-3 |
| 301–313 | LRT-2 |
| 401–441 | LRT-1 (421–436 are EDSA Carousel) |
| 501–542 | Route 3 (Aurora Blvd) |
| 543+ | next imported route |

Corridor/route ids: 1 EDSA Carousel, 2 Katipunan Jeepney, 3 MRT-3, 4 LRT-2,
5 LRT-1, 6 Route 3. Next import takes 7.

## Applying

Seed files are **not** run automatically. They are plain SQL for the Supabase
SQL editor, written idempotent (`ON CONFLICT DO NOTHING`, plus a
`DELETE`/reinsert for `route_stops` since inserting a stop mid-line shifts
every later `seq`).

After applying, keep `lib/routing/graph.ts`'s `SEED_*` constants in step —
they are the offline fallback and are meant to mirror the database, not
drift from it.

## Licensing

OSM data is © OpenStreetMap contributors, licensed
[ODbL](https://www.openstreetmap.org/copyright). Attribution is required
wherever the data is shown. The map already credits OSM/CARTO in the
attribution control; route data derived from OSM is covered by the same
notice, and each seed file records the relation ids it came from.
