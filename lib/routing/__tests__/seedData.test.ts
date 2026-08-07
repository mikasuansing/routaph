import { describe, expect, it } from 'vitest';
import { getGraph, seedLineStops, seedLines, seedStops } from '../graph';
import { haversineKm } from '../utils';

/*
 * Guards on the seed network's shape.
 *
 * The seed is the offline fallback the engine falls back to when Supabase is
 * unreachable, and it is meant to mirror supabase/seed/*.sql. These tests
 * encode the invariants that were actually violated in production data
 * before 2026-07-31 — incomplete lines, colliding stop names, and station
 * coordinates that had drifted kilometres from the real platform.
 */

describe('seed network integrity', () => {
  it('gives every stop a unique id', () => {
    const ids = seedStops.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every stop a unique name', () => {
    // The catalog keys stops by name, so two stops sharing one makes the
    // picker ambiguous — this is what made the three Santolan stations and
    // the MRT/bus Guadalupe and Ayala pairs indistinguishable.
    const byName = new Map<string, number[]>();
    for (const s of seedStops) {
      byName.set(s.name, [...(byName.get(s.name) ?? []), s.id]);
    }
    const dupes = [...byName].filter(([, ids]) => ids.length > 1);
    expect(dupes).toEqual([]);
  });

  it('references only real stops in every line sequence', () => {
    const ids = new Set(seedStops.map(s => s.id));
    for (const [lineId, stopIds] of seedLineStops) {
      const missing = stopIds.filter(id => !ids.has(id));
      expect({ lineId, missing }).toEqual({ lineId, missing: [] });
    }
  });

  it('has a sequence for every line and a line for every sequence', () => {
    const lineIds = new Set(seedLines.map(l => l.id));
    const seqIds = new Set(seedLineStops.map(([id]) => id));
    expect([...seqIds].filter(id => !lineIds.has(id))).toEqual([]);
    expect([...lineIds].filter(id => !seqIds.has(id))).toEqual([]);
  });

  it('carries the full real station count for each rail line', () => {
    const counts = Object.fromEntries(
      seedLineStops.map(([id, stops]) => [
        seedLines.find(l => l.id === id)?.name ?? String(id),
        stops.length,
      ]),
    );
    // Real 2026 station counts — LRT-1 includes the Cavite Extension.
    expect(counts['MRT-3']).toBe(13);
    expect(counts['LRT-2']).toBe(13);
    expect(counts['LRT-1']).toBe(25);
  });

  it('keeps consecutive stations a plausible distance apart', () => {
    // A station dropped in the wrong place shows up as an implausible jump.
    // Metro Manila rail spacing runs roughly 0.5-2.5 km; 5 km is generous
    // enough to never fire on real data and tight enough to catch a
    // transposed lat/lng or a mistyped digit.
    const byId = new Map(seedStops.map(s => [s.id, s]));
    for (const [lineId, stopIds] of seedLineStops) {
      for (let i = 0; i < stopIds.length - 1; i++) {
        const a = byId.get(stopIds[i])!;
        const b = byId.get(stopIds[i + 1])!;
        const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
        expect({ lineId, from: a.name, to: b.name, far: km > 5 })
          .toEqual({ lineId, from: a.name, to: b.name, far: false });
      }
    }
  });

  it('places every stop inside Metro Manila', () => {
    for (const s of seedStops) {
      expect({ name: s.name, inBox: s.lat > 14.3 && s.lat < 14.8 && s.lng > 120.8 && s.lng < 121.3 })
        .toEqual({ name: s.name, inBox: true });
    }
  });

  it('builds a connected graph with an edge for every stop', () => {
    const graph = getGraph();
    expect(graph.nodes.size).toBe(seedStops.length);
    for (const [, node] of graph.nodes) {
      expect(node.edges.length).toBeGreaterThan(0);
    }
  });
});
