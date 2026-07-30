/**
 * Live vehicle position estimation — pure module, zero framework imports
 * (same rule as `lib/routing/`: no Next.js, Supabase, or Redis in here).
 *
 * WHY THIS EXISTS
 * No Philippine transit operator publishes a real-time vehicle feed — there
 * is no GTFS-realtime for MRT-3, LRT-1/2, or the EDSA Carousel. The only
 * honest way to show where a train actually is right now is to ask the
 * people already on it: riders who opt in during a trip send their own GPS,
 * and we cluster those pings into an estimated vehicle position.
 *
 * The output is therefore an ESTIMATE FROM RIDERS, never an official
 * position, and every UI surface that renders it must say so.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 * - No jeepneys. Jeepney routes overlap heavily on the same roads, so a
 *   ping near EDSA can't be honestly attributed to one specific route.
 * - No invented vehicles. Zero fresh pings means an empty array, which the
 *   map renders as nothing at all — never a simulated train sliding along
 *   a timetable.
 */

import { haversineKm } from '@/lib/routing/utils';
import type { Mode, Stop } from '@/lib/routing/types';

export type LivePing = {
  riderKey: string;
  lat: number;
  lng: number;
  accuracyM: number;
  ts: number; // epoch ms
};

export type Direction = 'forward' | 'backward';

export type VehicleEstimate = {
  lineId: number;
  lineName: string;
  mode: Mode;
  direction: Direction;
  lat: number;
  lng: number;
  nearStopId: number;
  nearStopName: string;
  riderCount: number;
  confidence: 'low' | 'medium' | 'high';
  updatedAt: string;
};

/** A ping older than this is ignored — better to show nothing than a ghost. */
export const PING_FRESH_MS = 120_000;

/** Fixes worse than this are rejected at the API boundary and here. */
export const MAX_ACCURACY_M = 150;

/**
 * A ping further than this from every stop on the line isn't plausibly
 * aboard that line's vehicle (wrong line, or a rider who left the system).
 */
export const MAX_SNAP_KM = 1.2;

/**
 * Riders within this many stop positions of each other, heading the same
 * way, are treated as being on the same vehicle. Two stops is roughly one
 * inter-station gap of slack, which absorbs GPS jitter and the fact that a
 * long train's riders are spread over ~150 m of platform.
 */
export const CLUSTER_SPAN = 2;

/**
 * Snap a position to the nearest stop in a line's ordered stop sequence.
 * Returns null when the position isn't plausibly on this line at all.
 */
export function snapToLine(
  lat: number,
  lng: number,
  stops: Stop[],
): { index: number; stop: Stop; distKm: number } | null {
  let best: { index: number; stop: Stop; distKm: number } | null = null;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const distKm = haversineKm(lat, lng, s.lat, s.lng);
    if (best === null || distKm < best.distKm) best = { index: i, stop: s, distKm };
  }
  if (best === null || best.distKm > MAX_SNAP_KM) return null;
  return best;
}

/**
 * Infer travel direction from a rider's own two most recent snapped
 * positions. Equal indices mean "not moving between stops yet" — dwelling
 * at a platform, or two pings inside the same inter-station gap — which is
 * not enough information to claim a direction.
 */
export function inferDirection(prevIndex: number, currIndex: number): Direction | null {
  if (currIndex > prevIndex) return 'forward';
  if (currIndex < prevIndex) return 'backward';
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function confidenceFor(riderCount: number): VehicleEstimate['confidence'] {
  if (riderCount >= 4) return 'high';
  if (riderCount >= 2) return 'medium';
  return 'low';
}

/**
 * Cluster one line's fresh pings into estimated vehicle positions.
 *
 * Each ping arrives already tagged with the direction the server inferred
 * from that rider's previous ping. Pings are snapped to the stop sequence,
 * grouped by direction, then swept along the line: consecutive riders
 * within CLUSTER_SPAN stops of each other collapse into one vehicle.
 *
 * Position is the MEDIAN of the cluster's pings, not the mean — one rider
 * whose phone reports a wild fix can't drag the whole train sideways.
 */
export function clusterPings(
  pings: Array<LivePing & { direction: Direction }>,
  line: { id: number; name: string; mode: Mode },
  stops: Stop[],
  now: number = Date.now(),
): VehicleEstimate[] {
  if (stops.length === 0) return [];

  type Snapped = { index: number; stop: Stop; ping: LivePing; direction: Direction };
  const snapped: Snapped[] = [];

  for (const p of pings) {
    if (now - p.ts > PING_FRESH_MS) continue;
    if (p.accuracyM > MAX_ACCURACY_M) continue;
    const hit = snapToLine(p.lat, p.lng, stops);
    if (!hit) continue;
    snapped.push({ index: hit.index, stop: hit.stop, ping: p, direction: p.direction });
  }

  if (snapped.length === 0) return [];

  const estimates: VehicleEstimate[] = [];

  for (const direction of ['forward', 'backward'] as const) {
    const group = snapped
      .filter(s => s.direction === direction)
      .sort((a, b) => a.index - b.index);
    if (group.length === 0) continue;

    let cluster: Snapped[] = [group[0]];

    const flush = () => {
      // One rider can appear twice if two of their pings survived the
      // freshness window; count distinct riders so a single phone can't
      // inflate a cluster's apparent confidence.
      const riderCount = new Set(cluster.map(c => c.ping.riderKey)).size;
      const newest = cluster.reduce((a, b) => (a.ping.ts > b.ping.ts ? a : b));
      estimates.push({
        lineId: line.id,
        lineName: line.name,
        mode: line.mode,
        direction,
        lat: median(cluster.map(c => c.ping.lat)),
        lng: median(cluster.map(c => c.ping.lng)),
        nearStopId: newest.stop.id,
        nearStopName: newest.stop.name,
        riderCount,
        confidence: confidenceFor(riderCount),
        updatedAt: new Date(newest.ping.ts).toISOString(),
      });
    };

    for (let i = 1; i < group.length; i++) {
      const prev = cluster[cluster.length - 1];
      if (group[i].index - prev.index <= CLUSTER_SPAN) {
        cluster.push(group[i]);
      } else {
        flush();
        cluster = [group[i]];
      }
    }
    flush();
  }

  return estimates;
}
