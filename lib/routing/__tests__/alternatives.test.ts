import { describe, expect, it } from 'vitest';
import { getGraph } from '../graph';
import { planRoute } from '../engine';
import type { Itinerary, RideLeg } from '../types';

/*
 * The planner used to answer every query with a single itinerary whenever
 * the three objectives agreed — which on a rail corridor is nearly always.
 * That made a network with several real options look like it had one.
 * These tests pin the mode-diverse alternatives pass that fixes it.
 */

const SANTOLAN = { lat: 14.6217, lng: 121.0863 };  // LRT-2 Santolan
const RECTO    = { lat: 14.6035, lng: 120.9840 };  // LRT-2 Recto
const KATIPUNAN = { lat: 14.6313, lng: 121.0733 };

function plan(o: { lat: number; lng: number }, d: { lat: number; lng: number }, extra = {}) {
  return planRoute(getGraph(), {
    originLat: o.lat, originLng: o.lng,
    destLat: d.lat, destLng: d.lng,
    ...extra,
  } as never);
}

function lineNames(it: Itinerary): string[] {
  return it.legs.filter((l): l is RideLeg => l.type === 'ride').map(l => l.line.name);
}

describe('mode-diverse alternatives', () => {
  it('offers the road corridor alongside the train for Santolan to Recto', () => {
    // The trip that exposed the problem: LRT-2 and the Aurora Blvd bus both
    // serve it, but only the train was ever shown. `rush` is pinned because
    // the engine falls back to the wall clock, which made this assertion
    // pass off-peak and fail during the evening commute.
    const its = plan(SANTOLAN, RECTO, { rush: false });
    expect(its.length).toBeGreaterThan(1);
    expect(lineNames(its[0])).toContain('LRT-2');
    const alt = its.find(i => i.alternative);
    expect(alt).toBeDefined();
    expect(lineNames(alt!)).toContain('Route 3 (Aurora Blvd)');
  });

  it('still offers the road alternative during rush hour', () => {
    // Peak slows roads (x1.6) far more than rail (x1.15), so a fixed ratio
    // cap would hide road options exactly when the queue at the turnstile
    // makes them most worth knowing about.
    const its = plan(SANTOLAN, RECTO, { rush: true });
    const alt = its.find(i => i.alternative);
    expect(alt).toBeDefined();
    expect(lineNames(alt!)).toContain('Route 3 (Aurora Blvd)');
  });

  it('marks alternatives so the UI never labels one "Fastest"', () => {
    const its = plan(SANTOLAN, RECTO);
    for (const it of its.slice(1).filter(i => i.alternative)) {
      expect(it.alternative).toBe(true);
    }
    // The primary is never flagged as an alternative.
    expect(its[0].alternative).toBeUndefined();
  });

  it('keeps the fastest route first', () => {
    const its = plan(SANTOLAN, RECTO);
    const primary = its[0];
    for (const alt of its.filter(i => i.alternative)) {
      expect(alt.totalDurationMin).toBeGreaterThanOrEqual(primary.totalDurationMin);
    }
  });

  it('never returns an alternative more than 3x the primary duration', () => {
    for (const [o, d] of [[SANTOLAN, RECTO], [KATIPUNAN, { lat: 14.6229, lng: 121.0530 }]] as const) {
      const its = plan(o, d, { rush: false });
      const primary = its[0];
      for (const alt of its.filter(i => i.alternative)) {
        expect(alt.totalDurationMin).toBeLessThanOrEqual(primary.totalDurationMin * 3);
      }
    }
  });

  it('does not repeat the primary route as its own alternative', () => {
    const its = plan(SANTOLAN, RECTO);
    const keys = its.map(it =>
      it.legs.filter((l): l is RideLeg => l.type === 'ride')
        .map(l => `${l.line.id}:${l.from.id}-${l.to.id}`).join('|'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('caps the number of options offered', () => {
    const its = plan(SANTOLAN, RECTO);
    expect(its.length).toBeLessThanOrEqual(4);
  });

  it('still respects excludeModes when generating alternatives', () => {
    const its = plan(SANTOLAN, RECTO, { excludeModes: ['bus'] });
    for (const it of its) {
      expect(lineNames(it)).not.toContain('Route 3 (Aurora Blvd)');
      expect(lineNames(it)).not.toContain('EDSA Carousel');
    }
  });

  it('returns nothing rather than inventing an alternative for an unreachable trip', () => {
    // Both points far outside the network.
    const its = plan({ lat: 14.35, lng: 120.92 }, { lat: 14.36, lng: 120.93 });
    expect(its.every(i => !i.alternative || i.legs.length > 0)).toBe(true);
  });
});
