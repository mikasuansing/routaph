import { haversineKm } from '@/lib/routing/utils';
import type { Itinerary } from '@/lib/routing/types';
import type { GeoPosition } from './types';
import { getLegArrivalStop } from './types';

// Distance threshold at which we consider the user to have "arrived" at a stop
export const ADVANCE_THRESHOLD_KM = 0.15; // 150 m

/**
 * Returns true when the user's current position is close enough to the
 * arrival point of `legIndex` to auto-advance to the next leg.
 */
export function shouldAdvanceLeg(
  pos: GeoPosition,
  itinerary: Itinerary,
  legIndex: number,
): boolean {
  const arrival = getLegArrivalStop(itinerary, legIndex);
  if (!arrival) return false;
  return haversineKm(pos.lat, pos.lng, arrival.lat, arrival.lng) < ADVANCE_THRESHOLD_KM;
}

/**
 * Compute straight-line distance (km) from current position to the arrival
 * stop of the active leg.
 */
export function distToNextStop(
  pos: GeoPosition,
  itinerary: Itinerary,
  legIndex: number,
): number | null {
  const arrival = getLegArrivalStop(itinerary, legIndex);
  if (!arrival) return null;
  return haversineKm(pos.lat, pos.lng, arrival.lat, arrival.lng);
}

/**
 * Rough ETA in minutes to the next stop based on current speed.
 * Falls back to a walking-speed estimate when speed is unavailable.
 */
export function etaToNextStop(
  pos: GeoPosition,
  itinerary: Itinerary,
  legIndex: number,
  speedMps?: number, // from GeolocationCoordinates.speed
): number | null {
  const dist = distToNextStop(pos, itinerary, legIndex);
  if (dist === null) return null;
  const WALK_MPS = 1.25; // 4.5 km/h
  const effectiveSpeed = speedMps && speedMps > 0.5 ? speedMps : WALK_MPS;
  return Math.max(1, Math.round((dist * 1000) / effectiveSpeed / 60));
}
