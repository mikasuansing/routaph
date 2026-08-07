import { describe, expect, it } from 'vitest';
import { bearingBetween, bearingDelta } from '../geo';

/*
 * Heading drives the Waze-style camera: the map turns so the direction of
 * travel points up. `GeolocationCoordinates.heading` is null whenever the
 * device is still and null outright on most desktop browsers, so this
 * bearing is what the trip screen actually rotates to most of the time.
 */

const MANILA = { lat: 14.5995, lng: 120.9842 };

describe('bearingBetween', () => {
  it('reads due north as 0', () => {
    expect(bearingBetween(MANILA.lat, MANILA.lng, MANILA.lat + 0.1, MANILA.lng)).toBeCloseTo(0, 1);
  });

  it('reads due east as 90', () => {
    expect(bearingBetween(MANILA.lat, MANILA.lng, MANILA.lat, MANILA.lng + 0.1)).toBeCloseTo(90, 0);
  });

  it('reads due south as 180', () => {
    expect(bearingBetween(MANILA.lat, MANILA.lng, MANILA.lat - 0.1, MANILA.lng)).toBeCloseTo(180, 1);
  });

  it('reads due west as 270', () => {
    expect(bearingBetween(MANILA.lat, MANILA.lng, MANILA.lat, MANILA.lng - 0.1)).toBeCloseTo(270, 0);
  });

  it('always returns a value in [0, 360)', () => {
    const points: Array<[number, number]> = [
      [14.70, 121.10], [14.50, 120.90], [14.65, 120.95], [14.52, 121.15],
    ];
    for (const [lat, lng] of points) {
      const b = bearingBetween(MANILA.lat, MANILA.lng, lat, lng);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it('matches the real bearing along LRT-2 (Recto to Antipolo runs east)', () => {
    const b = bearingBetween(14.603467, 120.983984, 14.624771, 121.121380);
    expect(b).toBeGreaterThan(70);
    expect(b).toBeLessThan(90);
  });
});

describe('bearingDelta', () => {
  it('takes the short way across north', () => {
    // The whole point: 350 to 10 is a 20 degree nudge right, not a 340
    // degree spin left. Without this the camera lurches the long way round
    // every time a rider crosses north.
    expect(bearingDelta(350, 10)).toBe(20);
    expect(bearingDelta(10, 350)).toBe(-20);
  });

  it('is zero for no change', () => {
    expect(bearingDelta(123, 123)).toBe(0);
  });

  it('stays within [-180, 180]', () => {
    for (const [a, b] of [[0, 179], [0, 181], [90, 270], [270, 90], [45, 225]] as const) {
      const d = bearingDelta(a, b);
      expect(d).toBeGreaterThanOrEqual(-180);
      expect(d).toBeLessThanOrEqual(180);
    }
  });

  it('handles a straight reversal', () => {
    expect(Math.abs(bearingDelta(0, 180))).toBe(180);
  });
});
