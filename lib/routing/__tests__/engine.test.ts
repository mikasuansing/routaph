import { describe, it, expect } from 'vitest';
import { planRoute } from '../engine';
import { DEFAULT_FARE_RULES } from '../fares';
import type { GraphNode, Line, LineData, Stop, TransitGraph } from '../types';

// ── Fixture graph ─────────────────────────────────────────────────────────────
// A minimal 4-stop, 2-line graph with a known optimal path.
//
//   A ──(MRT)──► B ──(MRT)──► C
//                │
//             (walk 200m)
//                │
//                D ──(Bus)──► E
//
// Shortest path A→E: MRT A→B, walk B→D, Bus D→E

// All stops chosen so that stopE is only reachable via Bus (>2 km from A/B/D by air).
// The Bus ride edge (D→E) spans the gap; direct walking is excluded by maxKm=2.
const stopA: Stop = { id: 1, name: 'Stop A', lat: 14.60, lng: 121.00 };
const stopB: Stop = { id: 2, name: 'Stop B', lat: 14.61, lng: 121.00 };
const stopC: Stop = { id: 3, name: 'Stop C', lat: 14.62, lng: 121.00 };
const stopD: Stop = { id: 4, name: 'Stop D', lat: 14.61, lng: 121.002 }; // ~200 m east of B
const stopE: Stop = { id: 5, name: 'Stop E', lat: 14.61, lng: 121.06 };  // ~6.5 km east of B

const mrtLine: Line = { id: 10, name: 'Test MRT', mode: 'mrt', color: '#E63946' };
const busLine: Line = { id: 20, name: 'Test Bus', mode: 'bus', color: '#D05A28' };

function makeGraph(): TransitGraph {
  const nodes = new Map<number, GraphNode>([
    [1, { stop: stopA, edges: [
      { type: 'ride', toStopId: 2, lineId: 10, distKm: 1.1, timeMin: 2 },
    ]}],
    [2, { stop: stopB, edges: [
      { type: 'ride', toStopId: 1, lineId: 10, distKm: 1.1, timeMin: 2 },
      { type: 'ride', toStopId: 3, lineId: 10, distKm: 1.1, timeMin: 2 },
      { type: 'transfer', toStopId: 4, distKm: 0.2, timeMin: 3 },
    ]}],
    [3, { stop: stopC, edges: [
      { type: 'ride', toStopId: 2, lineId: 10, distKm: 1.1, timeMin: 2 },
    ]}],
    [4, { stop: stopD, edges: [
      { type: 'transfer', toStopId: 2, distKm: 0.2, timeMin: 3 },
      { type: 'ride', toStopId: 5, lineId: 20, distKm: 0.9, timeMin: 3 },
    ]}],
    [5, { stop: stopE, edges: [
      { type: 'ride', toStopId: 4, lineId: 20, distKm: 0.9, timeMin: 3 },
    ]}],
  ]);

  const lines = new Map<number, LineData>([
    [10, { line: mrtLine, stops: [stopA, stopB, stopC] }],
    [20, { line: busLine, stops: [stopD, stopE] }],
  ]);

  return { nodes, lines, fareRules: DEFAULT_FARE_RULES };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('planRoute', () => {
  const graph = makeGraph();

  it('returns at least one itinerary for a reachable A→E query', () => {
    const results = planRoute(graph, {
      originLat: stopA.lat, originLng: stopA.lng,
      destLat:   stopE.lat, destLng:   stopE.lng,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('fastest itinerary uses MRT then Bus (multimodal)', () => {
    const results = planRoute(graph, {
      originLat: stopA.lat, originLng: stopA.lng,
      destLat:   stopE.lat, destLng:   stopE.lng,
      preference: 'fastest',
    });
    expect(results).toHaveLength(1);
    const rideLegs = results[0].legs.filter(l => l.type === 'ride');
    const modes = rideLegs.map(l => (l as { mode: string }).mode);
    expect(modes).toContain('mrt');
    expect(modes).toContain('bus');
  });

  it('records exactly 1 transfer for the A→E path', () => {
    const results = planRoute(graph, {
      originLat: stopA.lat, originLng: stopA.lng,
      destLat:   stopE.lat, destLng:   stopE.lng,
      preference: 'fastest',
    });
    expect(results[0].transfers).toBe(1);
  });

  it('totalFare is positive', () => {
    const results = planRoute(graph, {
      originLat: stopA.lat, originLng: stopA.lng,
      destLat:   stopE.lat, destLng:   stopE.lng,
      preference: 'fastest',
    });
    expect(results[0].totalFare).toBeGreaterThan(0);
  });

  it('returns empty array when origin and destination are unreachable', () => {
    const results = planRoute(graph, {
      originLat: 0, originLng: 0,   // far from all stops
      destLat:   1, destLng:   1,
    });
    expect(results).toHaveLength(0);
  });

  it('same-stop query (< 50 m) returns itinerary with 0 ride legs', () => {
    const results = planRoute(graph, {
      originLat: stopA.lat,      originLng: stopA.lng,
      destLat:   stopA.lat + 0.0001, destLng: stopA.lng,  // ~11 m away
    });
    // Should either return empty or a trivial walk-only result
    if (results.length > 0) {
      const rideLegs = results[0].legs.filter(l => l.type === 'ride');
      expect(rideLegs).toHaveLength(0);
    }
  });
});
