import { describe, it, expect } from 'vitest';
import { computeFare, findFareRule, DEFAULT_FARE_RULES } from '../fares';
import type { FareRule } from '../types';

// LRT-1 and LRT-2 share engine mode 'lrt' but are priced very differently
// (LRT-2 has the 50% DOTr discount; LRT-1 is LRMC-operated and does not).
// Line-scoped rules must always beat mode-level defaults.
const LRT2_DISCOUNTED: FareRule = { lineId: 4, mode: 'lrt', baseFare: 8,     perKmRate: 0.46, flagDistanceKm: 0 };
const LRT1_FULL_PRICE: FareRule = { lineId: 5, mode: 'lrt', baseFare: 16.25, perKmRate: 1.47, flagDistanceKm: 0 };
const rules: FareRule[] = [LRT2_DISCOUNTED, LRT1_FULL_PRICE, ...DEFAULT_FARE_RULES];

describe('fare rules', () => {
  it('line-specific rule beats the mode default', () => {
    expect(findFareRule('lrt', 4, rules)).toBe(LRT2_DISCOUNTED);
    expect(findFareRule('lrt', 5, rules)).toBe(LRT1_FULL_PRICE);
  });

  it('same distance costs more on LRT-1 than discounted LRT-2', () => {
    const lrt2 = computeFare('lrt', 10, 4, rules);
    const lrt1 = computeFare('lrt', 10, 5, rules);
    expect(lrt2).toBeCloseTo(8 + 10 * 0.46, 2);      // ₱12.60
    expect(lrt1).toBeCloseTo(16.25 + 10 * 1.47, 2);  // ₱30.95
    expect(lrt1).toBeGreaterThan(lrt2);
  });

  it('falls back to the mode default for unknown lines', () => {
    const rule = findFareRule('lrt', 999, rules);
    expect(rule?.lineId).toBeNull();
    expect(rule?.baseFare).toBe(8); // 2026 default (LRT-2 discounted matrix)
  });

  it('road modes keep their flag distance (no per-km inside the window)', () => {
    expect(computeFare('jeepney', 3, 999, rules)).toBe(14);           // within 4 km flag
    expect(computeFare('jeepney', 6, 999, rules)).toBeCloseTo(14 + 2 * 2.00, 2);
    expect(computeFare('bus', 5, 999, rules)).toBe(18);               // within 5 km flag
  });

  it('walking is free', () => {
    expect(computeFare('walk', 5, 999, rules)).toBe(0);
  });
});

/*
 * Rail fares are published as a matrix with a ceiling, not as an open-ended
 * per-km rate. `base + rate x km` approximates the middle of that matrix and
 * runs past the end of it: before capping, the full length of LRT-1 priced
 * at ₱51 against a published ₱15-30 matrix.
 */
describe('fare ceilings', () => {
  const CAPPED_LRT1: FareRule = {
    lineId: 5, mode: 'lrt', baseFare: 16.25, perKmRate: 1.47, flagDistanceKm: 0, maxFare: 30,
  };
  const capped: FareRule[] = [CAPPED_LRT1, ...DEFAULT_FARE_RULES];

  it('clamps a long journey to the published maximum', () => {
    // 23.6 km is the real end-to-end length of LRT-1 including the Cavite
    // Extension; uncapped this is ₱50.94.
    expect(computeFare('lrt', 23.6, 5, capped)).toBe(30);
  });

  it('leaves fares below the ceiling untouched', () => {
    expect(computeFare('lrt', 5, 5, capped)).toBeCloseTo(16.25 + 5 * 1.47, 2);
  });

  it('never returns less than the base fare for a short hop', () => {
    expect(computeFare('lrt', 0.4, 5, capped)).toBeGreaterThanOrEqual(16.25);
  });

  it('caps the discounted rail defaults at their matrix maximums', () => {
    // MRT-3 ₱6-14 and LRT-2 ₱8-18 per the 2026 DOTr discount.
    expect(computeFare('mrt', 100, 999, DEFAULT_FARE_RULES)).toBe(14);
    expect(computeFare('lrt', 100, 999, DEFAULT_FARE_RULES)).toBe(18);
  });

  it('leaves road modes uncapped', () => {
    // LTFRB publishes a per-km rate for jeepney and bus with no ceiling, so
    // there is no honest number to clamp to — inventing one would be a
    // bigger error than the overshoot on a very long ride.
    const far = computeFare('bus', 40, 999, DEFAULT_FARE_RULES);
    expect(far).toBeCloseTo(18 + 35 * 2.98, 2);
    expect(computeFare('jeepney', 30, 999, DEFAULT_FARE_RULES)).toBeCloseTo(14 + 26 * 2.0, 2);
  });
});
