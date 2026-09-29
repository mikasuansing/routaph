import { describe, expect, it } from 'vitest';
import { planRoute } from '../engine';
import { DEFAULT_FARE_RULES } from '../fares';
import { buildGraphFromData } from '../graph';
import { floodSegmentKey } from '../utils';
import type { FloodHazard, Itinerary, Line, RideLeg, Stop, TransitGraph } from '../types';

/*
 * Flood-aware routing (docs/flood-data.md). Two bus lines join the same
 * origin and destination:
 *
 *   Direct   O ──── M ──── D          ~4.3 km, straight
 *   Detour   O' ─╱ N ╲─ D'            ~6.3 km, bows north
 *
 * Dry, Direct wins. With Direct's segments flagged and the planner told it's
 * raining, Detour should win, and Direct's durations must not be inflated.
 */

const direct: Line = { id: 20, name: 'Direct Bus', mode: 'bus', color: '#000' };
const detour: Line = { id: 30, name: 'Detour Bus', mode: 'bus', color: '#111' };

const O:  Stop = { id: 1, name: 'O',  lat: 14.6000, lng: 121.000 };
const M:  Stop = { id: 2, name: 'M',  lat: 14.6000, lng: 121.020 };
const D:  Stop = { id: 3, name: 'D',  lat: 14.6000, lng: 121.040 };
const O2: Stop = { id: 4, name: "O'", lat: 14.6002, lng: 121.000 };
const N:  Stop = { id: 5, name: 'N',  lat: 14.6200, lng: 121.020 };
const D2: Stop = { id: 6, name: "D'", lat: 14.6002, lng: 121.040 };

function graph(flooded?: Array<[number, number, number, FloodHazard]>): TransitGraph {
  const g = buildGraphFromData(
    [direct, detour],
    [O, M, D, O2, N, D2],
    [[20, [1, 2, 3]], [30, [4, 5, 6]]],
    DEFAULT_FARE_RULES,
  );
  if (flooded) {
    g.floodSegments = new Map();
    for (const [line, a, b, hazard] of flooded) {
      g.floodSegments.set(floodSegmentKey(line, a, b), hazard);
      g.floodSegments.set(floodSegmentKey(line, b, a), hazard);
    }
  }
  return g;
}

const DIRECT_FLOODED: Array<[number, number, number, FloodHazard]> = [[20, 1, 2, 3], [20, 2, 3, 3]];

function plan(g: TransitGraph, floodAware?: boolean): Itinerary[] {
  return planRoute(g, {
    originLat: O.lat, originLng: O.lng, destLat: D.lat, destLng: D.lng,
    rush: false, preference: 'fastest', floodAware,
  });
}

function lines(it: Itinerary): string[] {
  return it.legs.filter((l): l is RideLeg => l.type === 'ride').map(l => l.line.name);
}

describe('flood-aware routing', () => {
  it('takes the direct road when dry', () => {
    const [best] = plan(graph(DIRECT_FLOODED), false);
    expect(lines(best)).toEqual(['Direct Bus']);
    expect(best.floodAware).toBeUndefined();
  });

  it('steers onto the detour when the direct road is flood-prone and it is raining', () => {
    const [best] = plan(graph(DIRECT_FLOODED), true);
    expect(lines(best)).toEqual(['Detour Bus']);
    expect(best.floodAware).toBe(true);
  });

  it('tags a flood-prone leg without inflating its displayed duration', () => {
    const dry = plan(graph(DIRECT_FLOODED), false)[0];
    const wet = planRoute(graph(DIRECT_FLOODED), {
      originLat: O.lat, originLng: O.lng, destLat: D.lat, destLng: D.lng,
      rush: false, floodAware: true, excludeLines: [30],
    })[0];
    const leg = wet.legs.find((l): l is RideLeg => l.type === 'ride')!;
    expect(leg.floodProne).toEqual({ hazard: 3, segments: 2 });
    expect(wet.totalDurationMin).toBe(dry.totalDurationMin);
  });

  it('reports the worst hazard crossed on a leg', () => {
    const g = graph([[20, 1, 2, 2], [20, 2, 3, 3]]);
    const [it0] = planRoute(g, {
      originLat: O.lat, originLng: O.lng, destLat: D.lat, destLng: D.lng,
      rush: false, floodAware: true, excludeLines: [30],
    });
    const leg = it0.legs.find((l): l is RideLeg => l.type === 'ride')!;
    expect(leg.floodProne).toEqual({ hazard: 3, segments: 2 });
  });

  it('does not claim flood-awareness when the hazard data failed to load', () => {
    const [best] = plan(graph(), true);
    expect(lines(best)).toEqual(['Direct Bus']);
    expect(best.floodAware).toBeUndefined();
    expect(best.legs.some(l => l.type === 'ride' && l.floodProne)).toBe(false);
  });

  it('ignores flood data unless asked', () => {
    const [best] = plan(graph(DIRECT_FLOODED));
    expect(lines(best)).toEqual(['Direct Bus']);
    expect(best.floodAware).toBeUndefined();
  });
});
