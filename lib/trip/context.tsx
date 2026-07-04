'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { Itinerary } from '@/lib/routing/types';
import type {
  Disruption,
  GeoPosition,
  RideOption,
  TripAction,
  TripState,
} from './types';
import {
  getCurrentLineId,
  TRIP_STORAGE_KEY,
} from './types';
import { shouldAdvanceLeg } from './geo';

// ── Reducer ───────────────────────────────────────────────────────────────────

const INITIAL: TripState = {
  status:           'idle',
  itinerary:        null,
  originalDest:     null,
  currentLegIndex:  0,
  position:         null,
  gpsDenied:        false,
  reroutes:         [],
  rideOptions:      [],
  activeDisruption: null,
};

function reducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'START': {
      const dest = action.itinerary.legs.at(-1);
      const originalDest = dest
        ? dest.type === 'walk'
          ? { lat: dest.toLat, lng: dest.toLng }
          : { lat: dest.to.lat, lng: dest.to.lng }
        : null;
      return {
        ...INITIAL,
        status:        'active',
        itinerary:     action.itinerary,
        originalDest,
        currentLegIndex: 0,
      };
    }
    case 'END':
      return { ...INITIAL, status: 'ended' };
    case 'SET_POS':
      return { ...state, position: action.position, gpsDenied: false };
    case 'GPS_DENIED':
      return { ...state, gpsDenied: true };
    case 'ADVANCE_LEG': {
      if (!state.itinerary) return state;
      const next = state.currentLegIndex + 1;
      if (next >= state.itinerary.legs.length) {
        return { ...state, status: 'arrived', currentLegIndex: next };
      }
      return { ...state, currentLegIndex: next };
    }
    case 'REROUTING':
      return { ...state, status: 'rerouting' };
    case 'REROUTE_DONE':
      return {
        ...state,
        status:      'active',
        reroutes:    action.reroutes,
        rideOptions: action.rideOptions,
      };
    case 'SET_DISRUPTION':
      return { ...state, activeDisruption: action.disruption };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

type TripContextValue = TripState & {
  startTrip:      (itinerary: Itinerary) => void;
  endTrip:        () => void;
  advanceLeg:     () => void;
  saveTrip:       () => Promise<boolean>;
  triggerReroute: () => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

const DISRUPTION_POLL_MS = 30_000;

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const latestStateRef = useRef<TripState>(INITIAL);
  const watchIdRef = useRef<number | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  // Stop the GPS watcher and disruption poll
  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startTrip = useCallback((itinerary: Itinerary) => {
    cleanup();
    dispatch({ type: 'START', itinerary });
    // Persist itinerary in sessionStorage for page reload resilience.
    // GPS is NEVER persisted — only the itinerary shape.
    try {
      sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(itinerary));
    } catch {
      // sessionStorage unavailable (SSR guard / private mode) — non-fatal
    }
  }, [cleanup]);

  const endTrip = useCallback(() => {
    cleanup();
    dispatch({ type: 'END' });
    try { sessionStorage.removeItem(TRIP_STORAGE_KEY); } catch { /* noop */ }
  }, [cleanup]);

  // Manual advance — "mark this leg done". Works with or without GPS; on the
  // last leg it transitions the trip to 'arrived'.
  const advanceLeg = useCallback(() => {
    dispatch({ type: 'ADVANCE_LEG' });
  }, []);

  // Explicit save only (BASELINE §7.7) — called from the arrival screen's
  // "Save trip" action, never automatically.
  const saveTrip = useCallback(async (): Promise<boolean> => {
    const itinerary = latestStateRef.current.itinerary;
    if (!itinerary) return false;
    const session = (await supabaseBrowser.auth.getSession()).data.session;
    if (!session) return false;
    // Access walk legs carry generic "Origin"/"Destination" names — prefer
    // the boarding/alighting stop of the first/last ride leg when so.
    const rides = itinerary.legs.filter(l => l.type === 'ride');
    const destinationLeg = itinerary.legs.at(-1);
    let destinationName = destinationLeg?.type === 'walk'
      ? destinationLeg.toName
      : destinationLeg?.type === 'ride'
        ? destinationLeg.to.name
        : 'Destination';
    if (destinationName === 'Destination' && rides.length > 0) {
      destinationName = (rides.at(-1) as Extract<typeof rides[number], { type: 'ride' }>).to.name;
    }
    const firstLeg = itinerary.legs[0];
    let originName = firstLeg?.type === 'walk'
      ? firstLeg.fromName
      : firstLeg?.type === 'ride'
        ? firstLeg.from.name
        : 'Origin';
    if (originName === 'Origin' && rides.length > 0) {
      originName = (rides[0] as Extract<typeof rides[number], { type: 'ride' }>).from.name;
    }
    const distanceKm = itinerary.legs.reduce((sum, leg) => sum + leg.distKm, 0);
    const payload = {
      origin: originName,
      destination: destinationName,
      distanceKm: Math.round(distanceKm * 100) / 100,
      fareEstimate: itinerary.totalFare,
      modesUsed: itinerary.legs.filter((leg) => leg.type === 'ride').map((leg) => leg.type === 'ride' ? leg.mode : 'walk'),
    };

    try {
      const res = await fetch('/api/v1/me/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  // Start GPS watcher whenever status transitions to 'active'
  useEffect(() => {
    if (state.status !== 'active' || !state.itinerary) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const gp: GeoPosition = {
          lat:       pos.coords.latitude,
          lng:       pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          timestamp: pos.timestamp,
          speedMps:  pos.coords.speed ?? undefined,
        };
        dispatch({ type: 'SET_POS', position: gp });

        const latest = latestStateRef.current;
        if (
          latest.itinerary &&
          latest.currentLegIndex < latest.itinerary.legs.length &&
          shouldAdvanceLeg(gp, latest.itinerary, latest.currentLegIndex)
        ) {
          dispatch({ type: 'ADVANCE_LEG' });
        }
      },
      (err) => {
        // PERMISSION_DENIED (1) — surface it so the UI offers manual advance.
        // Transient errors (unavailable/timeout) keep the watcher alive.
        if (err.code === 1) dispatch({ type: 'GPS_DENIED' });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.itinerary]);

  // Disruption poll — runs while a trip is active
  useEffect(() => {
    if (state.status !== 'active' || !state.itinerary) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      if (!state.itinerary) return;
      const lineId = getCurrentLineId(state.itinerary, state.currentLegIndex);
      if (lineId === null) return;
      try {
        const res = await fetch(`/api/v1/disruptions?lineId=${lineId}`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: Disruption[] };
        const first = json.data?.[0] ?? null;
        dispatch({ type: 'SET_DISRUPTION', disruption: first });
      } catch { /* non-fatal */ }
    };

    poll(); // immediate first check
    pollRef.current = setInterval(poll, DISRUPTION_POLL_MS);
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.currentLegIndex]);

  const triggerReroute = useCallback(async () => {
    if (!state.itinerary || !state.position || !state.originalDest) return;
    dispatch({ type: 'REROUTING' });

    const leg = state.itinerary.legs[state.currentLegIndex];
    const excludeLines: number[] =
      leg?.type === 'ride' ? [leg.line.id] : [];

    const body = {
      origin:       { lat: state.position.lat, lng: state.position.lng },
      destination:  state.originalDest,
      excludeLines,
    };

    const [rerouteRes, optionsRes] = await Promise.allSettled([
      fetch('/api/v1/routes/reroute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      fetch(
        `/api/v1/transport/options?originLat=${state.position.lat}` +
        `&originLng=${state.position.lng}` +
        `&destLat=${state.originalDest.lat}&destLng=${state.originalDest.lng}`,
      ),
    ]);

    const reroutes: Itinerary[] =
      rerouteRes.status === 'fulfilled' && rerouteRes.value.ok
        ? ((await rerouteRes.value.json()) as { data: Itinerary[] }).data ?? []
        : [];

    const rideOptions: RideOption[] =
      optionsRes.status === 'fulfilled' && optionsRes.value.ok
        ? ((await optionsRes.value.json()) as { data: RideOption[] }).data ?? []
        : [];

    dispatch({ type: 'REROUTE_DONE', reroutes, rideOptions });
  }, [state.itinerary, state.position, state.originalDest, state.currentLegIndex]);

  return (
    <TripContext.Provider value={{ ...state, startTrip, endTrip, advanceLeg, saveTrip, triggerReroute }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTripContext() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTripContext must be used inside <TripProvider>');
  return ctx;
}
