/**
 * MRT-3 dual-entrance awareness — pure, zero framework imports.
 *
 * Every MRT-3 station is elevated over EDSA with separate station
 * buildings/entrances on the EAST and WEST side of the highway, linked by
 * a footbridge (verified via LRTA/rider guides, 2026-07) — not every
 * entrance leads to both directions, so which side you exit from matters
 * for the last-mile walk. ParaPo's `stops` table has no entrance-level
 * geometry (checked: id/name/geom only), so rather than fabricate
 * gate-by-gate data with no source, this models just the documented
 * two-sided structure: small offsets from the station's centroid stop
 * coordinate, east and west of the highway. Scoped to MRT-3 only, per the
 * roadmap's own fallback — it's the line where this matters most (a rail
 * line that runs straight up a highway median) and the one we can verify.
 *
 * Display-only: does not change the routing engine's computed distance,
 * duration, or fare for the leg — those stay centroid-based like every
 * other stop in this app. This only repoints the walking target + adds a
 * "which side to exit" hint for the FINAL leg of a trip.
 */

import { haversineKm } from '@/lib/routing/utils';

type Entrance = { lat: number; lng: number; label: string };

// Offset from the station centroid, small enough to stay "at the station"
// but large enough to meaningfully favor the correct side of EDSA.
const OFFSET_DEG = 0.0006; // ~65m at this latitude

function entrancesFor(lat: number, lng: number): { east: Entrance; west: Entrance } {
  return {
    east: { lat, lng: lng + OFFSET_DEG, label: 'east side of EDSA' },
    west: { lat, lng: lng - OFFSET_DEG, label: 'west side of EDSA' },
  };
}

// MRT-3 station centroids, matching supabase/seed/002_rail_lines.sql exactly.
const MRT3_STATIONS: Record<string, { lat: number; lng: number }> = {
  'Taft Avenue (MRT)': { lat: 14.5395, lng: 120.9985 },
  'Magallanes':        { lat: 14.5401, lng: 121.0038 },
  'Ayala':             { lat: 14.5487, lng: 121.0279 },
  'Buendia':           { lat: 14.5536, lng: 121.0347 },
  'Guadalupe':         { lat: 14.5658, lng: 121.0469 },
  'Ortigas (MRT)':     { lat: 14.5876, lng: 121.0583 },
  'Shaw Blvd':         { lat: 14.5811, lng: 121.0543 },
  'Boni':              { lat: 14.5762, lng: 121.0477 },
  'Cubao (MRT)':       { lat: 14.6228, lng: 121.0526 },
  'GMA-Kamuning':      { lat: 14.6378, lng: 121.0484 },
  'Quezon Ave (MRT)':  { lat: 14.6449, lng: 121.0403 },
  'North Avenue':      { lat: 14.6521, lng: 121.0322 },
};

export type NearestEntrance = { lat: number; lng: number; label: string };

/**
 * For an MRT-3 station, returns the entrance (east/west of EDSA) closer to
 * the given destination. Returns null for anything not in the MRT-3 list —
 * callers should fall back to the stop's own centroid, unchanged.
 */
export function nearestStationEntrance(
  stationName: string,
  destLat: number,
  destLng: number,
): NearestEntrance | null {
  const station = MRT3_STATIONS[stationName];
  if (!station) return null;

  const { east, west } = entrancesFor(station.lat, station.lng);
  const distEast = haversineKm(east.lat, east.lng, destLat, destLng);
  const distWest = haversineKm(west.lat, west.lng, destLat, destLng);
  return distEast <= distWest ? east : west;
}
