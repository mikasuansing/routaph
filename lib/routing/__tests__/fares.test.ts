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
