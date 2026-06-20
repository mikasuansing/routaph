import type { FareRule, Mode } from './types';

/**
 * 2024 Philippine transit fare matrix (LTFRB / DOTr).
 *
 * Jeepney  — ₱14 flagdown covers first 4 km; ₱1.80/km after (LTFRB MC 2023-014)
 * Bus      — ₱15 flagdown covers first 5 km; ₱2.65/km after (A/C ordinary bus)
 * MRT-3    — ₱13 minimum; ~₱0.94/km from first km (matches ₱13–₱28 official matrix)
 * LRT-1/2  — ₱12 minimum; ~₱0.89/km from first km (matches ₱12–₱30 official matrix)
 */
export const DEFAULT_FARE_RULES: FareRule[] = [
  { lineId: null, mode: 'jeepney', baseFare: 14,  perKmRate: 1.80, flagDistanceKm: 4 },
  { lineId: null, mode: 'bus',     baseFare: 15,  perKmRate: 2.65, flagDistanceKm: 5 },
  { lineId: null, mode: 'mrt',     baseFare: 13,  perKmRate: 0.94, flagDistanceKm: 0 },
  { lineId: null, mode: 'lrt',     baseFare: 12,  perKmRate: 0.89, flagDistanceKm: 0 },
];

/**
 * Compute the FULL BOARDING fare for a ride leg.
 * Must be called once per boarding (not once per edge/segment).
 */
export function computeFare(
  mode: Mode,
  distKm: number,
  lineId: number,
  rules: FareRule[],
): number {
  if (mode === 'walk') return 0;

  const rule =
    rules.find(r => r.lineId === lineId && r.mode === mode) ??
    rules.find(r => r.lineId === null  && r.mode === mode);

  if (!rule) return 0;

  const flag = rule.flagDistanceKm ?? 4;
  const raw = distKm <= flag
    ? rule.baseFare
    : rule.baseFare + (distKm - flag) * rule.perKmRate;

  return Math.round(raw * 100) / 100;
}
