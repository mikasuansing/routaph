'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TripProvider, useTripContext } from '@/lib/trip/context';
import type { Itinerary, RideLeg, WalkLeg } from '@/lib/routing/types';
import { TRIP_PROGRESS_KEY, TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { bearingDelta, distToNextStop, etaToNextStop } from '@/lib/trip/geo';
import { ReportIssueButton } from '@/app/components/ReportIssueSheet';
import { notificationPermission, requestNotificationPermission } from '@/lib/trip/notify';
import { nearestStationEntrance } from '@/lib/routing/stationEntrances';
import { t, loadLang, type Lang } from '@/lib/i18n';
import { useTheme } from '@/app/providers';
import { Check, Circle, AlertTriangle, LocateFixed } from 'lucide-react';
import { ModeIcon } from '@/app/components/TransitIcons';

// Voyager (light) / Dark Matter (dark). Only used by the flat fallback map.
const TILE_URL = (isDark: boolean) => isDark
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

/** Keyless OpenMapTiles vector tiles (ODbL) - see ADR 0004. */
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** Camera while navigating: tilted forward and zoomed to street level. */
const NAV_PITCH = 60;
// Walking-navigation zoom (Google Maps/Waze pedestrian mode sits around
// 18-19, not the ~16.5 driving-nav zoom this used before) - tight enough to
// actually read which side of the street you're on.
const NAV_ZOOM = 18;
/** Street-level zoom for the flat Leaflet fallback (no tilt, so no NAV_PITCH). */
const NAV_ZOOM_FLAT = 18.5;

/** MapLibre needs WebGL; without it the trip map falls back to flat Leaflet. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

/*
 * Trip Companion - live tracking screen.
 * Monochrome minimal: typography carries the hierarchy; the single accent
 * (transit green) marks the live GPS state and arrival confirmation.
 */

const C = {
  bg: 'var(--color-bg)',
  card: 'var(--color-card)',
  cardEl: 'var(--color-card-el)',
  border: 'var(--color-border)',
  muted: 'var(--color-muted)',
  body: 'var(--color-body)',
  ink: 'var(--color-ink)',
  accent: 'var(--color-accent)',
  onPrimary: 'var(--color-on-primary)',
};

const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
body{font-family:var(--font-sans);}
button:active{opacity:0.85;}
.tnum{font-variant-numeric:tabular-nums;}
/* @keyframes pulse now lives in app/globals.css (shared with app/loading.tsx) */
`;

const DISPLAY = 'var(--font-display)';
// Reserved for the fare, the ETA, and the "arrived" moment only - see
// the --font-numeral comment in globals.css.
const NUMERAL = 'var(--font-numeral)';

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
 * without decoding it: what to get on, where to get off, and - once the
 * step is done - what the next one is.
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
    : r.line.mode === 'bus' ? 'take_the_bus'
    : 'take_the_train';
  return t(lang, key, { line: r.line.name });
}

/** Where this leg ends - the place completing it puts you. */
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
  // True once the WebGL navigation map is live; false on the flat fallback.
  const [navMap, setNavMap] = useState(false);
  // Camera locked to the rider. Dragging the map releases it, the way a
  // navigation app stops fighting you the moment you pan.
  const [following, setFollowing] = useState(true);

  // Ticks while a trip is active so the "last known position" staleness
  // check below re-evaluates even when no new GPS fix is coming in
  // (exactly the MRT-tunnel case: GPS goes quiet but the clock doesn't).
  useEffect(() => {
    if (trip.status !== 'active') return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [trip.status]);

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tileRef = useRef<unknown>(null);
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
      }).catch(() => { /* unsupported - stay unknown */ });
    } catch { /* unsupported */ }
    return () => { active = false; if (status) status.onchange = null; };
  }, []);

  // On mount: restore itinerary from sessionStorage. If leg progress was
  // also saved (a prior tab session got this far before reload/eviction -
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

  // Navigation is a side effect - never call router.replace during render
  useEffect(() => {
    if (trip.status === 'ended') router.replace('/planner');
  }, [trip.status, router]);

  // Keep the screen awake during an active trip - mobile browsers pause the
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
      } catch { /* low battery or unsupported - non-fatal */ }
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

  /**
   * Flat raster map, used when WebGL is missing or the vector style can't
   * load. No tilt or rotation, but a working map beats a blank canvas.
   */
  const buildLeafletTripMap = useCallback(() => {
    if (!mapElRef.current || mapRef.current || !trip.itinerary) return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    import('leaflet').then(mod => {
      if (!mapElRef.current || mapRef.current || !trip.itinerary) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (mod.default ?? mod) as any;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const walkLine = isDark ? '#A5988A' : '#8D8672';

      const map = L.map(mapElRef.current, { zoomControl: false, attributionControl: false });
      tileRef.current = L.tileLayer(TILE_URL(isDark), { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

      const all: [number, number][] = [];
      for (const leg of trip.itinerary.legs) {
        if (leg.type === 'walk') {
          const a: [number, number] = [leg.fromLat, leg.fromLng];
          const b: [number, number] = [leg.toLat, leg.toLng];
          L.polyline([a, b], { color: walkLine, weight: 2, dashArray: '4,7', opacity: 0.8 }).addTo(map);
          all.push(a, b);
        } else {
          const coords = (leg as RideLeg).stops.map(s => [s.lat, s.lng] as [number, number]);
          L.polyline(coords, { color: leg.line.color || '#2947DE', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
          all.push(...coords);
        }
      }
      mapRef.current = map;
      setNavMap(false);

      // Panning away hands control back to the rider, same as the nav map -
      // otherwise the next GPS fix would snap the camera back mid-drag.
      map.on('dragstart', () => setFollowing(false));

      // The container often has no measured size on first paint, so an
      // immediate fit anchors to a 0x0 viewport; recompute, then refit.
      const fit = () => {
        map.invalidateSize(false);
        if (all.length >= 2) map.fitBounds(L.latLngBounds(all), { padding: [28, 28], maxZoom: 16 });
      };
      fit();
      requestAnimationFrame(fit);
      setTimeout(fit, 250);
    });
  }, [trip.itinerary]);

  // Keep the FALLBACK basemap in step with the theme toggle. The navigation
  // map uses one vector style for both themes, so this only applies to the
  // raster map - but leaving it out stranded a dark basemap under a cream
  // page, which is what the toggle looked broken as before.
  useEffect(() => {
    if (!tileRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tileRef.current as any).setUrl(TILE_URL(theme === 'dark'));
  }, [theme]);

  /*
   * Navigation map - MapLibre, so the camera can tilt and turn.
   *
   * A trip screen is a navigation view: the useful question is "what is in
   * front of me", which a flat north-up map answers badly. Leaflet cannot
   * pitch or rotate at all, so this is the surface that resolves ADR 0004
   * toward MapLibre.
   *
   * The whole route is drawn as GeoJSON - ride legs solid in the line's own
   * colour, walk legs dashed - and the camera then locks onto the rider.
   */
  useEffect(() => {
    if ((trip.status !== 'active' && trip.status !== 'rerouting') || !trip.itinerary) return;
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;

    const legs = trip.itinerary.legs;
    const rideFeatures = legs
      .filter((l): l is RideLeg => l.type === 'ride')
      .map(l => ({
        type: 'Feature' as const,
        properties: { color: l.line.color || '#2947DE' },
        geometry: { type: 'LineString' as const, coordinates: l.stops.map(s => [s.lng, s.lat]) },
      }))
      .filter(f => f.geometry.coordinates.length >= 2);

    const walkFeatures = legs
      .filter((l): l is WalkLeg => l.type === 'walk')
      .map(l => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: [[l.fromLng, l.fromLat], [l.toLng, l.toLat]] },
      }));

    const allCoords = [
      ...rideFeatures.flatMap(f => f.geometry.coordinates),
      ...walkFeatures.flatMap(f => f.geometry.coordinates),
    ];
    if (allCoords.length === 0) return;

    if (!hasWebGL()) { buildLeafletTripMap(); return; }

    import('maplibre-gl').then(maplibregl => {
      if (cancelled || !mapElRef.current || mapRef.current) return;

      const lats = allCoords.map(c => c[1]);
      const lngs = allCoords.map(c => c[0]);
      const map = new maplibregl.Map({
        container: mapElRef.current,
        style: VECTOR_STYLE,
        center: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2],
        zoom: 12,
        pitch: NAV_PITCH,
        attributionControl: false,
      });

      let settled = false;
      const giveUp = () => {
        if (settled || cancelled) return;
        settled = true;
        map.remove();
        mapRef.current = null;
        setNavMap(false);
        buildLeafletTripMap();
      };
      const styleTimer = setTimeout(giveUp, 6000);

      map.on('error', () => { if (!settled && !map.isStyleLoaded()) { clearTimeout(styleTimer); giveUp(); } });

      map.on('load', () => {
        if (cancelled) return;
        settled = true;
        clearTimeout(styleTimer);
        setNavMap(true);

        map.addSource('trip-ride', { type: 'geojson', data: { type: 'FeatureCollection', features: rideFeatures } });
        map.addSource('trip-walk', { type: 'geojson', data: { type: 'FeatureCollection', features: walkFeatures } });

        // A casing under the route reads as a road at a tilt, the way a
        // navigation app's line does, rather than a flat drawn stroke.
        map.addLayer({
          id: 'trip-ride-casing', type: 'line', source: 'trip-ride',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#00000055', 'line-width': 12 },
        });
        map.addLayer({
          id: 'trip-ride-line', type: 'line', source: 'trip-ride',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 7 },
        });
        map.addLayer({
          id: 'trip-walk-line', type: 'line', source: 'trip-walk',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#8D8672', 'line-width': 4, 'line-dasharray': [1.5, 1.5] },
        });

        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: { top: 90, bottom: 380, left: 40, right: 40 }, duration: 0, maxZoom: 15 },
        );
      });

      // Panning away hands control back to the rider, the way a navigation
      // app stops fighting you the moment you drag the map.
      map.on('dragstart', () => setFollowing(false));

      mapRef.current = map;
    }).catch(buildLeafletTripMap);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.status, trip.itinerary]);

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

  /*
   * The rider's own marker, and the camera that follows it.
   *
   * On the navigation map this is the Waze behaviour: an arrow that points
   * where you're going, with the camera locked behind it and the whole map
   * turned so your direction of travel is up. Rotation is the part that
   * makes a tilted map legible - without it you're reading a 3D scene
   * facing an arbitrary way.
   */
  useEffect(() => {
    const map = mapRef.current;
    const pos = trip.position;
    if (!map || !pos) return;

    if (navMap) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = map as any;
      const here: [number, number] = [pos.lng, pos.lat];

      if (!posMarker.current) {
        const el = document.createElement('div');
        el.className = 'parapo-nav-arrow';
        el.innerHTML =
          '<svg width="34" height="34" viewBox="0 0 34 34">' +
          '<circle cx="17" cy="17" r="15" fill="rgba(41,71,222,0.18)"/>' +
          '<path d="M17 5 L26 27 L17 21 L8 27 Z" fill="#2947DE" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
          '</svg>';
        import('maplibre-gl').then(maplibregl => {
          if (!mapRef.current) return;
          posMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
            .setLngLat(here)
            .addTo(m);
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mk = posMarker.current as any;
        mk.setLngLat(here);
        // The arrow points along the heading; the camera cancels it out, so
        // on screen the arrow stays upright and the world turns instead.
        if (pos.headingDeg !== undefined) mk.setRotation(pos.headingDeg);
      }

      if (following) {
        // Only turn the camera when there's a heading worth trusting -
        // otherwise a stationary phone would spin the map on the platform.
        const bearing = pos.headingDeg;
        const turn = bearing !== undefined && Math.abs(bearingDelta(m.getBearing(), bearing)) > 3;
        m.easeTo({
          center: here,
          bearing: turn ? bearing : m.getBearing(),
          pitch: NAV_PITCH,
          zoom: Math.max(m.getZoom(), NAV_ZOOM),
          duration: 900,
          // Sit the rider low on screen so most of the map shows what's
          // ahead rather than what's already behind - the standard
          // navigation framing.
          padding: { top: 0, bottom: Math.round(window.innerHeight * 0.28), left: 0, right: 0 },
        });
      }
      return;
    }

    // Flat fallback map. Leaflet itself never tilts or rotates, but the
    // rider can still get a Waze-style directional arrow: a divIcon whose
    // inner element is rotated by CSS transform to the current heading, the
    // same technique Google/Waze use under a 2D camera.
    import('leaflet').then(mod => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (mod.default ?? mod) as any;
      if (!mapRef.current || !trip.position) return;
      const here: [number, number] = [trip.position.lat, trip.position.lng];
      const heading = trip.position.headingDeg ?? 0;

      if (!posMarker.current) {
        const icon = L.divIcon({
          className: 'parapo-leaflet-arrow',
          html:
            '<div style="width:34px;height:34px;transform:rotate(' + heading + 'deg);transition:transform .3s ease;">' +
            '<svg width="34" height="34" viewBox="0 0 34 34">' +
            '<circle cx="17" cy="17" r="15" fill="rgba(41,71,222,0.18)"/>' +
            '<path d="M17 5 L26 27 L17 21 L8 27 Z" fill="#2947DE" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
            '</svg></div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        posMarker.current = L.marker(here, { icon }).addTo(mapRef.current);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const marker = posMarker.current as any;
        marker.setLatLng(here);
        // Rotate the existing DOM node directly rather than recreating the
        // icon on every fix - swapping divIcons re-adds the element and
        // makes the arrow flicker on each GPS update.
        const el = marker.getElement()?.firstChild as HTMLElement | undefined;
        if (el) el.style.transform = `rotate(${heading}deg)`;
      }

      if (following) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = mapRef.current as any;
        // setView (not panTo) so the camera also zooms in to street level -
        // fitBounds on mount framed the WHOLE route, which is city-wide zoomed
        // out. Math.max keeps a rider-chosen closer zoom from being undone.
        m.setView(here, Math.max(m.getZoom(), NAV_ZOOM_FLAT), { animate: true });
      }
    });
  }, [trip.position, navMap, following]);

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
        <Micro color={C.accent}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={11} strokeWidth={2.5} color="currentColor" /> Trip complete
          </span>
        </Micro>
        <h1 style={{ margin: '14px 0 0', fontFamily: NUMERAL, fontSize: 'var(--text-5xl)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
          You&apos;ve arrived.
        </h1>
        {trip.itinerary && (
          <p className="tnum" style={{ margin: '16px 0 0', fontSize: 16, color: C.body }}>
            ₱{trip.itinerary.totalFare.toFixed(2)} total fare · {trip.itinerary.transfers} transfer{trip.itinerary.transfers !== 1 ? 's' : ''}
          </p>
        )}
        <button
          style={{ marginTop: 36, padding: '17px', background: 'var(--gradient-primary)', color: C.onPrimary, border: 'none', borderRadius: 'var(--radius-pill)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', boxShadow: 'var(--shadow-accent)' }}
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
  const nextLeg = itinerary.legs[currentLegIndex + 1];
  const isLastLeg = currentLegIndex >= itinerary.legs.length - 1;

  // A GPS fix that's gone quiet for a while (MRT tunnel, no signal) still
  // shows the LAST KNOWN position/ETA below rather than blanking - but
  // labeled as last-known so it's not mistaken for a live reading.
  const SIGNAL_STALE_MS = 20_000;
  const signalStale = position !== null && nowTick - position.timestamp > SIGNAL_STALE_MS;

  const finalEntrance = isLastLeg && currentLeg?.type === 'walk'
    ? nearestStationEntrance(currentLeg.fromName, currentLeg.toLat, currentLeg.toLng)
    : null;

  const distKm = position ? distToNextStop(position, itinerary, currentLegIndex) : null;
  // Jeepneys have no fixed schedule - show distance only, never a minute ETA.
  const currentIsJeepney = currentLeg?.type === 'ride' && (currentLeg as RideLeg).line.mode === 'jeepney';
  const eta = position && !currentIsJeepney ? etaToNextStop(position, itinerary, currentLegIndex, position.speedMps) : null;

  /*
   * Overall trip progress - distance-weighted across every leg, not just
   * "step 2 of 4". A 200 m walk and a 12 km train ride shouldn't count the
   * same toward "how far along am I", so this sums real distances rather
   * than leg counts. Within the CURRENT leg, progress comes from the live
   * GPS-to-arrival distance already computed above (distKm); every leg
   * before it counts as fully done, every leg after as not started - no
   * wall-clock "departed at" time is invented, since for a jeepney leg
   * especially that would be a precision this app doesn't actually have.
   */
  const totalTripKm = itinerary.legs.reduce((sum, l) => sum + l.distKm, 0);
  // A running total per leg boundary, built with reduce (not a mutated
  // outer variable) so it stays pure to render with - i is the position of
  // the boundary AFTER leg i.
  const legCumKm = itinerary.legs.reduce<number[]>((acc, leg) => {
    acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + leg.distKm);
    return acc;
  }, []);
  const kmBeforeCurrentLeg = currentLegIndex > 0 ? legCumKm[currentLegIndex - 1] : 0;
  const currentLegDoneKm = distKm !== null
    ? Math.max(0, Math.min(currentLeg.distKm, currentLeg.distKm - distKm))
    : 0;
  const overallProgress = totalTripKm > 0
    ? Math.min(1, (kmBeforeCurrentLeg + currentLegDoneKm) / totalTripKm)
    : 0;
  const remainingMin = itinerary.legs.slice(currentLegIndex + 1).reduce((sum, l) => sum + l.durationMin, 0)
    + (eta ?? (currentLeg?.durationMin ?? 0));
  // nowTick (not Date.now() inline) - it's the same "tick every 5s while a
  // trip is active" state already used above for signal-staleness, kept
  // pure to render the same way.
  const arriveClock = new Date(nowTick + remainingMin * 60_000)
    .toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  const wazeUrl = originalDest
    ? `https://waze.com/ul?ll=${originalDest.lat},${originalDest.lng}&navigate=yes&utm_source=parapo`
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.ink, fontFamily: 'Inter,system-ui,sans-serif', overflow: 'hidden' }}>
      <style>{GLOBAL}</style>

      {/* Full-bleed map, same shell as the planner. A trip is a navigation
          task, so the map should be the screen rather than a panel at the
          top of a scrolling document - everything else floats over it.
          `zIndex: 0` contains Leaflet's internal panes (they run 400-800)
          so they can't paint over the controls. */}
      <div ref={mapElRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* Floating status pill + End trip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: 'calc(14px + env(safe-area-inset-top)) 16px 0',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          flex: 1, minWidth: 0, background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 22, padding: '10px 16px', boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
            RoutaPH<span style={{ color: C.ink }}>.</span>
          </span>
          {/* `gpsDenied` is set only on PERMISSION_DENIED - a genuinely
              unavailable fix or a timeout keeps the watcher alive and stays
              on "Finding your location". So this state is "blocked", and
              calling it "unavailable" sent people looking for a signal
              problem instead of a permission they can grant. */}
          <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: position ? C.accent : C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
            {position
              ? <><Circle size={11} strokeWidth={2.5} color="currentColor" fill="currentColor" /> Live location</>
              : gpsDenied
                ? <><Circle size={11} strokeWidth={2.5} color="currentColor" /> Location blocked</>
                : <span style={{ display: 'flex', alignItems: 'center', gap: 4, animation: 'pulse 1.6s ease-in-out infinite' }}><Circle size={11} strokeWidth={2.5} color="currentColor" /> Finding you</span>}
          </p>
        </div>
        <button
          style={{
            flexShrink: 0, background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 'var(--radius-pill)', padding: '11px 16px', fontSize: 13, fontWeight: 700,
            color: C.body, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: 'var(--shadow-sm)',
          }}
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          End trip
        </button>
      </div>

      {/* Active disruption - floats under the pill so it can't be missed */}
      {activeDisruption && status !== 'rerouting' && (
        <div style={{
          position: 'absolute', top: 'calc(76px + env(safe-area-inset-top))', left: 16, right: 16, zIndex: 10,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-md)',
          padding: '12px 14px', boxShadow: 'var(--shadow-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={13} strokeWidth={2} color="currentColor" /> {activeDisruption.description}
          </p>
          <button
            style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 800, color: C.accent, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            onClick={() => trip.triggerReroute()}
          >
            Reroute
          </button>
        </div>
      )}

      {/* The instruction, on the map - a navigation app's turn banner.
          For a passenger the equivalent of "turn right in 300 m" is where
          to get off and how far away it is; that is the one thing worth
          reading at a glance, so it sits over the map rather than in the
          sheet. The sheet keeps the action button and the full checklist. */}
      {currentLeg && status === 'active' && (
        <div style={{
          position: 'absolute',
          top: activeDisruption ? 'calc(140px + env(safe-area-inset-top))' : 'calc(76px + env(safe-area-inset-top))',
          left: 16, right: 16, zIndex: 12,
          background: C.accent, borderRadius: 'var(--radius-lg)', padding: '14px 16px',
          boxShadow: 'var(--shadow-accent)',
          display: 'flex', alignItems: 'center', gap: 13,
        }}>
          <span
            role="img"
            aria-label={modeTag(currentLeg)}
            style={{
              flexShrink: 0, width: 42, height: 42, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.onPrimary,
            }}
          >
            <ModeIcon mode={currentLeg.type === 'walk' ? 'walk' : (currentLeg as RideLeg).line.mode} size={24} color={C.onPrimary} bg={C.accent} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0, fontFamily: DISPLAY, fontSize: 19, fontWeight: 800,
              letterSpacing: '-0.01em', color: C.onPrimary, lineHeight: 1.25,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentLeg.type === 'ride'
                ? t(lang, 'get_off_at', { stop: (currentLeg as RideLeg).to.name })
                : legAction(currentLeg, lang)}
            </p>
            <p className="tnum" style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
              {distKm !== null
                ? `${distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`}${eta !== null ? ` · ~${eta} min` : ''}`
                : currentLeg.type === 'ride'
                  ? t(lang, 'ride_stops', { count: String((currentLeg as RideLeg).stops.length) })
                  : `${Math.round((currentLeg as WalkLeg).distKm * 1000)} m`}
              {' · '}{t(lang, 'step_of', { n: String(currentLegIndex + 1), total: String(itinerary.legs.length) })}
            </p>
          </div>
        </div>
      )}

      {/* Recenter - appears only after panning away, like a navigation app.
          Sits just above the sheet so a thumb can reach it. */}
      {status === 'active' && !following && (
        <button
          onClick={() => setFollowing(true)}
          style={{
            position: 'absolute', bottom: 'calc(58% + 14px)', right: 16, zIndex: 15,
            display: 'flex', alignItems: 'center', gap: 7,
            background: C.accent, border: 'none', borderRadius: 'var(--radius-pill)',
            padding: '11px 18px', fontSize: 13, fontWeight: 700,
            color: C.onPrimary, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: 'var(--shadow-accent)',
          }}
        >
          <LocateFixed size={13} strokeWidth={2.5} color={C.onPrimary} /> Recenter
        </button>
      )}

      {/* Everything else lives in a sheet over the map. It starts tall
          enough to show the current step and its Done button without a
          scroll, and the rest is reachable by scrolling inside it. */}
      <div style={{
        // Anchored top-and-bottom rather than given a `vh` height. On
        // mobile `vh` is locked to the viewport with the browser toolbar
        // HIDDEN, so while the toolbar is showing a vh-sized sheet hangs
        // below the screen - taking the action bar pinned to its bottom
        // with it, and shifting as the toolbar hides and reappears on
        // scroll. The parent is `fixed; inset: 0`, so a percentage here
        // resolves against the viewport that is actually visible.
        position: 'absolute', left: 0, right: 0, top: '42%', bottom: 0, zIndex: 20,
        background: C.bg,
        borderTop: `1px solid ${C.border}`, borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        // No paddingBottom here. The action bar below is the element that
        // actually touches the bottom edge while a trip is active, and it
        // already carries the safe-area inset on its own padding - adding
        // it here too stacked both, leaving dead space under the buttons on
        // any iPhone with a home indicator.
      }}>
        <div style={{ width: 32, height: 4, borderRadius: 2, background: C.border, margin: '10px auto 0', flexShrink: 0 }} />

      <main style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '14px 24px calc(24px + env(safe-area-inset-bottom))' }}>
        {/* GPS state - explain, and offer a way in, instead of failing silently */}
        {!position && (gpsDenied || geoPerm === 'denied') && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', padding: 16 }}>
            <Micro>Location access is blocked</Micro>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: C.body, lineHeight: 1.7 }}>
              Your browser is blocking location for this site, so the map can&apos;t follow
              you and steps won&apos;t advance on their own. To turn it on: tap the
              <strong style={{ color: C.ink }}> padlock icon</strong> next to the address →
              <strong style={{ color: C.ink }}> Site settings</strong> →
              <strong style={{ color: C.ink }}> Location</strong> → Allow, then reload.
              You can still follow the trip - just tap
              <strong style={{ color: C.ink }}> Done</strong> at the end of each step.
            </p>
          </div>
        )}
        {!position && !gpsDenied && geoPerm !== 'denied' && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.body, animation: 'pulse 1.6s ease-in-out infinite' }}>
              Finding your location…
            </p>
            <button
              onClick={() => {
                try {
                  navigator.geolocation?.getCurrentPosition(() => { /* watcher picks it up */ }, () => { /* denied → banner above takes over */ });
                } catch { /* unsupported */ }
              }}
              style={{ padding: '9px 16px', borderRadius: 'var(--radius-pill)', border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              Enable GPS
            </button>
          </div>
        )}

        {notifPerm === 'default' && status === 'active' && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.body }}>
              Get an alert + buzz when your stop is close.
            </p>
            <button
              onClick={() => { requestNotificationPermission().then(setNotifPerm); }}
              style={{ padding: '9px 16px', borderRadius: 'var(--radius-pill)', border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Enable stop alerts
            </button>
          </div>
        )}

        {/* Crowdsourced live map opt-in. Deliberately phrased as a give,
            not a get: it does nothing for this rider's own trip, so the
            copy has to be honest that it's for everyone else. */}
        {status === 'active' && position && (
          <div style={{ marginBottom: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', padding: 16 }}>
            <Micro color={sharingPosition ? C.accent : undefined}>
              {sharingPosition ? 'Helping the live map' : 'Help the live map'}
            </Micro>
            <p style={{ margin: '8px 0 14px', fontSize: 13, color: C.body, lineHeight: 1.7 }}>
              {sharingPosition
                ? 'Anonymous, and expires in 3 minutes.'
                : 'Share your position anonymously so others can see this vehicle.'}
            </p>
            {/* Full-width below the copy rather than beside it - at 375 px a
                side-by-side button starves the explanation into a column
                barely six words wide, and this is text people should read
                before opting in. */}
            <button
              onClick={() => setSharingPosition(!sharingPosition)}
              aria-pressed={sharingPosition}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 'var(--radius-pill)',
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

        {/* Current leg - the glance */}
        {currentLeg && (
          <section style={{ marginBottom: 28, background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', padding: 18 }}>
            {/* Which vehicle you're on. Where to get off, how far and which
                step lives in the banner over the map - repeating it here
                just made the rider read the same sentence twice. */}
            <p style={{ margin: 0, fontFamily: DISPLAY, fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              {legAction(currentLeg, lang)}
            </p>
            {currentLeg.type === 'walk' && (
              <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.muted }}>
                {t(lang, 'about_min', { n: String(Math.max(1, Math.round((currentLeg as WalkLeg).durationMin))) })}
              </p>
            )}
            {signalStale && (
              <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: C.muted }}>
                Signal lost - showing last known position ({Math.round((nowTick - position!.timestamp) / 1000)}s ago)
              </p>
            )}
            {isLastLeg && currentLeg.type === 'walk' && finalEntrance && (
              <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: C.accent }}>
                Exit via the {finalEntrance.label} - closer to your destination
              </p>
            )}
            {status === 'active' && (
              <button
                style={{
                  marginTop: 18, width: '100%', padding: '16px', borderRadius: 'var(--radius-pill)',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'var(--gradient-primary)',
                  color: C.onPrimary,
                  border: 'none', letterSpacing: '0.01em',
                  boxShadow: 'var(--shadow-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                onClick={() => {
                  // Guard accidental taps: without any GPS fix the app can't
                  // tell where you are, so completing a leg needs intent.
                  if (!position && !window.confirm(
                    isLastLeg
                      ? 'No GPS fix - mark the whole trip as done anyway?'
                      : 'No GPS fix - mark this leg as done anyway?'
                  )) return;
                  trip.advanceLeg();
                }}
              >
                <Check size={15} strokeWidth={2} color="currentColor" /> {legDoneLabel(currentLeg, isLastLeg, lang)}
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

        {/* Overall trip progress - one bar across every leg, distance-
            weighted, with a tick at each leg boundary so a transfer point
            is visible on the same track rather than only in the list
            below. Answers "how far along am I on the WHOLE trip", which
            the per-leg distance/ETA above the map doesn't. */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Micro>{t(lang, 'trip_progress')}</Micro>
            <span className="tnum" style={{ fontSize: 12, color: C.muted }}>
              {Math.round(overallProgress * 100)}% &middot; arrive ~{arriveClock}
            </span>
          </div>
          <div style={{ position: 'relative', marginTop: 10, height: 6 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 3, background: C.cardEl,
            }} />
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: `${overallProgress * 100}%`, borderRadius: 3,
              background: C.accent, transition: 'width 0.6s ease',
            }} />
            {/* One tick per leg boundary (not the very start), positioned
                by cumulative distance (legCumKm, computed above) so an
                11 km train leg and a 200 m walk get proportionally correct
                space on the track. */}
            {(() => {
              return legCumKm.slice(0, -1).map((cumKm, i) => {
                const atPct = totalTripKm > 0 ? (cumKm / totalTripKm) * 100 : 0;
                const done = i < currentLegIndex;
                return (
                  <span key={i} style={{
                    position: 'absolute', top: '50%', left: `${atPct}%`,
                    width: 10, height: 10, borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: done ? C.accent : C.card,
                    border: `2px solid ${done ? C.accent : C.border}`,
                  }} />
                );
              });
            })()}
          </div>
        </section>

        {/* All steps - a numbered checklist, so progress through a
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
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
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
                    {done ? <Check size={12} strokeWidth={2.5} color="currentColor" /> : i + 1}
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

      {/* Action bar, pinned to the bottom of the sheet */}
      {status === 'active' && (
        <div style={{ flexShrink: 0, padding: '12px 24px calc(12px + env(safe-area-inset-bottom))', background: C.bg, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <button
            style={{
              flex: 1, padding: '15px', borderRadius: 'var(--radius-pill)', fontSize: 14, fontWeight: 700,
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
              style={{ padding: '15px 22px', borderRadius: 'var(--radius-pill)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${C.accent}`, color: C.accent, textDecoration: 'none' }}>
              Waze
            </a>
          )}
        </div>
      )}
      </div>
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
