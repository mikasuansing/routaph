'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TripProvider, useTripContext } from '@/lib/trip/context';
import type { Itinerary, RideLeg, WalkLeg } from '@/lib/routing/types';
import { TRIP_PROGRESS_KEY, TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { distToNextStop, etaToNextStop } from '@/lib/trip/geo';
import { ReportIssueButton } from '@/app/components/ReportIssueSheet';
import { notificationPermission, requestNotificationPermission } from '@/lib/trip/notify';
import { nearestStationEntrance } from '@/lib/routing/stationEntrances';
import { t, loadLang, type Lang } from '@/lib/i18n';
import { useTheme } from '@/app/providers';

// Voyager (light) / Dark Matter (dark). Swapped live on theme change, not
// just picked once at init — see the theme effect below.
const TILE_URL = (isDark: boolean) => isDark
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

/*
 * Trip Companion — live tracking screen.
 * Monochrome minimal: typography carries the hierarchy; the single accent
 * (transit green) marks the live GPS state and arrival confirmation.
 */

const C = {
  bg:     'var(--color-bg)',
  card:   'var(--color-card)',
  cardEl: 'var(--color-card-el)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
  onPrimary: 'var(--color-on-primary)',
};

const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=Baloo+2:wght@600;700;800&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
body{font-family:var(--font-sans);}
button:active{opacity:0.85;}
.tnum{font-variant-numeric:tabular-nums;}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
`;

const DISPLAY = 'var(--font-display)';

function Micro({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color ?? C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', ...style }}>
      {children}
    </p>
  );
}

const MODE_TAG: Record<string, string> = { mrt: 'MRT', lrt: 'LRT', bus: 'BUS', jeepney: 'JEEP', walk: 'WALK' };

function modeTag(leg: RideLeg | WalkLeg | undefined): string {
  if (!leg) return 'WALK';
  if (leg.type === 'walk') return 'WALK';
  return MODE_TAG[(leg as RideLeg).line.mode] ?? 'RIDE';
}

function legLabel(leg: RideLeg | WalkLeg | undefined): string {
  if (!leg) return '';
  if (leg.type === 'ride') {
    const r = leg as RideLeg;
    return `${r.line.name} → ${r.to.name} (${r.stops.length} stop${r.stops.length !== 1 ? 's' : ''})`;
  }
  const w = leg as WalkLeg;
  return `Walk to ${w.toName} (${Math.round(w.distKm * 1000)} m)`;
}

/*
 * Step-by-step instruction helpers.
 *
 * The old card read "LRT-2 → Buendia (9 stops)", which packs the line, the
 * destination and the stop count into one line of shorthand and never says
 * what to actually DO. These split a leg into an instruction you can follow
 * without decoding it: what to get on, where to get off, and — once the
 * step is done — what the next one is.
 */

/** What to do for this leg, as an instruction ("Take the LRT-2 train"). */
function legAction(leg: RideLeg | WalkLeg | undefined, lang: Lang): string {
  if (!leg) return '';
  if (leg.type === 'walk') {
    return t(lang, 'walk_step', { stop: (leg as WalkLeg).toName });
  }
  const r = leg as RideLeg;
  const key =
    r.line.mode === 'jeepney' ? 'take_a_jeepney'
    : r.line.mode === 'bus'   ? 'take_the_bus'
    : 'take_the_train';
  return t(lang, key, { line: r.line.name });
}

/** Where this leg ends — the place completing it puts you. */
function legEndName(leg: RideLeg | WalkLeg | undefined): string {
  if (!leg) return '';
  return leg.type === 'walk' ? (leg as WalkLeg).toName : (leg as RideLeg).to.name;
}

/**
 * Label for the button that completes this leg. It names the place rather
 * than saying "mark leg done", so tapping it is an obvious statement of
 * fact ("I got off at Cubao") instead of app jargon.
 */
function legDoneLabel(leg: RideLeg | WalkLeg | undefined, isLast: boolean, lang: Lang): string {
  if (isLast) return t(lang, 'done_finish_trip');
  const stop = legEndName(leg);
  if (!leg) return t(lang, 'done_finish_trip');
  return leg.type === 'ride'
    ? t(lang, 'done_got_off', { stop })
    : t(lang, 'done_arrived_at', { stop });
}

// ── Inner component (must be inside TripProvider) ─────────────────────────────

function TripScreen() {
  const router = useRouter();
  const trip = useTripContext();
  const { theme } = useTheme();
  const [geoPerm, setGeoPerm] = useState<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(notificationPermission);
  const [lang] = useState(loadLang);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Ticks while a trip is active so the "last known position" staleness
  // check below re-evaluates even when no new GPS fix is coming in
  // (exactly the MRT-tunnel case: GPS goes quiet but the clock doesn't).
  useEffect(() => {
    if (trip.status !== 'active') return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [trip.status]);

  const mapElRef  = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<unknown>(null);
  const tileRef   = useRef<unknown>(null);
  const posMarker = useRef<unknown>(null);

  // Track browser geolocation permission so the UI can explain itself
  useEffect(() => {
    let active = true;
    let status: PermissionStatus | null = null;
    try {
      navigator.permissions?.query({ name: 'geolocation' }).then(s => {
        if (!active) return;
        status = s;
        setGeoPerm(s.state);
        s.onchange = () => setGeoPerm(s.state);
      }).catch(() => { /* unsupported — stay unknown */ });
    } catch { /* unsupported */ }
    return () => { active = false; if (status) status.onchange = null; };
  }, []);

  // On mount: restore itinerary from sessionStorage. If leg progress was
  // also saved (a prior tab session got this far before reload/eviction —
  // the exact failure mode a signal-loss tunnel causes), resume there
  // instead of silently restarting the trip from leg 0.
  useEffect(() => {
    if (trip.status !== 'idle') return;
    try {
      const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
      if (!raw) { router.replace('/planner'); return; }
      const itinerary = JSON.parse(raw) as Itinerary;

      const progressRaw = sessionStorage.getItem(TRIP_PROGRESS_KEY);
      const legIndex = progressRaw ? (JSON.parse(progressRaw) as { legIndex: number }).legIndex : 0;
      if (typeof legIndex === 'number' && legIndex > 0 && legIndex < itinerary.legs.length) {
        trip.resumeTrip(itinerary, legIndex);
      } else {
        trip.startTrip(itinerary);
      }
    } catch {
      router.replace('/planner');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation is a side effect — never call router.replace during render
  useEffect(() => {
    if (trip.status === 'ended') router.replace('/planner');
  }, [trip.status, router]);

  // Keep the screen awake during an active trip — mobile browsers pause the
  // GPS watcher when the screen locks. Best-effort: not all browsers support
  // the Wake Lock API, and it must be re-acquired when the tab regains focus.
  useEffect(() => {
    if (trip.status !== 'active') return;
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wl = (navigator as any).wakeLock;
        if (!wl) return;
        const l = await wl.request('screen');
        if (disposed) { void l.release(); return; }
        lock = l;
      } catch { /* low battery or unsupported — non-fatal */ }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => { /* already released */ });
    };
  }, [trip.status]);

  // Live map: route polyline + stops, initialised once the trip is active
  useEffect(() => {
    if ((trip.status !== 'active' && trip.status !== 'rerouting') || !trip.itinerary) return;
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then(mod => {
      if (cancelled || !mapElRef.current || mapRef.current) return;
      const L = mod.default ?? mod;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const accent = isDark ? '#7A90FF' : '#2947DE';
      const walkLine = isDark ? '#A5988A' : '#8D8672';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (L as any).map(mapElRef.current, { zoomControl: false, attributionControl: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tileRef.current = (L as any).tileLayer(
        TILE_URL(isDark),
        { subdomains: 'abcd', maxZoom: 19 },
      ).addTo(map);

      const all: [number, number][] = [];
      for (const leg of trip.itinerary!.legs) {
        if (leg.type === 'walk') {
          const a: [number, number] = [leg.fromLat, leg.fromLng];
          const b: [number, number] = [leg.toLat, leg.toLng];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (L as any).polyline([a, b], { color: walkLine, weight: 2, dashArray: '4,7', opacity: 0.8 }).addTo(map);
          all.push(a, b);
        } else {
          const coords = (leg as RideLeg).stops.map(s => [s.lat, s.lng] as [number, number]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (L as any).polyline(coords, { color: accent, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
          all.push(...coords);
        }
      }
      mapRef.current = map;

      // The container often has no measured size on first paint (flex/scroll
      // layout hasn't settled), so an immediate fitBounds anchors to a 0×0
      // viewport and zooms to max over one point. Recompute size, then fit —
      // and once more on the next frame to catch the settled layout.
      const fit = () => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).invalidateSize(false);
        if (all.length >= 2) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.fitBounds((L as any).latLngBounds(all), { padding: [28, 28], maxZoom: 16 });
        }
      };
      fit();
      requestAnimationFrame(fit);
      setTimeout(fit, 250);
    });

    return () => { cancelled = true; };
  }, [trip.status, trip.itinerary]);

  // Keep the basemap in step with the theme toggle — a dark basemap left
  // under a cream page makes the whole screen look broken.
  useEffect(() => {
    if (!tileRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tileRef.current as any).setUrl(TILE_URL(theme === 'dark'));
  }, [theme]);

  // Tear the map down when leaving the active screen
  useEffect(() => {
    if (trip.status === 'active' || trip.status === 'rerouting') return;
    if (mapRef.current) {
      tileRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapRef.current as any).remove();
      mapRef.current = null;
      posMarker.current = null;
    }
  }, [trip.status]);

  // Live position marker follows the GPS fix
  useEffect(() => {
    if (!mapRef.current || !trip.position) return;
    import('leaflet').then(mod => {
      const L = mod.default ?? mod;
      if (!mapRef.current || !trip.position) return;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const here: [number, number] = [trip.position.lat, trip.position.lng];
      if (posMarker.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (posMarker.current as any).setLatLng(here);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        posMarker.current = (L as any).circleMarker(here, {
          radius: 9, fillColor: isDark ? '#7A90FF' : '#2947DE', fillOpacity: 1,
          color: isDark ? '#000' : '#fff', weight: 3,
        }).addTo(mapRef.current);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapRef.current as any).panTo(here, { animate: true });
    });
  }, [trip.position]);

  if (trip.status === 'idle') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,system-ui,sans-serif' }}>
        <style>{GLOBAL}</style>
        Loading trip…
      </div>
    );
  }

  if (trip.status === 'arrived') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px', fontFamily: 'Inter,system-ui,sans-serif' }}>
        <style>{GLOBAL}</style>
        <Micro color={C.accent}>✓ Trip complete</Micro>
        <h1 style={{ margin: '14px 0 0', fontFamily: DISPLAY, fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          You&apos;ve arrived.
        </h1>
        {trip.itinerary && (
          <p className="tnum" style={{ margin: '16px 0 0', fontSize: 16, color: C.body }}>
            ₱{trip.itinerary.totalFare.toFixed(2)} total fare · {trip.itinerary.transfers} transfer{trip.itinerary.transfers !== 1 ? 's' : ''}
          </p>
        )}
        <button
          style={{ marginTop: 36, padding: '17px', background: 'var(--gradient-primary)', color: C.onPrimary, border: 'none', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', boxShadow: '0 6px 18px rgba(41,71,222,0.25)' }}
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          Plan another trip
        </button>
      </div>
    );
  }

  if (trip.status === 'ended') return null;

  const { itinerary, currentLegIndex, position, gpsDenied, status, reroutes, rideOptions, activeDisruption, originalDest, sharingPosition, setSharingPosition } = trip;
  if (!itinerary) return null;

  const currentLeg = itinerary.legs[currentLegIndex];
  const nextLeg    = itinerary.legs[currentLegIndex + 1];
  const isLastLeg  = currentLegIndex >= itinerary.legs.length - 1;

  // A GPS fix that's gone quiet for a while (MRT tunnel, no signal) still
  // shows the LAST KNOWN position/ETA below rather than blanking — but
  // labeled as last-known so it's not mistaken for a live reading.
  const SIGNAL_STALE_MS = 20_000;
  const signalStale = position !== null && nowTick - position.timestamp > SIGNAL_STALE_MS;

  const finalEntrance = isLastLeg && currentLeg?.type === 'walk'
    ? nearestStationEntrance(currentLeg.fromName, currentLeg.toLat, currentLeg.toLng)
    : null;

  const distKm = position ? distToNextStop(position, itinerary, currentLegIndex) : null;
  // Jeepneys have no fixed schedule — show distance only, never a minute ETA.
  const currentIsJeepney = currentLeg?.type === 'ride' && (currentLeg as RideLeg).line.mode === 'jeepney';
  const eta    = position && !currentIsJeepney ? etaToNextStop(position, itinerary, currentLegIndex, position.speedMps) : null;

  const wazeUrl = originalDest
    ? `https://waze.com/ul?ll=${originalDest.lat},${originalDest.lng}&navigate=yes&utm_source=parapo`
    : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', flexDirection: 'column', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <style>{GLOBAL}</style>

      {/* Header */}
      <header style={{ padding: '52px 24px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
            ParaPo<span style={{ color: C.ink }}>.</span>
          </span>
          <h1 style={{ margin: '4px 0 0', fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Trip in progress</h1>
          {/* Live status — the single accent marks a live GPS fix */}
          <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: position ? C.accent : C.muted }}>
            {position
              ? '● Live location'
              : gpsDenied
                ? '○ Location unavailable — manual mode'
                : <span style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>○ Finding your location</span>}
          </p>
        </div>
        <button
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          End trip
        </button>
      </header>

      {/* Active disruption — bold type, no color theatre */}
      {activeDisruption && status !== 'rerouting' && (
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>▲ {activeDisruption.description}</p>
            <button
              style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 800, color: C.ink, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              onClick={() => trip.triggerReroute()}
            >
              Reroute
            </button>
          </div>
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
        {/* Live map — the route, and your position once GPS locks */}
        <div ref={mapElRef} style={{ height: '34vh', minHeight: 200, borderRadius: 20, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }} />

        {/* GPS state — explain, and offer a way in, instead of failing silently */}
        {!position && (gpsDenied || geoPerm === 'denied') && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 16 }}>
            <Micro>Location access is blocked</Micro>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: C.body, lineHeight: 1.7 }}>
              Your browser is blocking location for this site, so the map can&apos;t follow
              you and steps won&apos;t advance on their own. To turn it on: tap the
              <strong style={{ color: C.ink }}> padlock icon</strong> next to the address →
              <strong style={{ color: C.ink }}> Site settings</strong> →
              <strong style={{ color: C.ink }}> Location</strong> → Allow, then reload.
              You can still follow the trip — just tap
              <strong style={{ color: C.ink }}> Done</strong> at the end of each step.
            </p>
          </div>
        )}
        {!position && !gpsDenied && geoPerm !== 'denied' && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.body, animation: 'pulse 1.6s ease-in-out infinite' }}>
              Finding your location…
            </p>
            <button
              onClick={() => {
                try {
                  navigator.geolocation?.getCurrentPosition(() => { /* watcher picks it up */ }, () => { /* denied → banner above takes over */ });
                } catch { /* unsupported */ }
              }}
              style={{ padding: '9px 16px', borderRadius: 999, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              Enable GPS
            </button>
          </div>
        )}

        {notifPerm === 'default' && status === 'active' && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.body }}>
              Get an alert + buzz when your stop is close.
            </p>
            <button
              onClick={() => { requestNotificationPermission().then(setNotifPerm); }}
              style={{ padding: '9px 16px', borderRadius: 999, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Enable stop alerts
            </button>
          </div>
        )}

        {/* Crowdsourced live map opt-in. Deliberately phrased as a give,
            not a get: it does nothing for this rider's own trip, so the
            copy has to be honest that it's for everyone else. */}
        {status === 'active' && position && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 16 }}>
            <Micro color={sharingPosition ? C.accent : undefined}>
              {sharingPosition ? 'Helping the live map' : 'Help the live map'}
            </Micro>
            <p style={{ margin: '8px 0 14px', fontSize: 13, color: C.body, lineHeight: 1.7 }}>
              {sharingPosition
                ? 'Other commuters can see roughly where this vehicle is. Your position is anonymous, kept for 3 minutes, and never saved to our database.'
                : 'No operator publishes live train or bus positions here. Share your position anonymously while you ride and others can see where this vehicle is.'}
            </p>
            {/* Full-width below the copy rather than beside it — at 375 px a
                side-by-side button starves the explanation into a column
                barely six words wide, and this is text people should read
                before opting in. */}
            <button
              onClick={() => setSharingPosition(!sharingPosition)}
              aria-pressed={sharingPosition}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 999,
                border: sharingPosition ? `1.5px solid ${C.border}` : 'none',
                background: sharingPosition ? 'transparent' : C.accent,
                color: sharingPosition ? C.body : '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {sharingPosition ? 'Stop sharing' : 'Share position'}
            </button>
          </div>
        )}

        {/* Current leg — the glance */}
        {currentLeg && (
          <section style={{ marginBottom: 28, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18 }}>
            <Micro color={C.accent}>
              {t(lang, 'step_of', { n: String(currentLegIndex + 1), total: String(itinerary.legs.length) })} · {modeTag(currentLeg)}
            </Micro>

            {/* The instruction, as an instruction — "Take the LRT-2 train",
                not "LRT-2 → Buendia (9 stops)". */}
            <p style={{ margin: '8px 0 0', fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              {legAction(currentLeg, lang)}
            </p>

            {/* Where to get off is the one thing a rider must not miss, so it
                gets its own line at full contrast rather than a muted aside. */}
            {currentLeg.type === 'ride' && (
              <p style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>
                {t(lang, 'get_off_at', { stop: (currentLeg as RideLeg).to.name })}
                <span style={{ fontWeight: 500, color: C.muted }}>
                  {' · '}{t(lang, 'ride_stops', { count: String((currentLeg as RideLeg).stops.length) })}
                </span>
              </p>
            )}
            {currentLeg.type === 'walk' && (
              <p className="tnum" style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 700, color: C.ink }}>
                {Math.round((currentLeg as WalkLeg).distKm * 1000)} m
                <span style={{ fontWeight: 500, color: C.muted }}>
                  {' · '}{t(lang, 'about_min', { n: String(Math.max(1, Math.round((currentLeg as WalkLeg).durationMin))) })}
                </span>
              </p>
            )}

            {distKm !== null && (
              <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.muted }}>
                {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`}
                {eta !== null && ` · ~${eta} min`} to next stop
              </p>
            )}
            {signalStale && (
              <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: C.muted }}>
                Signal lost — showing last known position ({Math.round((nowTick - position!.timestamp) / 1000)}s ago)
              </p>
            )}
            {isLastLeg && currentLeg.type === 'walk' && finalEntrance && (
              <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: C.accent }}>
                Exit via the {finalEntrance.label} — closer to your destination
              </p>
            )}
            {status === 'active' && (
              <button
                style={{
                  marginTop: 18, width: '100%', padding: '16px', borderRadius: 999,
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'var(--gradient-primary)',
                  color: C.onPrimary,
                  border: 'none', letterSpacing: '0.01em',
                  boxShadow: '0 6px 18px rgba(41,71,222,0.25)',
                }}
                onClick={() => {
                  // Guard accidental taps: without any GPS fix the app can't
                  // tell where you are, so completing a leg needs intent.
                  if (!position && !window.confirm(
                    isLastLeg
                      ? 'No GPS fix — mark the whole trip as done anyway?'
                      : 'No GPS fix — mark this leg as done anyway?'
                  )) return;
                  trip.advanceLeg();
                }}
              >
                ✓ {legDoneLabel(currentLeg, isLastLeg, lang)}
              </button>
            )}

            {/* Naming the next step on the button's own card is what makes
                the hand-off legible: finish the bus leg and it is already
                clear that a jeepney comes next, before the card changes. */}
            {status === 'active' && nextLeg && !isLastLeg && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
                {t(lang, 'up_next')}: <span style={{ fontWeight: 700, color: C.body }}>{legAction(nextLeg, lang)}</span>
              </p>
            )}
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <ReportIssueButton
                routeId={currentLeg.type === 'ride' ? (currentLeg as RideLeg).line.id : undefined}
                stopId={currentLeg.type === 'ride' ? (currentLeg as RideLeg).to.id : undefined}
                contextLabel={legLabel(currentLeg)}
              />
            </div>
          </section>
        )}

        {/* The next step is announced on the action card itself (see "Up
            next" above) and listed in full below, so a third copy of it
            here was just noise between the button and the itinerary. */}

        {isLastLeg && (
          <p style={{ margin: '0 0 28px', fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: '0.02em' }}>
            {t(lang, 'almost_there')}
          </p>
        )}

        {/* All steps — a numbered checklist, so progress through a
            multi-vehicle trip is readable at a glance and a completed step
            visibly stays completed. */}
        <section style={{ marginBottom: 28 }}>
          <Micro>{t(lang, 'step_by_step')}</Micro>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {itinerary.legs.map((leg, i) => {
              const done = i < currentLegIndex;
              const here = i === currentLegIndex;
              return (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 14,
                  background: here ? C.cardEl : 'transparent',
                }}>
                  {/* Step number, or a tick once the step is behind you */}
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    background: done ? C.accent : here ? C.ink : 'transparent',
                    color: done || here ? C.onPrimary : C.muted,
                    border: done || here ? 'none' : `1.5px solid ${C.border}`,
                  }}>
                    {done ? '✓' : i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 14,
                      fontWeight: here ? 700 : 500,
                      color: done ? C.muted : here ? C.ink : C.body,
                      lineHeight: 1.4,
                    }}>
                      {legAction(leg, lang)}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                      {leg.type === 'ride'
                        ? `${t(lang, 'get_off_at', { stop: (leg as RideLeg).to.name })} · ${t(lang, 'ride_stops', { count: String((leg as RideLeg).stops.length) })}`
                        : `${Math.round((leg as WalkLeg).distKm * 1000)} m · ${t(lang, 'about_min', { n: String(Math.max(1, Math.round((leg as WalkLeg).durationMin))) })}`}
                    </p>
                  </div>
                  {here && <Micro color={C.accent} style={{ flexShrink: 0, paddingTop: 4 }}>{t(lang, 'now')}</Micro>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Rerouting state */}
        {status === 'rerouting' && (
          <p style={{ margin: '0 0 28px', fontSize: 14, color: C.muted, animation: 'pulse 1.6s ease-in-out infinite' }}>
            Finding alternatives…
          </p>
        )}

        {/* Reroute results */}
        {status !== 'rerouting' && reroutes.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <Micro>Alternative routes</Micro>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {reroutes.map((r, i) => (
                <div key={i}>
                  <p className="tnum" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>
                    {r.totalDurationMin} min · ₱{r.totalFare.toFixed(2)} · {r.transfers} transfer{r.transfers !== 1 ? 's' : ''}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 600, color: C.body }}>
                    {r.legs.filter(l => l.type === 'ride').map(l => (l as RideLeg).line.name).join(' → ') || 'Walk only'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.objective}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ride-hailing options */}
        {rideOptions.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <Micro>Ride options</Micro>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {rideOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink }}>{opt.provider}</p>
                    <p className="tnum" style={{ margin: '2px 0 0', fontSize: 14, color: C.body }}>
                      ~₱{opt.fareMin}–₱{opt.fareMax} · {opt.etaMin}–{opt.etaMax} min
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{opt.disclaimer}</p>
                  </div>
                  <a
                    href={opt.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '9px 18px', border: `1.5px solid ${C.ink}`, color: C.ink, fontSize: 13, fontWeight: 700, borderRadius: 2, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Book
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Sticky action bar */}
      {status === 'active' && (
        <div style={{ position: 'sticky', bottom: 0, padding: '14px 24px calc(14px + env(safe-area-inset-bottom))', background: C.bg, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <button
            style={{
              flex: 1, padding: '15px', borderRadius: 999, fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', border: 'none',
              cursor: position ? 'pointer' : 'default',
              background: position ? C.ink : C.cardEl,
              color: position ? C.bg : C.muted,
            }}
            disabled={!position}
            title={position ? undefined : 'Needs your location to reroute from where you are'}
            onClick={() => trip.triggerReroute()}
          >
            I&apos;m stuck / line down
          </button>
          {wazeUrl && (
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
              style={{ padding: '15px 22px', borderRadius: 999, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${C.accent}`, color: C.accent, textDecoration: 'none' }}>
              Waze
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page wrapper with provider ────────────────────────────────────────────────

export default function TripPage() {
  return (
    <TripProvider>
      <TripScreen />
    </TripProvider>
  );
}
