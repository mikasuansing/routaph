# ParaPo Routing Engine

## Overview

`lib/routing/` is a **pure TypeScript module** with no imports from Next.js, Supabase, or Redis. It takes a `TransitGraph` and a `PlanQuery`, and returns up to three ranked `Itinerary` objects. This isolation makes it independently unit-testable and is a deliberate design signal.

## Graph model

### Nodes
Each **stop** is a node: `{ id, name, lat, lng }`.

### Edges
Three edge types exist in the adjacency list:

| Type | From → To | Cost |
|---|---|---|
| `ride` | consecutive stops on the same line | travel time (haversine / speed) |
| `transfer` | stops on different lines within 500 m | walk time (4.5 km/h) |
| `walk` | implicit access/egress at origin and destination | walk time |

Bidirectional ride edges are created for each consecutive stop pair, so routes are traversable in both directions.

### Transfer detection
Transfer edges are auto-generated at graph build time: for every pair of stops on **different** lines within `TRANSFER_WALK_MAX_KM` (0.5 km), a bidirectional transfer edge is added.

### Speed constants

| Mode | Normal (km/h) |
|---|---|
| jeepney | 18 |
| bus | 24 |
| mrt | 45 |
| lrt | 40 |

## Algorithm — Phase A: time-dependent A\*

The search state is `(stopId, currentLineId)`. Tracking the line prevents the algorithm from treating a "stay on the same line" step and a "board a new line at the same stop" step as identical states.

### Cost function

```
f(n) = g(n) + h(n)
```

- **g(n)**: weighted actual cost to reach state `n`
  ```
  g += edge.timeMin × timeFactor
  g += transferPenalty  (if boarding a new line)
  g += edge.fare × fareFactor
  ```
- **h(n)**: admissible heuristic
  ```
  h = haversine(stop_n, destination) / MAX_SPEED_KMH × 60 × timeFactor
  ```
  `MAX_SPEED_KMH = 60` — never overestimates, so A* remains optimal.

### Multi-objective search

Three independent A* searches run with different weight vectors:

| Objective | timeFactor | transferPenalty | fareFactor |
|---|---|---|---|
| `fastest` | 1.0 | 5 min | 0 |
| `fewest_transfers` | 1.0 | 30 min | 0 |
| `cheapest` | 0.3 | 3 min | 2.0 |

Each search returns the single best path for its objective. Duplicate itineraries (same line sequence) are filtered.

### Priority queue

A binary min-heap keyed on `f`-cost. `O(log n)` push/pop.

## Fare model

```
fare = baseFare + max(0, distKm − 4) × perKmRate
```

Default rules (overridden by `fare_rules` table in Phase 1+):

| Mode | Base fare | Per km |
|---|---|---|
| jeepney | ₱13 | ₱1.80 |
| bus | ₱13 | ₱2.20 |
| MRT | ₱13 | ₱2.50 |
| LRT | ₱12 | ₱2.40 |

## Path reconstruction

After A* finds the destination, the chain of `PQItem` nodes is walked back to origin. Consecutive ride edges on the **same line** are coalesced into a single `RideLeg`. Access/egress walk legs are prepended/appended if origin/destination are more than 50 m from the nearest stop.

## Cache key

```
route:v1:{origin-geohash}:{dest-geohash}:{time-bucket}:{preference}
```

- **geohash**: `lat.toFixed(2),lng.toFixed(2)` — ~1 km grid
- **time-bucket**: `HH:00` or `HH:30` — 30-minute buckets
- **TTL**: 300 seconds

## Phase B: RAPTOR (planned — ADR 0002)

RAPTOR (Round-Based Public Transit Optimised Router) naturally produces Pareto-optimal `{arrival-time, transfers}` sets in O(routes × stops) per round. It will replace the multi-objective A\* once the data model is fully Supabase-backed and timetable data is available.

## Testing

```sh
npm run test -- lib/routing
```

Tests in `lib/routing/__tests__/engine.test.ts` run the router against a known 4-stop fixture graph and verify:
- Correct stop sequence in itinerary legs
- Fare computation
- Transfer detection
- Multi-objective ranking
