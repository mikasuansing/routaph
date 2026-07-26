import { describe, it, expect } from 'vitest';
import { beepAdjustedFare, beepAdjustedTotalFare, type FareLegLike } from '../beepFare';

describe('beepAdjustedFare', () => {
  it('LRT-1 costs more on cash than beep, with a note', () => {
    const leg: FareLegLike = { mode: 'lrt', line: { name: 'LRT-1' }, fare: 20 };
    expect(beepAdjustedFare(leg, true)).toEqual({ displayFare: 20 });
    const cash = beepAdjustedFare(leg, false);
    expect(cash.displayFare).toBeCloseTo(25, 2);
    expect(cash.note).toMatch(/20%/);
  });

  it('MRT-3 fare is unchanged but flags that cash is not accepted', () => {
    const leg: FareLegLike = { mode: 'mrt', line: { name: 'MRT-3' }, fare: 10 };
    expect(beepAdjustedFare(leg, true)).toEqual({ displayFare: 10 });
    const cash = beepAdjustedFare(leg, false);
    expect(cash.displayFare).toBe(10);
    expect(cash.note).toMatch(/discontinued/i);
  });

  it('LRT-2 fare is identical either way (discount applies to both)', () => {
    const leg: FareLegLike = { mode: 'lrt', line: { name: 'LRT-2' }, fare: 12 };
    expect(beepAdjustedFare(leg, true)).toEqual({ displayFare: 12 });
    expect(beepAdjustedFare(leg, false).displayFare).toBe(12);
  });

  it('bus and jeepney are unaffected by the toggle', () => {
    const bus: FareLegLike = { mode: 'bus', line: { name: 'EDSA Carousel' }, fare: 18 };
    const jeep: FareLegLike = { mode: 'jeepney', line: { name: 'Katipunan Jeepney' }, fare: 14 };
    expect(beepAdjustedFare(bus, false).displayFare).toBe(18);
    expect(beepAdjustedFare(jeep, false).displayFare).toBe(14);
  });
});

describe('beepAdjustedTotalFare', () => {
  it('sums adjusted fares across a mixed-mode itinerary', () => {
    const legs: FareLegLike[] = [
      { mode: 'lrt', line: { name: 'LRT-1' }, fare: 20 },
      { mode: 'bus', line: { name: 'EDSA Carousel' }, fare: 18 },
    ];
    expect(beepAdjustedTotalFare(legs, true)).toBeCloseTo(38, 2);
    expect(beepAdjustedTotalFare(legs, false)).toBeCloseTo(25 + 18, 2);
  });
});
