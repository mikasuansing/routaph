import type { FareRule, Mode } from './types';

/**
 * 2026 Philippine transit fare matrix (LTFRB / DOTr), verified 2026-07-08:
 * Mar 19 2026 LTFRB fare hike + Mar 23 2026 MRT-3/LRT-2 50% discount.
 *
 * Jeepney - ₱14 flagdown covers first 4 km; ₱2.00/km after (traditional jeepney)
 * Bus - ₱18 flagdown covers first 5 km; ₱2.98/km after (A/C city bus)
 * MRT-3 - ₱6 minimum; ~₱0.48/km from first km (post 50% discount, ₱6–₱14 matrix)
 * LRT-2 - ₱8 minimum; ~₱0.46/km from first km (post 50% discount, ₱8–₱18 matrix)
 *
 * IMPORTANT: the DOTr discount covers MRT-3 and LRT-2 only. LRT-1 is operated
 * by LRMC and keeps its own matrix (₱16.25 boarding + ₱1.47/km, ₱16–₱52 beep).
 * These mode-level defaults are FALLBACKS; the graph loader emits per-line
 * rules from the `fares` table, which is where LRT-1 gets its real pricing.
 */
export const DEFAULT_FARE_RULES: FareRule[] = [
  // Road modes: LTFRB publishes a per-km rate with no ceiling, so none is
  // invented here - a made-up cap would be a worse error than the overshoot.
  { lineId: null, mode: 'jeepney', baseFare: 14, perKmRate: 2.00, flagDistanceKm: 4 },
  { lineId: null, mode: 'bus', baseFare: 18, perKmRate: 2.98, flagDistanceKm: 5 },
  // Rail: matrices with a published maximum, so the per-km approximation is
  // clamped. The mode-level LRT cap uses LRT-2's ₱18 because that is the
  // discounted matrix these defaults describe; LRT-1's ₱52 ceiling rides on
  // its per-line rule from the `fares` table.
  { lineId: null, mode: 'mrt', baseFare: 6, perKmRate: 0.48, flagDistanceKm: 0, maxFare: 14 },
  { lineId: null, mode: 'lrt', baseFare: 8, perKmRate: 0.46, flagDistanceKm: 0, maxFare: 18 },
];

/**
 * Resolve the fare rule that applies to a boarding: line-specific first,
 * then the mode-wide default.
 */
export function findFareRule(
  mode: Mode,
  lineId: number,
  rules: FareRule[],
): FareRule | null {
  if (mode === 'walk') return null;
  return (
    rules.find(r => r.lineId === lineId && r.mode === mode) ??
    rules.find(r => r.lineId === null && r.mode === mode) ??
    null
  );
}

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
  const rule = findFareRule(mode, lineId, rules);
  if (!rule) return 0;

  const flag = rule.flagDistanceKm ?? 4;
  const raw = distKm <= flag
    ? rule.baseFare
    : rule.baseFare + (distKm - flag) * rule.perKmRate;

  // Clamp to the operator's published ceiling. Rail fares are matrices with
  // a maximum, so an uncapped per-km line overshoots on long journeys - past
  // this cap, LRT-1's real P52 (beep) ceiling would otherwise run higher on
  // a full end-to-end ride.
  const capped = rule.maxFare !== undefined ? Math.min(raw, rule.maxFare) : raw;

  return Math.round(capped * 100) / 100;
}
