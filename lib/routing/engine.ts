/**
 * ParaPo multimodal routing engine — Phase A: time-dependent A*
 *
 * Pure module: no Next.js, Supabase, or Redis imports.
 * Takes a TransitGraph + PlanQuery, returns ranked Itinerary[].
 *
 * Multi-objective: runs three independent searches with different cost weights
 * to produce fastest, fewest-transfers, and cheapest itineraries.
 */

import { computeFare } from './fares';
import { haversineKm, nearestStops, walkMinutes } from './utils';
import type {
  GraphEdge,
  Itinerary,
  Leg,
  Line,
  Mode,
  Objective,
  PlanQuery,
  RideLeg,
  Stop,
  TransitGraph,
  WalkLeg,
} from './types';

// ---------------------------------------------------------------------------
// Cost weights per objective
// ---------------------------------------------------------------------------
type Weights = {
  timeFactor: number;       // multiplier on ride/walk time
  transferPenalty: number;  // extra minutes per transfer
  fareFactor: number;       // weight of fare in cost function
};

const WEIGHTS: Record<Objective, Weights> = {
  fastest:          { timeFactor: 1,    transferPenalty: 5,  fareFactor: 0    },
  fewest_transfers: { timeFactor: 1,    transferPenalty: 30, fareFactor: 0    },
  cheapest:         { timeFactor: 0.3,  transferPenalty: 3,  fareFactor: 2    },
};

// ---------------------------------------------------------------------------
// Priority queue (binary min-heap keyed on f = g + h)
// g = actual weighted cost; f = priority for the heap.
// ---------------------------------------------------------------------------
interface PQItem {
  stopId: number;
  currentLineId: number | null;
  f: number;           // priority = g + h (heap key)
  g: number;           // actual accumulated weighted cost
  actualTimeMin: number;
  actualFare: number;
  transfers: number;
  prev: PQItem | null;
  prevEdge: GraphEdge | null;
  prevLineId: number | null;
}

class MinHeap {
  private h: PQItem[] = [];

  push(item: PQItem): void {
    this.h.push(item);
    this.up(this.h.length - 1);
  }

  pop(): PQItem | undefined {
    if (this.h.length === 0) return undefined;
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length > 0) { this.h[0] = last; this.down(0); }
    return top;
  }

  get size(): number { return this.h.length; }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p].f <= this.h[i].f) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]];
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.h.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1, r = l + 1;
      if (l < n && this.h[l].f < this.h[s].f) s = l;
      if (r < n && this.h[r].f < this.h[s].f) s = r;
      if (s === i) break;
      [this.h[s], this.h[i]] = [this.h[i], this.h[s]];
      i = s;
    }
  }
}

// ---------------------------------------------------------------------------
// A* search
// ---------------------------------------------------------------------------
function search(
  graph: TransitGraph,
  originStopId: number,
  destStopIds: Set<number>,
  destLat: number,
  destLng: number,
  w: Weights,
  initialG = 0,
  excludeLineSet?: Set<number>,
  excludeModeSet?: Set<Mode>,
): PQItem | null {
  const MAX_SPEED_KMH = 60;

  function heuristic(stopId: number): number {
    const node = graph.nodes.get(stopId);
    if (!node) return 0;
    const distKm = haversineKm(node.stop.lat, node.stop.lng, destLat, destLng);
    return (distKm / MAX_SPEED_KMH) * 60 * w.timeFactor;
  }

  const pq = new MinHeap();
  // visited key: stopId + lineId (state includes which line we're on)
  const visited = new Map<string, number>();

  pq.push({
    stopId: originStopId,
    currentLineId: null,
    f: initialG + heuristic(originStopId),
    g: initialG,
    actualTimeMin: 0,
    actualFare: 0,
    transfers: 0,
    prev: null,
    prevEdge: null,
    prevLineId: null,
  });

  while (pq.size > 0) {
    const cur = pq.pop()!;
    const stateKey = `${cur.stopId}:${cur.currentLineId ?? 'x'}`;

    if (visited.has(stateKey) && visited.get(stateKey)! <= cur.g) continue;
    visited.set(stateKey, cur.g);

    // Only accept destination after at least one edge — prevents terminating at origin
    if (destStopIds.has(cur.stopId) && cur.prev !== null) return cur;

    const node = graph.nodes.get(cur.stopId);
    if (!node) continue;

    for (const edge of node.edges) {
      if (edge.type === 'ride') {
        // Skip excluded lines or modes (F13 disruption reroute / F15 trip tracking)
        if (excludeLineSet?.has(edge.lineId)) continue;
        const lineMode = graph.lines.get(edge.lineId)?.line.mode;
        if (lineMode && excludeModeSet?.has(lineMode)) continue;

        const boarding = cur.currentLineId !== edge.lineId;
        const transferPenalty = boarding ? w.transferPenalty : 0;
        const transfers = boarding && cur.currentLineId !== null
          ? cur.transfers + 1
          : cur.transfers;

        const lineData = graph.lines.get(edge.lineId);
        const mode = lineData?.line.mode ?? 'bus';
        const fare = computeFare(mode, edge.distKm, edge.lineId, graph.fareRules);

        const addedCost =
          edge.timeMin * w.timeFactor +
          transferPenalty +
          fare * w.fareFactor;

        const ng = cur.g + addedCost;
        const f = ng + heuristic(edge.toStopId);

        const nextKey = `${edge.toStopId}:${edge.lineId}`;
        if (visited.has(nextKey) && visited.get(nextKey)! <= ng) continue;

        pq.push({
          stopId: edge.toStopId,
          currentLineId: edge.lineId,
          f,
          g: ng,
          actualTimeMin: cur.actualTimeMin + edge.timeMin + transferPenalty,
          actualFare: cur.actualFare + fare,
          transfers,
          prev: cur,
          prevEdge: edge,
          prevLineId: cur.currentLineId,
        });
      } else {
        // transfer walk
        // Use -1 to distinguish "was on a vehicle, now walking" from null "at origin"
        // so the next boarding correctly increments the transfer counter
        const newLineId = cur.currentLineId !== null ? -1 : null;
        const addedCost = edge.timeMin * w.timeFactor;
        const ng = cur.g + addedCost;
        const f = ng + heuristic(edge.toStopId);

        const nextKey = `${edge.toStopId}:${newLineId ?? 'x'}`;
        if (visited.has(nextKey) && visited.get(nextKey)! <= ng) continue;

        pq.push({
          stopId: edge.toStopId,
          currentLineId: newLineId,
          f,
          g: ng,
          actualTimeMin: cur.actualTimeMin + edge.timeMin,
          actualFare: cur.actualFare,
          transfers: cur.transfers,
          prev: cur,
          prevEdge: edge,
          prevLineId: cur.currentLineId,
        });
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Path reconstruction → Itinerary
// ---------------------------------------------------------------------------
function reconstructItinerary(
  result: PQItem,
  graph: TransitGraph,
  originLat: number, originLng: number, originName: string,
  originStopId: number,
  destLat: number, destLng: number, destName: string,
  destStopId: number,
  objective: Objective,
): Itinerary {
  // Collect path nodes bottom-up
  const chain: PQItem[] = [];
  let cur: PQItem | null = result;
  while (cur) { chain.push(cur); cur = cur.prev; }
  chain.reverse();

  const legs: Leg[] = [];

  // Access walk: origin → first stop
  const firstStop = graph.nodes.get(originStopId)!.stop;
  const accessDist = haversineKm(originLat, originLng, firstStop.lat, firstStop.lng);
  if (accessDist > 0.05) {
    legs.push({
      type: 'walk',
      fromName: originName,
      toName: firstStop.name,
      fromLat: originLat, fromLng: originLng,
      toLat: firstStop.lat, toLng: firstStop.lng,
      distKm: accessDist,
      durationMin: Math.round(walkMinutes(accessDist)),
    } satisfies WalkLeg);
  }

  // Ride/transfer legs
  let i = 1;
  while (i < chain.length) {
    const edge = chain[i].prevEdge;
    if (!edge) { i++; continue; }

    if (edge.type === 'ride') {
      const lineId = edge.lineId;
      const lineData = graph.lines.get(lineId)!;
      const line: Line = lineData.line;

      // Collect all consecutive ride nodes on the same line
      const rideStopIds: number[] = [chain[i - 1].stopId];
      let totalDist = 0;
      let totalTime = 0;

      while (i < chain.length && chain[i].prevEdge?.type === 'ride' &&
             (chain[i].prevEdge as { lineId: number }).lineId === lineId) {
        const e = chain[i].prevEdge as { distKm: number; timeMin: number };
        rideStopIds.push(chain[i].stopId);
        totalDist += e.distKm;
        totalTime += e.timeMin;
        i++;
      }
      // Fare is per boarding (one call for the whole leg, not per segment)
      const totalFare = computeFare(line.mode, totalDist, lineId, graph.fareRules);

      const fromStop = graph.nodes.get(rideStopIds[0])!.stop;
      const toStop = graph.nodes.get(rideStopIds[rideStopIds.length - 1])!.stop;
      const stops = rideStopIds.map(id => graph.nodes.get(id)!.stop);

      legs.push({
        type: 'ride',
        mode: line.mode,
        line,
        from: fromStop,
        to: toStop,
        stops,
        distKm: Math.round(totalDist * 10) / 10,
        durationMin: Math.round(totalTime),
        fare: Math.round(totalFare * 100) / 100,
      } satisfies RideLeg);
    } else {
      // transfer walk — shown inline only if long enough
      if (edge.timeMin > 1) {
        const fromStop = graph.nodes.get(chain[i - 1].stopId)!.stop;
        const toStop = graph.nodes.get(chain[i].stopId)!.stop;
        legs.push({
          type: 'walk',
          fromName: fromStop.name,
          toName: toStop.name,
          fromLat: fromStop.lat, fromLng: fromStop.lng,
          toLat: toStop.lat, toLng: toStop.lng,
          distKm: edge.distKm,
          durationMin: Math.round(edge.timeMin),
        } satisfies WalkLeg);
      }
      i++;
    }
  }

  // Egress walk: last stop → destination
  const lastStop = graph.nodes.get(destStopId)!.stop;
  const egressDist = haversineKm(lastStop.lat, lastStop.lng, destLat, destLng);
  if (egressDist > 0.05) {
    legs.push({
      type: 'walk',
      fromName: lastStop.name,
      toName: destName,
      fromLat: lastStop.lat, fromLng: lastStop.lng,
      toLat: destLat, toLng: destLng,
      distKm: egressDist,
      durationMin: Math.round(walkMinutes(egressDist)),
    } satisfies WalkLeg);
  }

  const totalFare = legs.reduce((s, l) => s + (l.type === 'ride' ? l.fare : 0), 0);
  const totalDuration =
    legs.reduce((s, l) => s + l.durationMin, 0) + result.transfers * 3; // boarding time

  return {
    legs,
    totalDurationMin: Math.round(totalDuration),
    totalFare: Math.round(totalFare * 100) / 100,
    transfers: result.transfers,
    objective,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function planRoute(graph: TransitGraph, query: PlanQuery): Itinerary[] {
  const { originLat, originLng, destLat, destLng } = query;

  // Trivially close — no transit routing needed
  if (haversineKm(originLat, originLng, destLat, destLng) < 0.05) return [];

  const excludeLineSet = query.excludeLines?.length
    ? new Set(query.excludeLines)
    : undefined;
  const excludeModeSet = query.excludeModes?.length
    ? new Set(query.excludeModes)
    : undefined;

  const objectives: Objective[] = query.preference
    ? [query.preference]
    : ['fastest', 'fewest_transfers', 'cheapest'];

  const allStops = [...graph.nodes.values()].map(n => n.stop);
  const originCandidates = nearestStops(originLat, originLng, allStops, 3, 2);
  const destCandidates   = nearestStops(destLat, destLng, allStops, 3, 2);

  if (originCandidates.length === 0 || destCandidates.length === 0) return [];

  const destStopIds = new Set(destCandidates.map(c => c.stop.id));

  const results: Itinerary[] = [];
  const seen = new Set<string>(); // deduplicate by (first-stop, last-stop, line-sequence)

  for (const obj of objectives) {
    const w = WEIGHTS[obj];
    let best: PQItem | null = null;
    let bestOriginStop: Stop | null = null;
    let bestDestStop: Stop | null = null;

    for (const { stop: oStop, distKm: accessDist } of originCandidates) {
      // Seed the search with the access-walk cost so farther origin stops
      // are correctly penalised relative to closer ones.
      const initialG = walkMinutes(accessDist) * w.timeFactor;
      const result = search(graph, oStop.id, destStopIds, destLat, destLng, w, initialG, excludeLineSet, excludeModeSet);
      if (!result) continue;

      if (!best || result.g < best.g) {
        best = result;
        bestOriginStop = oStop;
        // find which dest stop was reached
        bestDestStop = destCandidates.find(c => c.stop.id === result.stopId)?.stop
          ?? destCandidates[0].stop;
      }
    }

    if (!best || !bestOriginStop || !bestDestStop) continue;

    const itinerary = reconstructItinerary(
      best, graph,
      originLat, originLng, 'Origin',
      bestOriginStop.id,
      destLat, destLng, 'Destination',
      bestDestStop.id,
      obj,
    );

    // Simple dedup key
    const dedupKey = itinerary.legs
      .filter(l => l.type === 'ride')
      .map(l => `${(l as RideLeg).line.id}:${(l as RideLeg).from.id}-${(l as RideLeg).to.id}`)
      .join('|');

    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      results.push(itinerary);
    }
  }

  return results;
}
