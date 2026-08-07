# ADR 0002 — A* now, RAPTOR later

**Date:** 2026-06-20  
**Status:** Accepted

## Context

ParaPo needs a multimodal transit router that:
- Returns ranked itineraries by different objectives (time, transfers, cost).
- Runs fast enough for interactive use (target: warm < 100 ms via Redis cache).
- Is demonstrably from scratch — not a wrapper around Google/HERE/OTP.

Algorithms considered:
- **Dijkstra** — correct but no heuristic; slower for large graphs.
- **A\*** — Dijkstra + admissible heuristic; faster in practice.
- **RAPTOR** — round-based, inherently Pareto-optimal for {time, transfers}; used by OpenTripPlanner and research literature.
- **Transfer Patterns** — pre-computation-heavy; overkill for this graph size.

## Decision

**Phase A (now):** Time-dependent A\* with great-circle heuristic and configurable transfer penalties. Three independent searches produce fastest / fewest-transfers / cheapest itineraries.

**Phase B (differentiator, ADR pending):** Upgrade to RAPTOR once timetable data (departure times per trip) is available in the DB. RAPTOR handles frequency-based routing more naturally than A\*.

## Consequences

**Phase A positives:**
- Implementable immediately with the current data model (no timetable needed).
- A\* is well-understood; easy to explain in a portfolio context.
- Three-objective approach produces diverse itineraries from one codebase.
- Pure TypeScript module — fully unit-testable without a DB.

**Phase A negatives:**
- Three separate searches are 3× the work of one Pareto-optimal search.
- Without real departure times, travel time is computed from average speed — an approximation.
- Transfer detection is distance-based, not schedule-based.

**Phase B justification:**
- RAPTOR is a recognised, peer-reviewed algorithm (Delling et al., 2012).
- Implementing it is a concrete portfolio signal that the engineer understands production transit routing systems.
- The transition from A\* to RAPTOR will be documented in a follow-up ADR.
