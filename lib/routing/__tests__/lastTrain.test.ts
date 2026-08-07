import { describe, it, expect } from 'vitest';
import { checkLastTrain, type LegLike } from '../lastTrain';

// Monday 2026-07-27, a weekday, in local time.
const WEEKDAY = new Date(2026, 6, 27, 0, 0, 0);
function at(hour: number, minute: number): Date {
  const d = new Date(WEEKDAY);
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('checkLastTrain', () => {
  it('returns no warning well before closing', () => {
    const legs: LegLike[] = [{ type: 'ride', mode: 'mrt', line: { name: 'MRT-3' }, durationMin: 20 }];
    expect(checkLastTrain(legs, at(14, 0))).toEqual([]);
  });

  it('flags a final call inside the warning window', () => {
    const legs: LegLike[] = [{ type: 'ride', mode: 'mrt', line: { name: 'MRT-3' }, durationMin: 0 }];
    // MRT-3 weekday close is 22:00; boarding at 21:45 is 15 min out.
    const result = checkLastTrain(legs, at(21, 45));
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('final_call');
    expect(result[0].lineName).toBe('MRT-3');
  });

  it('flags closed once boarding would be after the last train', () => {
    const legs: LegLike[] = [{ type: 'ride', mode: 'mrt', line: { name: 'MRT-3' }, durationMin: 0 }];
    const result = checkLastTrain(legs, at(22, 30));
    expect(result[0].status).toBe('closed');
  });

  it('checks a later leg using cumulative elapsed time, not just the first leg', () => {
    const legs: LegLike[] = [
      { type: 'ride', mode: 'mrt', line: { name: 'MRT-3' }, durationMin: 30 },
      { type: 'walk', durationMin: 5 },
      // Boarding this leg is 35 min after "now" — pushes LRT-2 past its 21:00 weekday close.
      { type: 'ride', mode: 'lrt', line: { name: 'LRT-2' }, durationMin: 20 },
    ];
    const result = checkLastTrain(legs, at(20, 30));
    expect(result).toHaveLength(1);
    expect(result[0].lineName).toBe('LRT-2');
    expect(result[0].status).toBe('closed');
  });

  it('ignores non-rail legs (bus, jeepney, walk)', () => {
    const legs: LegLike[] = [
      { type: 'ride', mode: 'bus', line: { name: 'EDSA Carousel' }, durationMin: 40 },
      { type: 'ride', mode: 'jeepney', line: { name: 'Katipunan Jeepney' }, durationMin: 40 },
    ];
    expect(checkLastTrain(legs, at(23, 0))).toEqual([]);
  });

  it('uses the earlier weekend close time on Saturday/Sunday', () => {
    const saturday = new Date(2026, 6, 25); // 2026-07-25 is a Saturday
    saturday.setHours(21, 40, 0, 0);
    const legs: LegLike[] = [{ type: 'ride', mode: 'mrt', line: { name: 'MRT-3' }, durationMin: 0 }];
    // 21:40 is after the 21:30 weekend close, but before the 22:00 weekday close.
    const result = checkLastTrain(legs, saturday);
    expect(result[0].status).toBe('closed');
  });
});
