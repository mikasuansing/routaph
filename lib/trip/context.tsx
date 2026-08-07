'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
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
import { MIN_HEADING_SPEED_MPS, bearingBetween, distToNextStop, shouldAdvanceLeg } from './geo';
import { haversineKm } from '@/lib/routing/utils';
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
  sharingPosition:  false,
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
    case 'SET_SHARING':
      return { ...state, sharingPosition: action.sharing };
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
  triggerReroute: () => Promise<void>;
  setSharingPosition: (sharing: boolean) => void;
};

const TripContext = createContext<TripContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

const DISRUPTION_POLL_MS = 30_000;
// "Next stop approaching" fires once per leg, inside this distance.
const NEXT_STOP_NOTIFY_KM = 0.3;
// How often an opted-in rider contributes a position to the live map.
// 15 s is frequent enough to keep a train marker believable and slow
// enough that it barely touches battery or data.
const LIVE_PING_MS = 15_000;
// Don't contribute a fix this poor — it would only blur the estimate.
const LIVE_PING_MAX_ACCURACY_M = 150;

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const latestStateRef = useRef<TripState>(INITIAL);
  const watchIdRef = useRef<number | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks which leg index the "approaching" alert already fired for, so it
  // doesn't re-fire on every GPS tick while still inside the notify radius.
  const notifiedLegRef = useRef<number>(-1);
  // Ephemeral per-trip token for live position sharing. Random, never an
  // account/device ID, regenerated on every trip and dropped when it ends —
  // it only lets the server infer travel direction from a rider's own two
  // most recent pings. See lib/live/store.ts for the privacy contract.
  const riderKeyRef = useRef<string | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (pingTimerRef.current !== null) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
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
    // Drop the sharing token with the trip. Consent was for this ride only.
    riderKeyRef.current = null;
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

  // Start GPS watcher whenever status transitions to 'active'
  useEffect(() => {
    if (state.status !== 'active' || !state.itinerary) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const prev = latestStateRef.current.position;
        const speed = pos.coords.speed ?? undefined;

        // Prefer the device's own compass heading. It is null whenever the
        // phone is still and null on most desktop browsers, so fall back to
        // the bearing between this fix and the last — but only while
        // actually moving, since a stationary phone produces bearings that
        // swing wildly and would spin the map on the platform.
        let headingDeg = pos.coords.heading ?? undefined;
        if (headingDeg === undefined && prev) {
          const movedKm = haversineKm(prev.lat, prev.lng, pos.coords.latitude, pos.coords.longitude);
          const movingFast = (speed ?? 0) >= MIN_HEADING_SPEED_MPS;
          // A fix can jitter by metres while stationary; require real travel.
          if (movingFast || movedKm > 0.02) {
            headingDeg = bearingBetween(prev.lat, prev.lng, pos.coords.latitude, pos.coords.longitude);
          } else {
            headingDeg = prev.headingDeg;
          }
        }

        const gp: GeoPosition = {
          lat:       pos.coords.latitude,
          lng:       pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          timestamp: pos.timestamp,
          speedMps:  speed,
          headingDeg,
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

  // Opt in / out of contributing this trip's position to the live map.
  // Turning it on mints a fresh random token; turning it off destroys it,
  // so a later re-opt-in is not linkable to the earlier stretch of the ride.
  const setSharingPosition = useCallback((sharing: boolean) => {
    if (sharing) {
      riderKeyRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().replace(/-/g, '')
          : Math.random().toString(36).slice(2).padEnd(20, '0').repeat(2).slice(0, 32);
    } else {
      riderKeyRef.current = null;
      if (pingTimerRef.current !== null) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    }
    dispatch({ type: 'SET_SHARING', sharing });
  }, []);

  // Contribute position to the crowdsourced live map — only while the rider
  // has explicitly opted in, only on a ride leg (never while walking, which
  // would put a "train" on a sidewalk), and only off a good fix.
  useEffect(() => {
    if (!state.sharingPosition || state.status !== 'active') return;

    const sendPing = async () => {
      const latest = latestStateRef.current;
      const rider = riderKeyRef.current;
      if (!rider || !latest.itinerary || !latest.position) return;
      if (latest.position.accuracyM > LIVE_PING_MAX_ACCURACY_M) return;

      const lineId = getCurrentLineId(latest.itinerary, latest.currentLegIndex);
      if (lineId === null) return; // walking leg — nothing to attribute a ping to

      try {
        await fetch('/api/v1/live/ping', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineId,
            riderKey:  rider,
            lat:       latest.position.lat,
            lng:       latest.position.lng,
            accuracyM: latest.position.accuracyM,
          }),
        });
      } catch { /* non-fatal — the rider's own trip must not depend on this */ }
    };

    sendPing();
    pingTimerRef.current = setInterval(sendPing, LIVE_PING_MS);
    return () => {
      if (pingTimerRef.current !== null) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };
  }, [state.sharingPosition, state.status]);

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
    <TripContext.Provider value={{ ...state, startTrip, resumeTrip, endTrip, advanceLeg, triggerReroute, setSharingPosition }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTripContext() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTripContext must be used inside <TripProvider>');
  return ctx;
}
