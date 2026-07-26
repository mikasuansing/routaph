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
  getLegArrivalStop,
  TRIP_PROGRESS_KEY,
  TRIP_STORAGE_KEY,
} from './types';
import { distToNextStop, shouldAdvanceLeg } from './geo';
import { notifyApproachingStop } from './notify';

// ── Reducer ───────────────────────────────────────────────────────────────────

export const INITIAL: TripState = {
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

// Exported for unit testing — a pure function is easiest tested directly,
// consistent with this project's lib/** pure-function test convention,
// rather than mounting the provider through React Testing Library.
export function reducer(state: TripState, action: TripAction): TripState {
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
    case 'RESUME': {
      const dest = action.itinerary.legs.at(-1);
      const originalDest = dest
        ? dest.type === 'walk'
          ? { lat: dest.toLat, lng: dest.toLng }
          : { lat: dest.to.lat, lng: dest.to.lng }
        : null;
      const legIndex = Math.min(Math.max(action.legIndex, 0), action.itinerary.legs.length - 1);
      return {
        ...INITIAL,
        status:        'active',
        itinerary:     action.itinerary,
        originalDest,
        currentLegIndex: legIndex,
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
  resumeTrip:     (itinerary: Itinerary, legIndex: number) => void;
  endTrip:        () => void;
  advanceLeg:     () => void;
  saveTrip:       () => Promise<boolean>;
  triggerReroute: () => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

const DISRUPTION_POLL_MS = 30_000;
// "Next stop approaching" fires once per leg, inside this distance.
const NEXT_STOP_NOTIFY_KM = 0.3;

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const latestStateRef = useRef<TripState>(INITIAL);
  const watchIdRef = useRef<number | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks which leg index the "approaching" alert already fired for, so it
  // doesn't re-fire on every GPS tick while still inside the notify radius.
  const notifiedLegRef = useRef<number>(-1);

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
    notifiedLegRef.current = -1;
    dispatch({ type: 'START', itinerary });
    // Persist itinerary in sessionStorage for page reload resilience.
    // GPS is NEVER persisted — only the itinerary shape (+ leg progress).
    try {
      sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(itinerary));
      sessionStorage.removeItem(TRIP_PROGRESS_KEY); // fresh trip starts at leg 0
    } catch {
      // sessionStorage unavailable (SSR guard / private mode) — non-fatal
    }
  }, [cleanup]);

  // Resumes a trip already in sessionStorage at its last-confirmed leg,
  // instead of restarting from leg 0 — for when the tab was reloaded or
  // killed mid-trip (a background tab losing signal in an MRT tunnel is
  // exactly when mobile browsers are most likely to evict it).
  const resumeTrip = useCallback((itinerary: Itinerary, legIndex: number) => {
    cleanup();
    notifiedLegRef.current = legIndex; // already past this leg's "approaching" alert
    dispatch({ type: 'RESUME', itinerary, legIndex });
  }, [cleanup]);

  const endTrip = useCallback(() => {
    cleanup();
    dispatch({ type: 'END' });
    try {
      sessionStorage.removeItem(TRIP_STORAGE_KEY);
      sessionStorage.removeItem(TRIP_PROGRESS_KEY);
    } catch { /* noop */ }
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

        // Auto-advance guard: never advance a leg off a low-quality fix.
        // A 500 m-accuracy reading can put you "at" a stop you haven't
        // reached; manual "Mark leg done" always remains available.
        const MAX_ADVANCE_ACCURACY_M = 100;
        if (gp.accuracyM > MAX_ADVANCE_ACCURACY_M) return;

        const latest = latestStateRef.current;
        if (
          latest.itinerary &&
          latest.currentLegIndex < latest.itinerary.legs.length &&
          shouldAdvanceLeg(gp, latest.itinerary, latest.currentLegIndex)
        ) {
          dispatch({ type: 'ADVANCE_LEG' });
          return;
        }

        // "Next stop approaching" — once per leg, well before the 150 m
        // auto-advance threshold so there's time to get up / move to the door.
        if (
          latest.itinerary &&
          latest.currentLegIndex < latest.itinerary.legs.length &&
          notifiedLegRef.current !== latest.currentLegIndex
        ) {
          const dist = distToNextStop(gp, latest.itinerary, latest.currentLegIndex);
          if (dist !== null && dist <= NEXT_STOP_NOTIFY_KM) {
            notifiedLegRef.current = latest.currentLegIndex;
            const leg = latest.itinerary.legs[latest.currentLegIndex];
            const arrival = getLegArrivalStop(latest.itinerary, latest.currentLegIndex);
            const modeLabel = leg?.type === 'ride' ? leg.line.mode.toUpperCase() : 'WALK';
            if (arrival) notifyApproachingStop(arrival.name, modeLabel);
          }
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

  // Persist leg progress on every advance so a reload/tab-kill mid-trip
  // resumes at the right leg instead of restarting (see resumeTrip above).
  useEffect(() => {
    if (state.status !== 'active') return;
    try {
      sessionStorage.setItem(TRIP_PROGRESS_KEY, JSON.stringify({ legIndex: state.currentLegIndex }));
    } catch { /* non-fatal */ }
  }, [state.status, state.currentLegIndex]);

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
    <TripContext.Provider value={{ ...state, startTrip, resumeTrip, endTrip, advanceLeg, saveTrip, triggerReroute }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTripContext() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTripContext must be used inside <TripProvider>');
  return ctx;
}
