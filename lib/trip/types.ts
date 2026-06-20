import type { Itinerary, RideLeg } from '@/lib/routing/types';

export type TripStatus = 'idle' | 'active' | 'rerouting' | 'arrived' | 'ended';

export type GeoPosition = {
  lat: number;
  lng: number;
  accuracyM: number;
  timestamp: number;
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
  reroutes:          Itinerary[];
  rideOptions:       RideOption[];
  activeDisruption:  Disruption | null;
};

export type TripAction =
  | { type: 'START';      itinerary: Itinerary }
  | { type: 'END' }
  | { type: 'SET_POS';    position: GeoPosition }
  | { type: 'ADVANCE_LEG' }
  | { type: 'REROUTING' }
  | { type: 'REROUTE_DONE'; reroutes: Itinerary[]; rideOptions: RideOption[] }
  | { type: 'SET_DISRUPTION'; disruption: Disruption | null };

export const TRIP_STORAGE_KEY = 'parapo:active_trip';

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
