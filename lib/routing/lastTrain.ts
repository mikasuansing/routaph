/**
 * Last-train awareness — pure time math, zero framework imports.
 *
 * Closing times are DAILY LAST-TRAIN-DEPARTS times, one conservative
 * citywide figure per line (not per-station/per-direction). Real published
 * schedules vary a few minutes by direction and station; we always use the
 * EARLIER boundary so this never tells a rider "you'll make it" when they
 * actually won't. Treat these as estimates — always confirm with LRTA/DOTr
 * live service announcements before relying on the very last trip of the
 * night.
 *
 * Sources (verified 2026-07): MRT-3 weekday last train ~10:00 PM (service
 * to 10:30 PM), weekend/holiday ~9:30 PM (Expressway.PH MRT-3 guide).
 * LRT-1 weekday last train 10:00-10:15 PM depending on direction, weekend
 * 9:30-9:45 PM (LRMC / PNA operating-hours notices). LRT-2 regular-schedule
 * last train from Antipolo 9:00 PM / from Recto 9:30 PM weekdays (LRTA
 * train operating schedule, effective 2026-01-01); weekend figure is not
 * separately published, so it's estimated at the same -30 min weekday/
 * weekend delta MRT-3 and LRT-1 both publish.
 */

export type CloseTimes = { weekdayCloseMin: number; weekendCloseMin: number };

// Minutes past midnight, Asia/Manila local time.
const RAIL_CLOSING: Record<string, CloseTimes> = {
  'MRT-3': { weekdayCloseMin: 22 * 60, weekendCloseMin: 21 * 60 + 30 },
  'LRT-1': { weekdayCloseMin: 22 * 60, weekendCloseMin: 21 * 60 + 30 },
  'LRT-2': { weekdayCloseMin: 21 * 60, weekendCloseMin: 20 * 60 + 30 },
};

// A rider is warned they'll "just make it" inside this window before close.
const FINAL_CALL_MIN = 20;

function isWeekend(at: Date): boolean {
  const day = at.getDay(); // Asia/Manila-agnostic: server/browser local day is fine for this use
  return day === 0 || day === 6;
}

export type LastTrainStatus = 'ok' | 'final_call' | 'closed';

export type LastTrainCheck = {
  legIndex: number;
  status: LastTrainStatus;
  lineName: string;
  boardsAt: Date;
  closesAt: Date;
};

/** Minimal duck-typed leg shape — works with any Itinerary.legs (server or client copies). */
export type LegLike =
  | { type: 'walk'; durationMin: number }
  | { type: 'ride'; mode: string; line: { name: string }; durationMin: number };

/**
 * Checks every rail (mrt/lrt) leg in an itinerary against that line's last
 * train, given an assumed departure time `now`. Returns one entry per rail
 * leg that is a final call or already closed — legs safely inside the
 * service window are omitted.
 */
export function checkLastTrain(legs: LegLike[], now: Date = new Date()): LastTrainCheck[] {
  const warnings: LastTrainCheck[] = [];
  let elapsedMin = 0;

  for (let legIndex = 0; legIndex < legs.length; legIndex++) {
    const leg = legs[legIndex];
    if (leg.type === 'ride' && (leg.mode === 'mrt' || leg.mode === 'lrt')) {
      const closeTimes = RAIL_CLOSING[leg.line.name];
      if (closeTimes) {
        const boardsAt = new Date(now.getTime() + elapsedMin * 60_000);
        const closeMin = isWeekend(boardsAt) ? closeTimes.weekendCloseMin : closeTimes.weekdayCloseMin;
        const closesAt = new Date(boardsAt);
        closesAt.setHours(0, closeMin, 0, 0);

        const minutesToClose = (closesAt.getTime() - boardsAt.getTime()) / 60_000;
        let status: LastTrainStatus = 'ok';
        if (minutesToClose <= 0) status = 'closed';
        else if (minutesToClose <= FINAL_CALL_MIN) status = 'final_call';

        if (status !== 'ok') {
          warnings.push({ legIndex, status, lineName: leg.line.name, boardsAt, closesAt });
        }
      }
    }
    elapsedMin += leg.durationMin;
  }

  return warnings;
}

export function formatClockTime(d: Date): string {
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
