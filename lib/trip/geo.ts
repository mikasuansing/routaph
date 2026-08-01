import { haversineKm } from '@/lib/routing/utils';
import type { Itinerary } from '@/lib/routing/types';
import type { GeoPosition } from './types';
import { getLegArrivalStop } from './types';

// Distance threshold at which we consider the user to have "arrived" at a stop
export const ADVANCE_THRESHOLD_KM = 0.15; // 150 m

/**
 * Below this speed a heading is noise, not direction — a phone sitting
 * still produces wildly swinging bearings, and rotating the map to them
 * would make the screen spin while the rider stands on a platform.
 * ~1.4 m/s is a slow walk.
 */
export const MIN_HEADING_SPEED_MPS = 1.4;

/**
 * Initial bearing from one point to another, in degrees clockwise from
 * north. Used to turn the map so the direction of travel points up, for
 * the many devices where `GeolocationCoordinates.heading` is always null.
 */
export function bearingBetween(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLng - fromLng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Shortest signed difference between two bearings, in [-180, 180].
 *
 * Rotating from 350° to 10° should be +20°, not -340° — without this the
 * camera swings the long way round every time the heading crosses north.
 */
export function bearingDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

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
