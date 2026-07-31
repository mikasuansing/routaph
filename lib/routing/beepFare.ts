/**
 * Beep card vs. cash/single-journey-ticket (SJT) fare display — pure,
 * zero framework imports.
 *
 * This does NOT change the engine's computed fare (lib/routing/fares.ts) —
 * that fare already represents the beep/stored-value price, which is the
 * baseline every DB fare row and the DOTr matrices are quoted in. This
 * module only adjusts the DISPLAYED number when the rider says they're
 * paying cash, and only where a real difference exists:
 *
 * - LRT-1 (LRMC-operated, not covered by the DOTr discount): a genuine
 *   ~20% cash/SJT surcharge vs. beep is published (lrmc.ph 2025-04-02 fare
 *   notice — beep min ₱16 / max ₱52 vs. SJT min ₱20 / max ₱55). We apply
 *   a flat +20% approximation across the whole matrix; the real matrix is
 *   stepped, not linear, so treat this as an estimate like every other
 *   fare figure in this app.
 * - MRT-3: single-journey tickets were discontinued in 2026 — beep is now
 *   mandatory. Cash mode shows an informational note, not a different
 *   number (there's nothing to pay cash with).
 * - LRT-2: the March 2026 DOTr 50% discount applies equally to beep and
 *   cash/SJT riders, so there is no fare difference to show.
 * - Bus, jeepney, walk: no beep-specific pricing exists; unaffected.
 */

const LRT1_CASH_SURCHARGE_MULT = 1.25; // ~20% cheaper on beep == cash is ~25% more

export type BeepFareAdjustment = {
  displayFare: number;
  note?: string;
};

/** Minimal duck-typed leg shape shared with lastTrain.ts's LegLike. */
export type FareLegLike = { mode: string; line: { name: string }; fare: number };

export function beepAdjustedFare(leg: FareLegLike, hasBeep: boolean): BeepFareAdjustment {
  if (leg.line.name === 'LRT-1') {
    if (hasBeep) return { displayFare: leg.fare };
    return {
      displayFare: leg.fare * LRT1_CASH_SURCHARGE_MULT,
      note: 'Cash/SJT ~20% more than Beep on LRT-1',
    };
  }
  if (leg.line.name === 'MRT-3' && !hasBeep) {
    return { displayFare: leg.fare, note: 'Cash tickets discontinued — Beep card required at MRT-3' };
  }
  if (leg.line.name === 'LRT-2' && !hasBeep) {
    return { displayFare: leg.fare, note: 'Same discounted fare on cash or Beep' };
  }
  return { displayFare: leg.fare };
}

/** Sums beep-adjusted fares across ride legs; walk legs are always free. */
export function beepAdjustedTotalFare(legs: FareLegLike[], hasBeep: boolean): number {
  return legs.reduce((sum, leg) => sum + beepAdjustedFare(leg, hasBeep).displayFare, 0);
}
