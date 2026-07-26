/**
 * Jeepney corridor suggestions — pure, zero framework imports.
 *
 * ParaPo only has stop-level route data for one jeepney corridor
 * (Katipunan). Metro Manila has hundreds of real jeepney routes with no
 * clean, complete public dataset — inventing stop sequences or ETAs for
 * them would be dishonest. Instead, when a walking leg's endpoints both
 * sit near a well-known jeepney THOROUGHFARE (a real, long-standing road
 * corridor commuters already know jeepneys run along), we surface a
 * "Suggested" card: a direction and an approximate fare range computed
 * from the same jeepney fare rule used everywhere else in the app — never
 * a stop count or a travel-time estimate, and always labeled as an
 * untracked suggestion, not a routed leg.
 *
 * Corridor waypoints are approximate road landmarks, not surveyed stops.
 */

import { haversineKm } from './utils';
import { computeFare, DEFAULT_FARE_RULES } from './fares';
import type { FareRule } from './types';

type Waypoint = { name: string; lat: number; lng: number };
type JeepneyCorridor = { name: string; waypoints: Waypoint[] };

// Real, well-known Metro Manila jeepney thoroughfares not already covered
// by a tracked route in this app (i.e. not the Katipunan corridor, and
// not roads that just run alongside an existing rail line's own stops).
const JEEPNEY_CORRIDORS: JeepneyCorridor[] = [
  {
    name: 'España Boulevard',
    waypoints: [
      { name: 'Welcome Rotonda', lat: 14.6095, lng: 120.9935 },
      { name: 'UST / España',    lat: 14.6091, lng: 120.9884 },
      { name: 'Quiapo',          lat: 14.5992, lng: 120.9836 },
    ],
  },
  {
    name: 'Shaw Boulevard',
    waypoints: [
      { name: 'Shaw Blvd–EDSA', lat: 14.5811, lng: 121.0543 },
      { name: 'Shaw–Pasig Blvd', lat: 14.5765, lng: 121.0700 },
      { name: 'Pasig',          lat: 14.5764, lng: 121.0851 },
    ],
  },
  {
    name: 'Ortigas Avenue Extension',
    waypoints: [
      { name: 'Ortigas / Robinsons Galleria', lat: 14.5870, lng: 121.0576 },
      { name: 'Cainta Junction',              lat: 14.5789, lng: 121.1005 },
      { name: 'Taytay',                       lat: 14.5697, lng: 121.1325 },
    ],
  },
  {
    name: 'Marcos Highway',
    waypoints: [
      { name: 'Santolan', lat: 14.6280, lng: 121.0826 },
      { name: 'Marikina Sports Center', lat: 14.6380, lng: 121.1050 },
      { name: 'Masinag / Antipolo', lat: 14.6280, lng: 121.1380 },
    ],
  },
  {
    name: 'Recto–Quiapo–Divisoria',
    waypoints: [
      { name: 'Recto',     lat: 14.5987, lng: 120.9844 },
      { name: 'Quiapo',    lat: 14.5992, lng: 120.9836 },
      { name: 'Divisoria', lat: 14.6019, lng: 120.9678 },
    ],
  },
  {
    name: 'Commonwealth Avenue',
    waypoints: [
      { name: 'Quezon City Circle', lat: 14.6521, lng: 121.0322 },
      { name: 'Batasan',            lat: 14.6870, lng: 121.0850 },
      { name: 'Fairview',           lat: 14.7280, lng: 121.0730 },
    ],
  },
  {
    name: 'C5 / Katipunan Extension',
    waypoints: [
      { name: 'Eastwood', lat: 14.6088, lng: 121.0790 },
      { name: 'Libis',    lat: 14.6115, lng: 121.0680 },
      { name: 'Bagong Ilog', lat: 14.5720, lng: 121.0620 },
    ],
  },
];

const MATCH_RADIUS_KM = 0.6;
const MIN_WALK_KM = 0.5;
// Real roads aren't straight lines between landmarks — inflate the
// haversine distance between matched waypoints to estimate ride distance.
const ROAD_DIRECTNESS_FACTOR = 1.3;

export type JeepneySuggestion = {
  corridorName: string;
  towardLabel: string;
  fareLow: number;
  fareHigh: number;
};

function nearestWaypoint(lat: number, lng: number, corridor: JeepneyCorridor) {
  let best = { index: -1, distKm: Infinity };
  corridor.waypoints.forEach((wp, index) => {
    const d = haversineKm(lat, lng, wp.lat, wp.lng);
    if (d < best.distKm) best = { index, distKm: d };
  });
  return best;
}

/**
 * Suggests a known jeepney corridor for a walking gap, if the walk's start
 * and end each sit near a DIFFERENT point along the same real thoroughfare.
 * Returns null when no corridor plausibly covers the gap.
 */
export function suggestJeepneyCorridor(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  fareRules: FareRule[] = DEFAULT_FARE_RULES,
): JeepneySuggestion | null {
  const walkDistKm = haversineKm(fromLat, fromLng, toLat, toLng);
  if (walkDistKm < MIN_WALK_KM) return null;

  let best: { corridor: JeepneyCorridor; toWaypoint: Waypoint; score: number } | null = null;

  for (const corridor of JEEPNEY_CORRIDORS) {
    const fromMatch = nearestWaypoint(fromLat, fromLng, corridor);
    const toMatch = nearestWaypoint(toLat, toLng, corridor);
    if (fromMatch.index === -1 || toMatch.index === -1) continue;
    if (fromMatch.distKm > MATCH_RADIUS_KM || toMatch.distKm > MATCH_RADIUS_KM) continue;
    if (fromMatch.index === toMatch.index) continue; // same point, not real travel

    const score = fromMatch.distKm + toMatch.distKm;
    if (!best || score < best.score) {
      best = { corridor, toWaypoint: corridor.waypoints[toMatch.index], score };
    }
  }

  if (!best) return null;

  const estRideKm = walkDistKm * ROAD_DIRECTNESS_FACTOR;
  const fareLow = computeFare('jeepney', Math.max(0, estRideKm - 1), 999, fareRules);
  const fareHigh = computeFare('jeepney', estRideKm + 1, 999, fareRules);

  return {
    corridorName: best.corridor.name,
    towardLabel: best.toWaypoint.name,
    fareLow,
    fareHigh,
  };
}
