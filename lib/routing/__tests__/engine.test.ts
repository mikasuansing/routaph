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

// ── Regression: fare must be charged per boarding in the search cost ─────────
// A long many-edge jeepney line is genuinely cheaper (one boarding, ₱24.80)
// than a single-edge express bus (₱28.25). The old per-edge fare accounting
// charged the jeepney a base fare on EVERY edge (5 × ₱14 ≈ ₱70 in search
// cost), so the `cheapest` objective wrongly preferred the pricier bus.
describe('cheapest objective (per-boarding fare accounting)', () => {
  const P = [0, 1, 2, 3, 4, 5].map(i => ({
    id: 100 + i,
    name: `P${i + 1}`,
    lat: 14.60 + i * 0.018, // ~2 km spacing, ~10 km end to end
    lng: 121.00,
  }));

  const jeepLine = { id: 30, name: 'Long Jeep', mode: 'jeepney' as const, color: '#999' };
  const expressBus = { id: 40, name: 'Express Bus', mode: 'bus' as const, color: '#666' };

  function makeParallelGraph(): TransitGraph {
    const nodes = new Map<number, GraphNode>();
    for (let i = 0; i < 6; i++) {
      const edges: GraphNode['edges'] = [];
      if (i > 0)  edges.push({ type: 'ride', toStopId: P[i - 1].id, lineId: 30, distKm: 2, timeMin: 4 });
      if (i < 5)  edges.push({ type: 'ride', toStopId: P[i + 1].id, lineId: 30, distKm: 2, timeMin: 4 });
      if (i === 0) edges.push({ type: 'ride', toStopId: P[5].id, lineId: 40, distKm: 10, timeMin: 8 });
      if (i === 5) edges.push({ type: 'ride', toStopId: P[0].id, lineId: 40, distKm: 10, timeMin: 8 });
      nodes.set(P[i].id, { stop: P[i], edges });
    }
    const lines = new Map<number, LineData>([
      [30, { line: jeepLine, stops: P }],
      [40, { line: expressBus, stops: [P[0], P[5]] }],
    ]);
    return { nodes, lines, fareRules: DEFAULT_FARE_RULES };
  }

  it('cheapest itinerary is never more expensive than the fastest one', () => {
    const results = planRoute(makeParallelGraph(), {
      originLat: P[0].lat, originLng: P[0].lng,
      destLat:   P[5].lat, destLng:   P[5].lng,
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
    const fastest  = results.find(r => r.objective === 'fastest');
    const cheapest = results.find(r => r.objective === 'cheapest');
    expect(fastest).toBeDefined();
    expect(cheapest).toBeDefined();
    // fastest should take the express bus, cheapest the one-boarding jeepney
    expect(cheapest!.totalFare).toBeLessThanOrEqual(fastest!.totalFare);
    const minFare = Math.min(...results.map(r => r.totalFare));
    expect(cheapest!.totalFare).toBe(minFare);
  });
});

// ── Rush hour: time-dependent routing must actually change durations ─────────
describe('rush-hour congestion', () => {
  it('rush: true yields longer durations than rush: false on road legs', () => {
    const graph = makeGraph();
    const base = { originLat: stopA.lat, originLng: stopA.lng, destLat: stopE.lat, destLng: stopE.lng };
    const offPeak = planRoute(graph, { ...base, rush: false, preference: 'fastest' });
    const rush    = planRoute(graph, { ...base, rush: true,  preference: 'fastest' });
    expect(offPeak.length).toBeGreaterThan(0);
    expect(rush.length).toBeGreaterThan(0);
    expect(rush[0].totalDurationMin).toBeGreaterThan(offPeak[0].totalDurationMin);
  });
});
