'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { checkLastTrain, formatClockTime, type LastTrainCheck } from '@/lib/routing/lastTrain';
import { beepAdjustedFare, beepAdjustedTotalFare } from '@/lib/routing/beepFare';
import { suggestJeepneyCorridor } from '@/lib/routing/jeepneySuggest';
import { nearestStationEntrance } from '@/lib/routing/stationEntrances';
import { ReportIssueButton } from '@/app/components/ReportIssueSheet';
import { t, loadLang, LANG_STORAGE_KEY, type Lang } from '@/lib/i18n';

const BEEP_STORAGE_KEY = 'parapo:has_beep';

/*
 * Planner — the primary commuter dashboard.
 * Monochrome minimal: typography scale is the hierarchy; whitespace groups
 * information; the single accent (transit green) marks live/positive states
 * (location fix, normal service, GO actions) and nothing decorative.
 */

const C = {
  bg:     'var(--color-bg)',
  surface:'var(--color-surface)',
  card:   'var(--color-card)',
  cardEl: 'var(--color-card-el)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
  error:  'var(--color-error)',
  onPrimary: 'var(--color-on-primary)',
};

const DISPLAY = 'var(--font-display)';

/* Grayscale ramp for route segments — line identity is carried by TEXT */
const MODE_META: Record<string, { label: string; shade: string }> = {
  mrt:     { label: 'MRT',  shade: 'var(--color-ink)' },
  lrt:     { label: 'LRT',  shade: 'var(--color-body)' },
  bus:     { label: 'BUS',  shade: 'var(--color-muted)' },
  jeepney: { label: 'JEEP', shade: 'var(--color-border)' },
  walk:    { label: 'WALK', shade: 'var(--color-card-el)' },
};

const FARE_REF: [string, string][] = [
  ['MRT-3',   '₱6 min · ₱0.48/km ½-price'],
  ['LRT-2',   '₱8 min · ₱0.46/km ½-price'],
  ['LRT-1',   '₱16.25 min · ₱1.47/km'],
  ['Bus',     '₱18 first 5 km · ₱2.98/km'],
  ['Jeepney', '₱14 first 4 km · ₱2.00/km'],
];

// Stop catalog comes from /api/v1/catalog/stops so pick lists always match
// the routable network (F4). Never hardcode stops here.
type CatalogStop = { id: number; name: string; lat: number; lng: number };

type WalkLeg = { type: 'walk'; fromName: string; toName: string; fromLat: number; fromLng: number; toLat: number; toLng: number; distKm: number; durationMin: number };
type RideLeg = { type: 'ride'; mode: string; line: { id: number; name: string; color: string }; from: { id: number; name: string; lat: number; lng: number }; to: { id: number; name: string; lat: number; lng: number }; stops: { id: number; name: string; lat: number; lng: number }[]; distKm: number; durationMin: number; fare: number; fareRule?: { baseFare: number; perKmRate: number; flagDistanceKm: number } };
type Leg = WalkLeg | RideLeg;
type Itinerary = { legs: Leg[]; totalDurationMin: number; totalFare: number; transfers: number; objective: string };
type Disruption = { id: number; corridorId: number; description: string };
type StationAccessibility = { stopId: number; feature: 'elevator' | 'escalator'; status: 'unknown' | 'operational' | 'out_of_service'; note: string | null };
type RainAdvisory = { heavyRainExpected: boolean; message: string };
type Screen = 'home' | 'loading' | 'results' | 'detail';
type ModeFilter = 'all' | 'train' | 'bus' | 'jeepney';
type ModeGroup = 'train' | 'bus' | 'jeepney';

const MODE_GROUPS: { key: ModeGroup; label: string; engineModes: string[] }[] = [
  { key: 'train',   label: 'Train',   engineModes: ['mrt', 'lrt'] },
  { key: 'bus',     label: 'Bus',     engineModes: ['bus'] },
  { key: 'jeepney', label: 'Jeepney', engineModes: ['jeepney'] },
];

const MY_LOCATION = 'My location';
const OBJ_LABEL: Record<string, string> = {
  fastest: 'Fastest', fewest_transfers: 'Fewest transfers', cheapest: 'Cheapest',
};

function rideLegs(itin: Itinerary): RideLeg[] {
  return itin.legs.filter(l => l.type === 'ride') as RideLeg[];
}
function matchesFilter(itin: Itinerary, f: ModeFilter): boolean {
  if (f === 'all') return true;
  const modes = rideLegs(itin).map(l => l.mode);
  if (f === 'train') return modes.some(m => m === 'mrt' || m === 'lrt');
  return modes.some(m => m === f);
}

/* "arrive 7:42 PM" — the split-second number a commuter actually needs */
function arriveAt(durationMin: number): string {
  return new Date(Date.now() + durationMin * 60_000)
    .toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/* Worst-first: a "closed" line always outranks a "final call" for display */
function worstLastTrainCheck(checks: LastTrainCheck[]): LastTrainCheck | null {
  if (checks.length === 0) return null;
  return checks.find(c => c.status === 'closed') ?? checks[0];
}

/* Transport combination, e.g. "MRT-3 → EDSA Carousel" */
function comboLabel(itin: Itinerary): string {
  const rides = rideLegs(itin);
  return rides.length ? rides.map(r => r.line.name).join(' → ') : 'Walk only';
}

/* Human-readable fare computation from the rule the engine actually applied */
function fareFormula(ride: RideLeg): string {
  const rule = ride.fareRule;
  if (!rule) return '';
  const flag = rule.flagDistanceKm;
  if (ride.distKm <= flag) {
    return flag > 0
      ? `₱${rule.baseFare} base (covers first ${flag} km)`
      : `₱${rule.baseFare} base`;
  }
  const chargedKm = flag > 0 ? ride.distKm - flag : ride.distKm;
  return `₱${rule.baseFare} base + ${chargedKm.toFixed(1)} km × ₱${rule.perKmRate.toFixed(2)}`;
}

/* ── Journey bar: grayscale segments proportional to leg duration ─────────── */
function JourneyBar({ itin }: { itin: Itinerary }) {
  const total = itin.legs.reduce((s, l) => s + l.durationMin, 0) || 1;
  return (
    <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', gap: 2 }}>
      {itin.legs.map((leg, i) => {
        const mode = leg.type === 'walk' ? 'walk' : (leg as RideLeg).mode;
        return <div key={i} style={{ flex: Math.max(leg.durationMin / total, 0.04), background: MODE_META[mode]?.shade ?? C.muted }} />;
      })}
    </div>
  );
}

/* ── Micro label ──────────────────────────────────────────────────────────── */
function Micro({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color ?? C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', ...style }}>
      {children}
    </p>
  );
}

/* ── Searchable stop input — underline, custom-rendered dropdown ──────────── */
/* Native <datalist> suggestion UI never renders on iOS Safari and is
 * inconsistent elsewhere, so matches are rendered as a real absolutely-
 * positioned list instead of relying on the browser's own popup. */
function StopRow({ label, value, onChange, placeholder, stops, extraOption }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  stops: string[]; extraOption?: string;
}) {
  const [text, setText] = useState(value);
  // Sync when the committed value changes externally (swap, saved-commute
  // prefill) — state-during-render, per React's derived-state guidance.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const options = extraOption ? [extraOption, ...stops] : stops;
  const matches = text === ''
    ? options
    : options.filter(s => s.toLowerCase().includes(text.toLowerCase()));

  function commit(v: string) {
    setText(v);
    onChange(v);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <Micro>{label}</Micro>
      <input
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          setHighlight(0);
          if (v === '') onChange('');
          else if (options.includes(v)) onChange(v); // committed on exact match
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Deferred so a click on a suggestion (onMouseDown) fires first.
          setTimeout(() => { if (!options.includes(text)) setText(value); }, 0);
          setOpen(false);
        }}
        onKeyDown={e => {
          if (!open || matches.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(matches[highlight]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          borderBottom: `2px solid ${C.border}`, borderRadius: 0,
          padding: '10px 0', fontSize: 19, color: C.ink,
          fontFamily: 'inherit', fontWeight: options.includes(text) ? 700 : 400,
          letterSpacing: '-0.02em',
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {matches.map((s, i) => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); commit(s); }}
              style={{
                padding: '10px 14px', fontSize: 15, cursor: 'pointer',
                color: C.ink, background: i === highlight ? C.cardEl : 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Bottom sheet — plain surface, hairline top, no shadow theatre ────────── */
function Sheet({ children, height, style }: { children: React.ReactNode; height: string | number; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
      height, background: C.surface,
      borderTop: `1px solid ${C.border}`,
      borderRadius: '28px 28px 0 0',
      boxShadow: '0 -8px 32px rgba(25,22,16,0.08)',
      display: 'flex', flexDirection: 'column',
      paddingBottom: 'env(safe-area-inset-bottom)',
      ...style,
    }}>
      <div style={{ width: 32, height: 4, borderRadius: 2, background: C.border, margin: '10px auto 0', flexShrink: 0 }} />
      {children}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */
export default function Planner() {
  const router = useRouter();
  const [screen, setScreen]       = useState<Screen>('home');
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [rush, setRush]           = useState(() => { const h = new Date().getHours(); return (h >= 7 && h <= 9) || (h >= 17 && h <= 19); });
  const [hasBeep, setHasBeep]     = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem(BEEP_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch { return true; }
  });
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [enabledModes, setEnabledModes] = useState<Record<ModeGroup, boolean>>({ train: true, bus: true, jeepney: true });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selected, setSelected]   = useState<Itinerary | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [stopCoords, setStopCoords] = useState<Record<string, [number, number]>>({});
  const [myLoc, setMyLoc]         = useState<[number, number] | null>(null);
  const [locBusy, setLocBusy]     = useState(false);
  const [disruptions, setDisruptions] = useState<Disruption[] | null>(null);
  const [accessibilityByStop, setAccessibilityByStop] = useState<Record<number, StationAccessibility[]>>({});
  const [rainAdvisory, setRainAdvisory] = useState<RainAdvisory | null>(null);
  const [authed, setAuthed]       = useState<boolean | null>(null);
  const [commuteSave, setCommuteSave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [addingStop, setAddingStop] = useState(false);
  const [nextStop, setNextStop] = useState('');
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(loadLang);
  function toggleLang() {
    setLang(prev => {
      const next: Lang = prev === 'en' ? 'tl' : 'en';
      try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* noop */ }
      return next;
    });
  }
  const stopNames = Object.keys(stopCoords).sort();

  /* ── Beep card preference — persisted locally, not tied to the account ──── */
  function toggleHasBeep() {
    setHasBeep(prev => {
      const next = !prev;
      try { localStorage.setItem(BEEP_STORAGE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }

  /* ── Login required: no session → back to /auth ───────────────────────── */
  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) { router.replace('/auth?next=/planner'); return; }
      setAuthed(true);
    });
    return () => { active = false; };
  }, [router]);

  /* ── Load the stop catalog (F4) so pick lists match the routable network ── */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/catalog/stops')
      .then(res => res.json())
      .then((json: { data?: CatalogStop[] }) => {
        if (!active || !json.data) return;
        const coords: Record<string, [number, number]> = {};
        for (const s of json.data) coords[s.name] = [s.lat, s.lng];
        setStopCoords(coords);
        // Prefill from a saved commute (/planner?from=…&to=…)
        try {
          const params = new URLSearchParams(window.location.search);
          const qFrom = params.get('from'), qTo = params.get('to');
          if (qFrom && coords[qFrom]) setFrom(qFrom);
          if (qTo && coords[qTo]) setTo(qTo);
        } catch { /* SSR guard */ }
      })
      .catch(() => { if (active) setError('Could not load the stop catalog — check your connection.'); });
    return () => { active = false; };
  }, []);

  /* ── Service status (F13 disruption feed) ─────────────────────────────── */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/disruptions')
      .then(res => res.json())
      .then((json: { data?: Disruption[] }) => { if (active) setDisruptions(json.data ?? []); })
      .catch(() => { if (active) setDisruptions(null); });
    return () => { active = false; };
  }, []);

  /* ── Rain/flood advisory (planner home nudge) ──────────────────────────── */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/weather/advisory')
      .then(res => res.json())
      .then((json: { data?: RainAdvisory }) => { if (active && json.data?.heavyRainExpected) setRainAdvisory(json.data); })
      .catch(() => { /* non-fatal — a missed nudge is not worth surfacing as an error */ });
    return () => { active = false; };
  }, []);

  /* ── Station accessibility (MRT-3 elevator/escalator) — manual, best-effort */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/station-accessibility')
      .then(res => res.json())
      .then((json: { data?: StationAccessibility[] }) => {
        if (!active) return;
        const map: Record<number, StationAccessibility[]> = {};
        for (const row of json.data ?? []) {
          (map[row.stopId] ??= []).push(row);
        }
        setAccessibilityByStop(map);
      })
      .catch(() => { /* non-fatal — absence of this data doesn't block planning */ });
    return () => { active = false; };
  }, []);

  /* ── "Use my location" — one-shot fix, never persisted ────────────────── */
  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device.'); return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocBusy(false);
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (lat < 14.3 || lat > 14.8 || lng < 120.9 || lng > 121.2) {
          setError('You appear to be outside Metro Manila — pick a stop instead.');
          return;
        }
        setMyLoc([lat, lng]);
        setFrom(MY_LOCATION);
        setError(null);
      },
      () => {
        setLocBusy(false);
        setError('Could not get your location — allow location access or pick a stop.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  const originCoords = (name: string): [number, number] | undefined =>
    name === MY_LOCATION ? myLoc ?? undefined : stopCoords[name];

  /* ── Leaflet map ──────────────────────────────────────────────────────── */
  const mapElRef    = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<unknown>(null);
  const routeGroup  = useRef<unknown>(null);

  useEffect(() => {
    if (authed !== true) return; // container renders only after the auth gate
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
      if (cancelled || !mapElRef.current) return;
      const L = mod.default ?? mod;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      // Warm basemaps — Voyager (light) / Dark Matter (dark)
      const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (L as any).map(mapElRef.current, {
        center: [14.5850, 121.0100],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L as any).tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L as any).control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeGroup.current = (L as any).layerGroup().addTo(map);
      mapRef.current = map;
    });

    return () => { cancelled = true; };
  }, [authed]);

  /* ── Draw the selected route — single ink line, dashed walks ──────────── */
  const drawRoute = useCallback(() => {
    if (!mapRef.current || !routeGroup.current) return;
    import('leaflet').then(mod => {
      const L = mod.default ?? mod;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const group = routeGroup.current as any;
      group.clearLayers();
      if (!selected) return;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const inkLine = isDark ? '#7A90FF' : '#2947DE';
      const walkLine = isDark ? '#A5988A' : '#8D8672';
      const accent = isDark ? '#7A90FF' : '#2947DE';

      const allCoords: [number, number][] = [];

      for (const leg of selected.legs) {
        if (leg.type === 'walk') {
          const a: [number, number] = [leg.fromLat, leg.fromLng];
          const b: [number, number] = [leg.toLat, leg.toLng];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (L as any).polyline([a, b], { color: walkLine, weight: 2, dashArray: '4,7', opacity: 0.8 }).addTo(group);
          allCoords.push(a, b);
        } else {
          const ride = leg as RideLeg;
          const coords = ride.stops.map(s => [s.lat, s.lng] as [number, number]);
          if (coords.length >= 2) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (L as any).polyline(coords, { color: inkLine, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(group);
            allCoords.push(...coords);
          }
        }
      }

      const originC = originCoords(from), destC = stopCoords[to];
      if (originC) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).circleMarker(originC, { radius: 7, fillColor: accent, fillOpacity: 1, color: isDark ? '#000' : '#fff', weight: 2.5 }).addTo(group);
      }
      if (destC) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).circleMarker(destC, { radius: 7, fillColor: isDark ? '#F6F0E3' : '#191610', fillOpacity: 1, color: isDark ? '#000' : '#fff', weight: 2.5 }).addTo(group);
      }

      if (allCoords.length >= 2) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).fitBounds((L as any).latLngBounds(allCoords), { padding: [80, 40], maxZoom: 15 });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from, to, stopCoords, myLoc]);

  useEffect(() => { drawRoute(); }, [drawRoute]);

  useEffect(() => {
    if (screen === 'home' && routeGroup.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (routeGroup.current as any).clearLayers();
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).setView([14.5850, 121.0100], 12, { animate: true });
      }
    }
  }, [screen]);

  /* ── Save the current origin/destination as a commute (F5) ────────────── */
  async function saveCommute() {
    const origin = originCoords(from), dest = stopCoords[to];
    if (!origin || !dest) return;
    setCommuteSave('saving');
    try {
      const session = (await supabaseBrowser.auth.getSession()).data.session;
      if (!session) { setCommuteSave('failed'); return; }
      const res = await fetch('/api/v1/me/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: `${from} → ${to}`,
          originLat: origin[0], originLng: origin[1], originName: from,
          destLat: dest[0], destLng: dest[1], destName: to,
        }),
      });
      setCommuteSave(res.ok ? 'saved' : 'failed');
    } catch {
      setCommuteSave('failed');
    }
  }

  /* ── Search ──────────────────────────────────────────────────────────── */
  async function search() {
    const origin = originCoords(from), dest = stopCoords[to];
    if (!origin || !dest) return;
    const excludeModes = MODE_GROUPS.filter(g => !enabledModes[g.key]).flatMap(g => g.engineModes);
    setError(null); setModeFilter('all'); setCommuteSave('idle'); setScreen('loading');
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: origin[0], lng: origin[1] },
          destination: { lat: dest[0], lng: dest[1] },
          rush,
          ...(excludeModes.length > 0 ? { excludeModes } : {}),
        }),
      });
      const json = await res.json() as { data?: Itinerary[]; error?: { message: string } };
      if (!res.ok || json.error) { setError(json.error?.message ?? 'No route found.'); setScreen('home'); return; }
      setItineraries(json.data ?? []);
      setScreen('results');
    } catch {
      setError('Network error — check your connection.'); setScreen('home');
    }
  }

  /* ── Multi-stop chaining: plan a second leg from the current itinerary's
     destination, then splice both into one combined Itinerary. Reuses the
     same planning endpoint twice — no routing-engine changes. ────────────── */
  async function addAnotherStop() {
    if (!selected) return;
    const dest = stopCoords[nextStop];
    if (!dest) return;
    const lastLeg = selected.legs.at(-1);
    if (!lastLeg) return;
    const chainOrigin = lastLeg.type === 'walk'
      ? { lat: lastLeg.toLat, lng: lastLeg.toLng }
      : { lat: lastLeg.to.lat, lng: lastLeg.to.lng };

    setChainBusy(true); setChainError(null);
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: chainOrigin, destination: { lat: dest[0], lng: dest[1] }, rush }),
      });
      const json = await res.json() as { data?: Itinerary[]; error?: { message: string } };
      if (!res.ok || json.error || !json.data || json.data.length === 0) {
        setChainError(json.error?.message ?? 'No route found to that stop.');
        return;
      }
      const nextLeg = json.data.find(it => it.objective === selected.objective) ?? json.data[0];

      const combined: Itinerary = {
        legs: [...selected.legs, ...nextLeg.legs],
        totalDurationMin: selected.totalDurationMin + nextLeg.totalDurationMin,
        totalFare: selected.totalFare + nextLeg.totalFare,
        transfers: selected.transfers + nextLeg.transfers,
        objective: selected.objective,
      };
      setSelected(combined);
      setTo(nextStop);
      setAddingStop(false);
      setNextStop('');
    } catch {
      setChainError('Network error — check your connection.');
    } finally {
      setChainBusy(false);
    }
  }

  const GLOBAL = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=Baloo+2:wght@600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
    body{font-family:var(--font-sans);}
    select{-webkit-appearance:none;-moz-appearance:none;appearance:none;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .tnum{font-variant-numeric:tabular-nums;}
    .leaflet-container{font-family:'Inter',system-ui,sans-serif!important;}
    .leaflet-attribution-flag{display:none!important;}
    .leaflet-control-attribution{font-size:9px!important;opacity:0.4!important;background:transparent!important;color:inherit!important;}
  `;

  const canSearch = Boolean(from && to && from !== to && originCoords(from) && stopCoords[to] && Object.values(enabledModes).some(Boolean));

  /* Hold rendering until the session check settles (redirects when absent) */
  if (authed !== true) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,system-ui,sans-serif', color: C.muted, fontSize: 14 }}>
        Checking session…
      </div>
    );
  }

  /* Service status line — one glance, no chrome */
  const statusLine = disruptions === null
    ? null
    : disruptions.length === 0
      ? <Micro color={C.accent}>● All lines running normally</Micro>
      : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Micro color={C.ink} style={{ letterSpacing: '0.04em' }}>▲ {disruptions.length} service alert{disruptions.length > 1 ? 's' : ''} — {disruptions[0].description}</Micro>
          <a href="tel:1342" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: C.muted, textDecoration: 'underline' }}>
            {t(lang, 'report_to_ltfrb')}
          </a>
        </div>
      );

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: 'Inter,system-ui,sans-serif', background: C.bg }}>
      <style>{GLOBAL}</style>

      {/* Map layer */}
      <div ref={mapElRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ════════ HOME ════════ */}
      {screen === 'home' && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
              ParaPo<span style={{ color: C.ink }}>.</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/me" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', textDecoration: 'none', background: C.accent, borderRadius: 999, padding: '8px 16px' }}>
                My trips
              </a>
              <button
                onClick={async () => { await supabaseBrowser.auth.signOut(); window.location.href = '/auth'; }}
                style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink, cursor: 'pointer', fontFamily: 'inherit', background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 16px' }}
              >
                Sign out
              </button>
            </div>
          </div>

          <Sheet height="auto" style={{ maxHeight: '62vh' }}>
            <div style={{ overflowY: 'auto', padding: '14px 24px 28px', display: 'flex', flexDirection: 'column' }}>
              {statusLine && <div style={{ marginBottom: 18 }}>{statusLine}</div>}

              {rainAdvisory && (
                <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 14, background: C.error, color: '#FFFFFF' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>{rainAdvisory.message}</p>
                </div>
              )}

              {error && (
                <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, color: C.error }}>{error}</p>
              )}

              {/* From / To — typography only */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flexShrink: 0 }}>
                <div>
                  <StopRow label="From" value={from} onChange={setFrom} placeholder={t(lang, 'choose_a_stop')} stops={stopNames} extraOption={myLoc ? MY_LOCATION : undefined} />
                  <button onClick={useMyLocation} disabled={locBusy} style={{ background: 'none', border: 'none', padding: '8px 0 0', fontSize: 13, fontWeight: 700, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em' }}>
                    {locBusy ? 'Locating…' : from === MY_LOCATION ? `● ${t(lang, 'use_current_location')}` : `◉ ${t(lang, 'use_current_location')}`}
                  </button>
                </div>
                <StopRow label="To" value={to} onChange={setTo} placeholder={t(lang, 'choose_a_stop')} stops={stopNames} />
                <button onClick={() => { if (from !== MY_LOCATION) { const t = from; setFrom(to); setTo(t); } }} style={{ alignSelf: 'flex-end', background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: from === MY_LOCATION ? C.border : C.muted, cursor: 'pointer', fontFamily: 'inherit', marginTop: -8 }}>
                  ⇅ Swap
                </button>
              </div>

              {/* Transport modes — text toggles */}
              <div style={{ margin: '18px 0 0', flexShrink: 0 }}>
                <Micro>{t(lang, 'transport_modes')}</Micro>
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {MODE_GROUPS.map(g => {
                    const on = enabledModes[g.key];
                    return (
                      <button key={g.key}
                        onClick={() => setEnabledModes(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                        style={{
                          cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 14, fontWeight: 700, padding: '9px 18px',
                          borderRadius: 999, transition: 'all 0.15s',
                          background: on ? C.accent : 'transparent',
                          color: on ? '#FFFFFF' : C.body,
                          border: `1.5px solid ${on ? C.accent : C.border}`,
                        }}
                      >
                        {g.label}{on ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
                {!Object.values(enabledModes).some(Boolean) && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 600, color: C.error }}>Pick at least one mode.</p>
                )}
              </div>

              {/* Rush hour — one text row */}
              <button onClick={() => setRush(!rush)} style={{ background: 'none', border: 'none', padding: 0, margin: '18px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexShrink: 0 }}>
                <Micro color={rush ? C.ink : C.muted}>Rush hour {rush ? 'on' : 'off'} · 7–9 am · 5–7 pm</Micro>
              </button>

              {/* Beep card — adjusts fare display, doesn't change routing */}
              <button onClick={toggleHasBeep} style={{ background: 'none', border: 'none', padding: 0, margin: '10px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexShrink: 0 }}>
                <Micro color={hasBeep ? C.ink : C.muted}>
                  {hasBeep ? '✓ I have a Beep card' : 'Paying cash / no Beep card'}
                </Micro>
              </button>

              {/* Language — English / Taglish, key strings only */}
              <button onClick={toggleLang} style={{ background: 'none', border: 'none', padding: 0, margin: '10px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexShrink: 0 }}>
                <Micro color={C.muted}>{lang === 'tl' ? 'Wika: Taglish' : 'Language: English'} · {lang === 'tl' ? 'Switch to English' : 'Switch sa Taglish'}</Micro>
              </button>

              {/* CTA */}
              <button
                onClick={search}
                disabled={!canSearch}
                style={{
                  width: '100%', border: 'none', borderRadius: 999, padding: '17px', margin: '22px 0 0',
                  fontSize: 15, fontWeight: 700, letterSpacing: '0.01em', flexShrink: 0,
                  cursor: canSearch ? 'pointer' : 'default',
                  background: canSearch ? 'var(--gradient-primary)' : C.cardEl,
                  color: canSearch ? C.onPrimary : C.muted,
                  fontFamily: 'inherit',
                  boxShadow: canSearch ? '0 6px 18px rgba(41,71,222,0.25)' : 'none',
                }}
              >
                {t(lang, 'find_routes')}
              </button>

              {/* Fare reference — plain text */}
              <div style={{ margin: '28px 0 0', flexShrink: 0 }}>
                <Micro>2026 fare rates</Micro>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FARE_REF.map(([mode, ref]) => (
                    <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: 700, color: C.ink }}>{mode}</span>
                      <span className="tnum" style={{ color: C.body }}>{ref}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                  LTFRB/DOTr-approved · per boarding, not per segment ·
                  MRT-3 &amp; LRT-2 include the 50% DOTr discount (since Mar 23, 2026; LRT-1 not covered)
                </p>
              </div>
            </div>
          </Sheet>
        </>
      )}

      {/* ════════ LOADING ════════ */}
      {screen === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.ink, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <Micro>Calculating routes</Micro>
          </div>
        </div>
      )}

      {/* ════════ RESULTS ════════ */}
      {screen === 'results' && (() => {
        const filtered = itineraries.filter(itin => matchesFilter(itin, modeFilter));
        const modeFilters: { key: ModeFilter; label: string }[] = [
          { key: 'all', label: 'All' },
          { key: 'train', label: 'Train' },
          { key: 'bus', label: 'Bus' },
          { key: 'jeepney', label: 'Jeepney' },
        ];
        return (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0' }}>
              <button onClick={() => { setScreen('home'); setItineraries([]); setSelected(null); }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', cursor: 'pointer', color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                ← Back
              </button>
              <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 16px' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                  {from} <span style={{ color: C.muted, fontWeight: 400 }}>→</span> {to}
                </p>
              </div>
            </div>

            <Sheet height="64vh">
              {/* filter row — text only */}
              <div style={{ display: 'flex', gap: 8, padding: '12px 24px', flexShrink: 0 }}>
                {modeFilters.map(f => {
                  const on = modeFilter === f.key;
                  return (
                    <button key={f.key} onClick={() => setModeFilter(f.key)} style={{
                      cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 700, padding: '7px 16px',
                      borderRadius: 999, transition: 'all 0.15s',
                      background: on ? C.ink : 'transparent',
                      color: on ? C.bg : C.body,
                      border: `1.5px solid ${on ? C.ink : C.border}`,
                    }}>{f.label}</button>
                  );
                })}
              </div>

              {/* route list — typography rows, whitespace separation */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 24px 32px' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>No {modeFilter === 'all' ? '' : modeFilter + ' '}routes</p>
                    <p style={{ fontSize: 13, color: C.muted }}>Try a different filter or stops farther apart.</p>
                  </div>
                ) : filtered.map((itin, idx) => {
                  const displayFare = beepAdjustedTotalFare(itin.legs.filter(l => l.type === 'ride') as RideLeg[], hasBeep);
                  // Don't claim "cheapest" when another shown route is cheaper
                  const minFare = Math.min(...filtered.map(x => beepAdjustedTotalFare(x.legs.filter(l => l.type === 'ride') as RideLeg[], hasBeep)));
                  const objLabel = itin.objective === 'cheapest' && displayFare > minFare
                    ? 'Alternative'
                    : OBJ_LABEL[itin.objective] ?? itin.objective;
                  const worstRail = worstLastTrainCheck(checkLastTrain(itin.legs));
                  return (
                  <button key={idx} onClick={() => { setSelected(itin); setScreen('detail'); }}
                    style={{ display: 'block', width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '16px 18px', marginBottom: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <Micro color={C.accent}>Route {idx + 1} — {objLabel}</Micro>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                      <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {itin.totalDurationMin}<span style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: C.muted }}> min</span>
                      </span>
                      <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, color: C.accent, letterSpacing: '-0.02em' }}>
                        ₱{displayFare.toFixed(2)}
                      </span>
                    </div>
                    <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.body }}>
                      arrive ~{arriveAt(itin.totalDurationMin)} · {itin.transfers} transfer{itin.transfers !== 1 ? 's' : ''}
                    </p>
                    <p style={{ margin: '4px 0 10px', fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                      {comboLabel(itin)}
                    </p>
                    <JourneyBar itin={itin} />
                    {worstRail && (
                      <p style={{
                        margin: '10px 0 0', fontSize: 12, fontWeight: 700,
                        color: worstRail.status === 'closed' ? C.error : C.accent,
                      }}>
                        {worstRail.status === 'closed'
                          ? `⚠ Last train has left — ${worstRail.lineName} closed at ${formatClockTime(worstRail.closesAt)}`
                          : `⏰ You'll just make the last train — ${worstRail.lineName} boards ~${formatClockTime(worstRail.boardsAt)}`}
                      </p>
                    )}
                  </button>
                  );
                })}
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6, marginTop: 16 }}>
                  Fares per person per boarding · LTFRB/DOTr 2026 · Walk legs free
                </p>
              </div>
            </Sheet>
          </>
        );
      })()}

      {/* ════════ DETAIL ════════ */}
      {screen === 'detail' && selected && (() => {
        const lastRide = [...selected.legs].reverse().find(l => l.type === 'ride') as RideLeg | undefined;
        const destName = lastRide?.to.name ?? to;
        const destCoords = lastRide ? [lastRide.to.lat, lastRide.to.lng] : stopCoords[destName];
        const wazeUrl = destCoords
          ? `https://waze.com/ul?ll=${destCoords[0]},${destCoords[1]}&navigate=yes&utm_source=parapo`
          : `https://waze.com/ul?q=${encodeURIComponent(destName + ' Metro Manila')}&navigate=yes&utm_source=parapo`;
        const worstRailCheck = worstLastTrainCheck(checkLastTrain(selected.legs));
        const selectedRideLegs = selected.legs.filter(l => l.type === 'ride') as RideLeg[];
        const selectedDisplayFare = beepAdjustedTotalFare(selectedRideLegs, hasBeep);

        return (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setScreen('results')} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', cursor: 'pointer', color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                ← Routes
              </button>
              <span style={{ background: C.accent, borderRadius: 999, padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FFFFFF' }}>
                {OBJ_LABEL[selected.objective] ?? selected.objective}
              </span>
            </div>

            <Sheet height="70vh">
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 24px 32px' }}>
                {/* Headline numbers */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 0 6px' }}>
                  <div>
                    <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: 50, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {selected.totalDurationMin}<span style={{ fontSize: 17, fontWeight: 600, color: C.muted }}> min</span>
                    </span>
                    <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.body }}>
                      arrive ~{arriveAt(selected.totalDurationMin)} · {selected.transfers} transfer{selected.transfers !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, color: C.accent, letterSpacing: '-0.02em' }}>₱{selectedDisplayFare.toFixed(2)}</span>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>per person{hasBeep ? ' · Beep' : ' · cash'}</p>
                  </div>
                </div>

                <div style={{ margin: '10px 0 26px' }}><JourneyBar itin={selected} /></div>

                {worstRailCheck && (
                  <div style={{
                    margin: '0 0 20px', padding: '12px 14px', borderRadius: 14,
                    background: worstRailCheck.status === 'closed' ? C.error : C.accent,
                    color: '#FFFFFF',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
                      {worstRailCheck.status === 'closed'
                        ? `⚠ Last train has left — ${worstRailCheck.lineName} closed at ${formatClockTime(worstRailCheck.closesAt)}. This route won't work right now.`
                        : `⏰ You'll just make the last train — ${worstRailCheck.lineName} boards ~${formatClockTime(worstRailCheck.boardsAt)} (closes ${formatClockTime(worstRailCheck.closesAt)}).`}
                    </p>
                  </div>
                )}

                {/* Step by step */}
                <Micro>{t(lang, 'step_by_step')}</Micro>
                <div style={{ margin: '14px 0 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {selected.legs.map((leg, i) => {
                    if (leg.type === 'walk') {
                      const jeep = suggestJeepneyCorridor(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng);
                      const isFinalLeg = i === selected.legs.length - 1;
                      const entrance = isFinalLeg ? nearestStationEntrance(leg.fromName, leg.toLat, leg.toLng) : null;
                      return (
                      <div key={i}>
                        <div style={{ display: 'flex', gap: 14 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: C.muted, width: 38, flexShrink: 0, paddingTop: 3 }}>WALK</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>{t(lang, 'walk_to', { stop: leg.toName })}</p>
                            <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{leg.durationMin} min · {leg.distKm.toFixed(2)} km</p>
                            {entrance && (
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: C.accent, fontWeight: 600 }}>
                                Exit via the {entrance.label} — closer to your destination
                              </p>
                            )}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Free</span>
                        </div>
                        {jeep && (
                          <div style={{
                            marginLeft: 52, marginTop: 8, padding: '10px 12px', borderRadius: 12,
                            border: `1.5px dashed ${C.border}`, background: C.surface,
                          }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.body }}>
                              Suggested — ask a jeepney toward {jeep.towardLabel}
                            </p>
                            <p className="tnum" style={{ margin: '3px 0 0', fontSize: 11, color: C.muted }}>
                              {jeep.corridorName} · ~₱{jeep.fareLow.toFixed(0)}–{jeep.fareHigh.toFixed(0)} · not a tracked route, no schedule
                            </p>
                          </div>
                        )}
                      </div>
                      );
                    }
                    const ride = leg as RideLeg;
                    const meta = MODE_META[ride.mode] ?? { label: ride.mode.toUpperCase(), shade: C.muted };
                    // Jeepneys have no fixed schedule, so a per-leg minute figure
                    // is misleading — show board/alight stops instead. The leg's
                    // travel time still rolls into the overall trip ETA above.
                    const noSchedule = ride.mode === 'jeepney';
                    const beepFare = beepAdjustedFare(ride, hasBeep);
                    const outages = ride.mode === 'mrt'
                      ? [...(accessibilityByStop[ride.from.id] ?? []), ...(accessibilityByStop[ride.to.id] ?? [])]
                          .filter(a => a.status === 'out_of_service')
                      : [];
                    return (
                      <div key={i} style={{ display: 'flex', gap: 14 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: C.ink, width: 38, flexShrink: 0, paddingTop: 3 }}>{meta.label}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{ride.line.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: C.body }}>
                            {noSchedule ? t(lang, 'board_here') : ''} {ride.from.name} → {ride.to.name}
                          </p>
                          <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>
                            {ride.stops.length} stop{ride.stops.length !== 1 ? 's' : ''} · {ride.distKm.toFixed(1)} km
                            {!noSchedule && ` · ${ride.durationMin} min`}
                          </p>
                          {noSchedule && (
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
                              {t(lang, 'no_fixed_schedule')}
                            </p>
                          )}
                          {ride.stops.length > 2 && (
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                              {ride.stops.map(s => s.name).join(' → ')}
                            </p>
                          )}
                          {beepFare.note && (
                            <p style={{ margin: '6px 0 0', fontSize: 11, color: C.accent, fontWeight: 600 }}>{beepFare.note}</p>
                          )}
                          {outages.map((a, oi) => (
                            <p key={oi} style={{ margin: '4px 0 0', fontSize: 11, color: C.error, fontWeight: 600 }}>
                              ⚠ {a.feature === 'elevator' ? 'Elevator' : 'Escalator'} reported out of service
                              {a.note ? ` — ${a.note}` : ''}
                            </p>
                          ))}
                        </div>
                        <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>₱{beepFare.displayFare.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Fare breakdown — receipt typography */}
                <Micro>{t(lang, 'fare_breakdown')}{!hasBeep ? ' (cash / no Beep card)' : ''}</Micro>
                <div style={{ margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {selected.legs.map((leg, i) => {
                    if (leg.type === 'walk') return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: C.muted }}>Walk · {leg.distKm.toFixed(2)} km</span>
                        <span style={{ color: C.muted }}>Free</span>
                      </div>
                    );
                    const ride = leg as RideLeg;
                    const formula = fareFormula(ride);
                    const beepFare = beepAdjustedFare(ride, hasBeep);
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                          <span style={{ fontWeight: 700, color: C.ink }}>{ride.line.name} <span className="tnum" style={{ fontWeight: 400, color: C.muted }}>{ride.distKm.toFixed(1)} km</span></span>
                          <span className="tnum" style={{ fontWeight: 700, color: C.ink }}>₱{beepFare.displayFare.toFixed(2)}</span>
                        </div>
                        {formula && <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{formula}</p>}
                        {beepFare.note && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.accent, fontWeight: 600 }}>{beepFare.note}</p>}
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{t(lang, 'total_per_person')}</span>
                    <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>₱{selectedDisplayFare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => {
                    try { sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(selected)); } catch { /* noop */ }
                    router.push('/trip');
                  }} style={{
                    width: '100%', border: 'none', borderRadius: 999, padding: '17px',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--gradient-primary)', color: C.onPrimary, letterSpacing: '0.01em',
                    boxShadow: '0 6px 18px rgba(41,71,222,0.25)',
                  }}>
                    {t(lang, 'start_trip')}
                  </button>
                  <a href={wazeUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: 'block', textAlign: 'center', border: `1.5px solid ${C.accent}`, borderRadius: 999,
                    padding: '15px', fontSize: 15, fontWeight: 700, color: C.accent,
                    textDecoration: 'none', fontFamily: 'inherit',
                  }}>
                    Open in Waze
                  </a>

                  {addingStop ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
                      <StopRow label="Add another stop" value={nextStop} onChange={setNextStop} placeholder={t(lang, 'choose_a_stop')} stops={stopNames} />
                      {chainError && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.error }}>{chainError}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={addAnotherStop}
                          disabled={!nextStop || nextStop === to || chainBusy}
                          style={{
                            flex: 1, cursor: nextStop && nextStop !== to ? 'pointer' : 'default', fontFamily: 'inherit',
                            fontSize: 13, fontWeight: 700, padding: '10px', borderRadius: 999, border: 'none',
                            background: nextStop && nextStop !== to ? C.accent : C.cardEl,
                            color: nextStop && nextStop !== to ? C.onPrimary : C.muted,
                          }}
                        >
                          {chainBusy ? 'Adding…' : 'Add to trip'}
                        </button>
                        <button
                          onClick={() => { setAddingStop(false); setNextStop(''); setChainError(null); }}
                          style={{ fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 999, border: 'none', background: 'none', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingStop(true)} style={{
                      width: '100%', background: 'transparent', color: C.ink,
                      border: `1.5px solid ${C.border}`, borderRadius: 999,
                      padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      + Add another stop
                    </button>
                  )}

                  <button
                    onClick={saveCommute}
                    disabled={commuteSave === 'saving' || commuteSave === 'saved'}
                    style={{
                      width: '100%', background: 'transparent', color: commuteSave === 'saved' ? C.accent : C.ink,
                      border: `1.5px solid ${commuteSave === 'saved' ? C.accent : C.ink}`, borderRadius: 999,
                      padding: '14px', fontSize: 14, fontWeight: 700,
                      cursor: commuteSave === 'idle' || commuteSave === 'failed' ? 'pointer' : 'default', fontFamily: 'inherit',
                    }}
                  >
                    {commuteSave === 'saved' ? '✓ Commute saved — see My trips'
                      : commuteSave === 'saving' ? 'Saving…'
                      : commuteSave === 'failed' ? 'Save failed — tap to retry'
                      : `☆ ${t(lang, 'save_commute')}`}
                  </button>
                  <button onClick={() => { setFrom(''); setTo(''); setSelected(null); setItineraries([]); setScreen('home'); }} style={{
                    width: '100%', background: 'none', border: 'none', padding: '12px',
                    fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t(lang, 'plan_another_trip')}
                  </button>
                  <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
                    <ReportIssueButton routeId={selectedRideLegs[0]?.line.id} contextLabel={comboLabel(selected)} />
                  </div>
                </div>
              </div>
            </Sheet>
          </>
        );
      })()}
    </div>
  );
}
