/**
 * Component tests for lib/trip/geo.ts — leg auto-advance logic.
 *
 * shouldAdvanceLeg, distToNextStop, etaToNextStop are pure functions;
 * no DOM or fetch needed.
 */
import { describe, it, expect } from 'vitest';
import { shouldAdvanceLeg, distToNextStop, etaToNextStop, ADVANCE_THRESHOLD_KM } from '../geo';
import type { GeoPosition } from '../types';
import type { Itinerary, RideLeg, WalkLeg } from '@/lib/routing/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const stopFrom = { id: 1, name: 'From', lat: 14.60, lng: 121.00 };
const stopTo   = { id: 2, name: 'To',   lat: 14.61, lng: 121.01 };
const stopFar  = { id: 3, name: 'Far',  lat: 14.80, lng: 121.20 };

const rideLeg: RideLeg = {
  type: 'ride',
  mode: 'mrt',
  line: { id: 10, name: 'MRT', mode: 'mrt', color: '#000' },
  from: stopFrom,
  to:   stopTo,
  stops: [stopFrom, stopTo],
  distKm: 1.5,
  durationMin: 5,
  fare: 13,
};

const walkLeg: WalkLeg = {
  type: 'walk',
  fromName: 'Stop To', toName: 'Destination',
  fromLat: stopTo.lat,  fromLng: stopTo.lng,
  toLat:   14.615,      toLng:   121.015,
  distKm: 0.5, durationMin: 7,
};

function makeItinerary(legs = [rideLeg, walkLeg]): Itinerary {
  return {
    legs,
    totalDurationMin: 12,
    totalFare: 13,
    transfers: 0,
    objective: 'fastest',
  };
}

function pos(lat: number, lng: number): GeoPosition {
  return { lat, lng, accuracyM: 10, timestamp: Date.now() };
}

// ── shouldAdvanceLeg ──────────────────────────────────────────────────────────

describe('shouldAdvanceLeg', () => {
  it('returns true when within ADVANCE_THRESHOLD_KM of arrival stop', () => {
    // Position exactly at the ride-leg destination stop
    const p = pos(stopTo.lat, stopTo.lng);
    expect(shouldAdvanceLeg(p, makeItinerary(), 0)).toBe(true);
  });

  it('returns false when far from arrival stop', () => {
    const p = pos(stopFar.lat, stopFar.lng);
    expect(shouldAdvanceLeg(p, makeItinerary(), 0)).toBe(false);
  });

  it('returns true when within threshold for a walk leg', () => {
    // Walk leg destination is (14.615, 121.015); position right on top of it
    const p = pos(14.615, 121.015);
    expect(shouldAdvanceLeg(p, makeItinerary(), 1)).toBe(true);
  });

  it('returns false for walk leg when position is far', () => {
    const p = pos(14.60, 121.00);  // ~1.5 km from walk destination
    expect(shouldAdvanceLeg(p, makeItinerary(), 1)).toBe(false);
  });

  it('returns false when legIndex is out of bounds', () => {
    const p = pos(stopTo.lat, stopTo.lng);
    expect(shouldAdvanceLeg(p, makeItinerary(), 99)).toBe(false);
  });

  it('ADVANCE_THRESHOLD_KM is 0.15 (150 m)', () => {
    expect(ADVANCE_THRESHOLD_KM).toBe(0.15);
  });
});

// ── distToNextStop ────────────────────────────────────────────────────────────

describe('distToNextStop', () => {
  it('returns a positive number for a reachable next stop', () => {
    const p = pos(stopFrom.lat, stopFrom.lng);
    const dist = distToNextStop(p, makeItinerary(), 0);
    expect(dist).not.toBeNull();
    expect(dist!).toBeGreaterThan(0);
  });

  it('returns roughly 1.5 km from start of ride to its arrival stop', () => {
    // stopFrom → stopTo is the ride leg; dist should be ~1.5 km
    const p = pos(stopFrom.lat, stopFrom.lng);
    const dist = distToNextStop(p, makeItinerary(), 0);
    // Haversine between (14.60,121.00) and (14.61,121.01) is ~1.5 km
    expect(dist!).toBeGreaterThan(1.0);
    expect(dist!).toBeLessThan(2.5);
  });

  it('returns null when legIndex is out of bounds', () => {
    const p = pos(stopFrom.lat, stopFrom.lng);
    expect(distToNextStop(p, makeItinerary(), 99)).toBeNull();
  });

  it('returns near-zero when position is at the arrival stop', () => {
    const p = pos(stopTo.lat, stopTo.lng);
    const dist = distToNextStop(p, makeItinerary(), 0);
    expect(dist!).toBeLessThan(ADVANCE_THRESHOLD_KM);
  });
});

// ── etaToNextStop ─────────────────────────────────────────────────────────────

describe('etaToNextStop', () => {
  it('returns a positive integer (minutes) for a reachable stop', () => {
    const p = pos(stopFrom.lat, stopFrom.lng);
    const eta = etaToNextStop(p, makeItinerary(), 0);
    expect(eta).not.toBeNull();
    expect(eta!).toBeGreaterThanOrEqual(1);
  });

  it('returns a lower ETA when speed is provided', () => {
    const p = pos(stopFrom.lat, stopFrom.lng);
    const slowEta = etaToNextStop(p, makeItinerary(), 0, 0);         // walking speed fallback
    const fastEta = etaToNextStop(p, makeItinerary(), 0, 20);        // 20 m/s (hypothetical fast)
    expect(fastEta!).toBeLessThanOrEqual(slowEta!);
  });

  it('returns null when legIndex is out of bounds', () => {
    const p = pos(stopFrom.lat, stopFrom.lng);
    expect(etaToNextStop(p, makeItinerary(), 99)).toBeNull();
  });
});
