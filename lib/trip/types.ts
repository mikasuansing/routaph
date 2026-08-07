import type { Itinerary, RideLeg } from '@/lib/routing/types';

export type TripStatus = 'idle' | 'active' | 'rerouting' | 'arrived' | 'ended';

export type GeoPosition = {
  lat: number;
  lng: number;
  accuracyM: number;
  timestamp: number;
  speedMps?: number; // from GeolocationCoordinates.speed — drives ride-leg ETAs
  /**
   * Compass heading in degrees, 0 = north, clockwise. Turns the map so the
   * way you're travelling points up.
   *
   * `GeolocationCoordinates.heading` is null whenever the device is still,
   * and null on most desktop browsers entirely, so the trip screen falls
   * back to the bearing between consecutive fixes.
   */
  headingDeg?: number;
};

export type RideOption = {
  provider:   string;
  fareMin:    number;
  fareMax:    number;
  etaMin:     number;
  etaMax:     number;
  deepLink:   string;
  disclaimer: string;
};

export type Disruption = {
  id:          number;
  corridorId:  number;
  startAt:     string;
  endAt:       string | null;
  description: string;
};

export type TripState = {
  status:            TripStatus;
  itinerary:         Itinerary | null;
  originalDest:      { lat: number; lng: number } | null;
  currentLegIndex:   number;
  position:          GeoPosition | null;
  gpsDenied:         boolean;
  reroutes:          Itinerary[];
  rideOptions:       RideOption[];
  activeDisruption:  Disruption | null;
  // Crowdsourced live tracking — OFF unless the rider turns it on for this
  // trip. Never remembered across trips: consent to share your position on
  // one ride is not consent for every future one, so this always starts
  // false and resets when the trip ends.
  sharingPosition:   boolean;
};

export type TripAction =
  | { type: 'START';      itinerary: Itinerary }
  | { type: 'RESUME';     itinerary: Itinerary; legIndex: number }
  | { type: 'END' }
  | { type: 'SET_POS';    position: GeoPosition }
  | { type: 'GPS_DENIED' }
  | { type: 'ADVANCE_LEG' }
  | { type: 'REROUTING' }
  | { type: 'REROUTE_DONE'; reroutes: Itinerary[]; rideOptions: RideOption[] }
  | { type: 'SET_DISRUPTION'; disruption: Disruption | null }
  | { type: 'SET_SHARING'; sharing: boolean };

export const TRIP_STORAGE_KEY = 'parapo:active_trip';

// Separate from TRIP_STORAGE_KEY (which holds the Itinerary handoff shape
// documented in BASELINE §3.2) so a tab kill/reload mid-trip — the exact
// moment MRT tunnels tend to cause, between signal loss and a background
// tab getting evicted — resumes at the leg the rider was actually on
// instead of silently restarting the trip from leg 0.
export const TRIP_PROGRESS_KEY = 'parapo:trip_progress';

// Helpers to identify the "arrival stop" of a leg for auto-advance checks
export function getLegArrivalStop(itinerary: Itinerary, legIndex: number) {
  const leg = itinerary.legs[legIndex];
  if (!leg) return null;
  if (leg.type === 'ride') return (leg as RideLeg).to;
  // walk leg — arrival is the toLat/toLng
  return { lat: leg.toLat, lng: leg.toLng, id: -1, name: leg.toName };
}

// ID of the corridor being ridden on the current leg (for disruption polling)
export function getCurrentLineId(itinerary: Itinerary, legIndex: number): number | null {
  const leg = itinerary.legs[legIndex];
  if (!leg || leg.type !== 'ride') return null;
  return (leg as RideLeg).line.id;
}
