# ADR 0001 — PostGIS over a dedicated graph database

**Date:** 2026-06-20  
**Status:** Accepted

## Context

The routing engine needs to:
1. Find stops near an arbitrary lat/lng (access/egress KNN query).
2. Find stops near each other for transfer edge generation (ST_DWithin).
3. Store route geometry for map rendering (linestring per route).
4. Serve analytics queries over stops and origin-destination pairs.

Candidate stores considered:
- **PostGIS** (extension on Postgres/Supabase)
- **Neo4j** (dedicated graph DB)
- **pgRouting** (Postgres extension for graph algorithms)

## Decision

Use **PostGIS on Supabase Postgres**. The transit graph is loaded into memory at application start and traversed in TypeScript (A*). PostGIS is used for spatial queries only (KNN, DWithin, isochrone hull).

## Consequences

**Positive:**
- Single infrastructure dependency — no additional managed service.
- Supabase provides PostGIS out of the box; no extra setup.
- KNN and DWithin queries are fast with a GIST index on `stops.geom`.
- RLS, migrations, and backups work the same as for all other tables.
- Simplifies the portfolio story: one database, one mental model.

**Negative:**
- In-memory graph must be rebuilt on cold start or data change.
- No native graph traversal primitives — algorithm is handwritten TypeScript.
- pgRouting was considered but rejected: it couples the algorithm to SQL, making it harder to test in isolation and harder to migrate to RAPTOR.

**Mitigation:**
- Graph is built once and cached in module scope (`_graph` in `graph.ts`).
- `invalidateGraph()` export allows forced rebuild when transit data changes.
- The in-memory graph for Metro Manila's network fits comfortably in RAM (<1 MB for hundreds of stops).
