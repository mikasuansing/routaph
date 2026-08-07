import type { Stop } from './types';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) *
    Math.cos(bLat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkMinutes(distKm: number): number {
  const WALK_SPEED_KMH = 4.5;
  return (distKm / WALK_SPEED_KMH) * 60;
}

// Nearest N stops to a lat/lng, sorted ascending by distance
export function nearestStops(
  lat: number,
  lng: number,
  stops: Stop[],
  limit = 3,
  maxKm = 1.5,
): Array<{ stop: Stop; distKm: number }> {
  return stops
    .map(stop => ({ stop, distKm: haversineKm(lat, lng, stop.lat, stop.lng) }))
    .filter(x => x.distKm <= maxKm)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, limit);
}

// Geohash approximation — truncated lat/lng at 2 decimal places (~1 km grid)
export function geohash(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// Round departure time to nearest 30-minute bucket for cache key
export function timeBucket(d: Date = new Date()): string {
  const h = d.getHours();
  const m = d.getMinutes() < 30 ? '00' : '30';
  return `${h}:${m}`;
}
