import { describe, it, expect, vi } from 'vitest';
import type { Itinerary } from '@/lib/routing/types';

// context.tsx imports supabaseBrowser at module scope, which constructs a
// real supabase-js client (needs a WebSocket global this Node test env
// doesn't have) — irrelevant to the pure reducer under test, so mock it out.
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: {} }));

const { reducer, INITIAL } = await import('../context');

const itinerary: Itinerary = {
  legs: [
    { type: 'ride', mode: 'mrt', line: { id: 3, name: 'MRT-3', mode: 'mrt', color: '#000' },
      from: { id: 1, name: 'A', lat: 14.6, lng: 121.0 }, to: { id: 2, name: 'B', lat: 14.61, lng: 121.0 },
      stops: [], distKm: 2, durationMin: 4, fare: 13 },
    { type: 'walk', fromName: 'B', toName: 'C', fromLat: 14.61, fromLng: 121.0, toLat: 14.615, toLng: 121.0, distKm: 0.3, durationMin: 4 },
    { type: 'ride', mode: 'lrt', line: { id: 4, name: 'LRT-2', mode: 'lrt', color: '#000' },
      from: { id: 3, name: 'C', lat: 14.615, lng: 121.0 }, to: { id: 4, name: 'D', lat: 14.62, lng: 121.0 },
      stops: [], distKm: 1.5, durationMin: 3, fare: 8 },
  ],
  totalDurationMin: 11,
  totalFare: 21,
  transfers: 1,
  objective: 'fastest',
};

describe('trip reducer — RESUME (signal-loss / reload resilience)', () => {
  it('resumes at the given leg instead of restarting at leg 0', () => {
    const state = reducer(INITIAL, { type: 'RESUME', itinerary, legIndex: 2 });
    expect(state.status).toBe('active');
    expect(state.currentLegIndex).toBe(2);
    expect(state.itinerary).toBe(itinerary);
  });

  it('computes originalDest from the itinerary, same as START', () => {
    const state = reducer(INITIAL, { type: 'RESUME', itinerary, legIndex: 1 });
    expect(state.originalDest).toEqual({ lat: 14.62, lng: 121.0 }); // last leg's `to`
  });

  it('clamps a legIndex beyond the itinerary length', () => {
    const state = reducer(INITIAL, { type: 'RESUME', itinerary, legIndex: 99 });
    expect(state.currentLegIndex).toBe(itinerary.legs.length - 1);
  });

  it('clamps a negative legIndex to 0', () => {
    const state = reducer(INITIAL, { type: 'RESUME', itinerary, legIndex: -5 });
    expect(state.currentLegIndex).toBe(0);
  });

  it('resets transient fields (gpsDenied, position, reroutes) like a fresh START', () => {
    const dirty = { ...INITIAL, gpsDenied: true, reroutes: [itinerary], activeDisruption: { id: 1, corridorId: 1, startAt: '', endAt: null, description: 'x' } };
    const state = reducer(dirty, { type: 'RESUME', itinerary, legIndex: 1 });
    expect(state.gpsDenied).toBe(false);
    expect(state.reroutes).toEqual([]);
    expect(state.activeDisruption).toBeNull();
  });

  it('ADVANCE_LEG from a resumed state continues forward correctly', () => {
    const resumed = reducer(INITIAL, { type: 'RESUME', itinerary, legIndex: 1 });
    const advanced = reducer(resumed, { type: 'ADVANCE_LEG' });
    expect(advanced.currentLegIndex).toBe(2);
    expect(advanced.status).toBe('active');
  });
});
