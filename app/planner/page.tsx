'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';

/*
 * Planner — the primary commuter dashboard.
 * Monochrome minimal: typography scale is the hierarchy; whitespace groups
 * information; the single accent (transit green) marks live/positive states
 * (location fix, normal service, GO actions) and nothing decorative.
 */

const C = {
  bg:     'var(--color-bg)',
  surface:'var(--color-surface)',
  cardEl: 'var(--color-card-el)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
  error:  'var(--color-error)',
  onPrimary: 'var(--color-on-primary)',
};

/* Grayscale ramp for route segments — line identity is carried by TEXT */
const MODE_META: Record<string, { label: string; shade: string }> = {
  mrt:     { label: 'MRT',  shade: 'var(--color-ink)' },
  lrt:     { label: 'LRT',  shade: 'var(--color-body)' },
  bus:     { label: 'BUS',  shade: 'var(--color-muted)' },
  jeepney: { label: 'JEEP', shade: 'var(--color-border)' },
  walk:    { label: 'WALK', shade: 'var(--color-card-el)' },
};

const FARE_REF: [string, string][] = [
  ['MRT-3',   '₱13 min · ₱0.94/km'],
  ['LRT',     '₱12 min · ₱0.89/km'],
  ['Bus',     '₱15 first 5 km · ₱2.65/km'],
  ['Jeepney', '₱14 first 4 km · ₱1.80/km'],
];

// Stop catalog comes from /api/v1/catalog/stops so pick lists always match
// the routable network (F4). Never hardcode stops here.
type CatalogStop = { id: number; name: string; lat: number; lng: number };

type WalkLeg = { type: 'walk'; fromName: string; toName: string; fromLat: number; fromLng: number; toLat: number; toLng: number; distKm: number; durationMin: number };
type RideLeg = { type: 'ride'; mode: string; line: { id: number; name: string; color: string }; from: { name: string; lat: number; lng: number }; to: { name: string; lat: number; lng: number }; stops: { name: string; lat: number; lng: number }[]; distKm: number; durationMin: number; fare: number; fareRule?: { baseFare: number; perKmRate: number; flagDistanceKm: number } };
type Leg = WalkLeg | RideLeg;
type Itinerary = { legs: Leg[]; totalDurationMin: number; totalFare: number; transfers: number; objective: string };
type Disruption = { id: number; corridorId: number; description: string };
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

/* ── Select row — underline, no box ───────────────────────────────────────── */
function StopRow({ label, value, onChange, placeholder, stops, extraOption }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  stops: string[]; extraOption?: string;
}) {
  return (
    <div>
      <Micro>{label}</Micro>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', background: 'transparent', border: 'none', outline: 'none',
        borderBottom: `2px solid ${C.border}`, borderRadius: 0,
        padding: '10px 0', fontSize: 19, color: value ? C.ink : C.muted,
        fontFamily: 'inherit', fontWeight: value ? 700 : 400, cursor: 'pointer',
        WebkitAppearance: 'none', letterSpacing: '-0.02em',
      }}>
        <option value="">{placeholder}</option>
        {extraOption && <option value={extraOption}>{extraOption}</option>}
        {stops.map(s => <option key={s}>{s}</option>)}
      </select>
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
      borderRadius: '12px 12px 0 0',
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
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [enabledModes, setEnabledModes] = useState<Record<ModeGroup, boolean>>({ train: true, bus: true, jeepney: true });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selected, setSelected]   = useState<Itinerary | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [stopCoords, setStopCoords] = useState<Record<string, [number, number]>>({});
  const [myLoc, setMyLoc]         = useState<[number, number] | null>(null);
  const [locBusy, setLocBusy]     = useState(false);
  const [disruptions, setDisruptions] = useState<Disruption[] | null>(null);
  const stopNames = Object.keys(stopCoords).sort();

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

      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      // Monochrome basemaps — Positron (light) / Dark Matter (dark)
      const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

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
  }, []);

  /* ── Draw the selected route — single ink line, dashed walks ──────────── */
  const drawRoute = useCallback(() => {
    if (!mapRef.current || !routeGroup.current) return;
    import('leaflet').then(mod => {
      const L = mod.default ?? mod;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const group = routeGroup.current as any;
      group.clearLayers();
      if (!selected) return;

      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const inkLine = isDark ? '#FAFAFA' : '#0A0A0A';
      const walkLine = isDark ? '#7A7A7A' : '#8A8A8A';
      const accent = isDark ? '#2BD576' : '#007A3D';

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
        (L as any).circleMarker(destC, { radius: 7, fillColor: inkLine, fillOpacity: 1, color: isDark ? '#000' : '#fff', weight: 2.5 }).addTo(group);
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

  /* ── Search ──────────────────────────────────────────────────────────── */
  async function search() {
    const origin = originCoords(from), dest = stopCoords[to];
    if (!origin || !dest) return;
    const excludeModes = MODE_GROUPS.filter(g => !enabledModes[g.key]).flatMap(g => g.engineModes);
    setError(null); setModeFilter('all'); setScreen('loading');
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: origin[0], lng: origin[1] },
          destination: { lat: dest[0], lng: dest[1] },
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

  const GLOBAL = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
    body{font-family:'Inter',system-ui,sans-serif;}
    select{-webkit-appearance:none;-moz-appearance:none;appearance:none;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .tnum{font-variant-numeric:tabular-nums;}
    .leaflet-container{font-family:'Inter',system-ui,sans-serif!important;}
    .leaflet-attribution-flag{display:none!important;}
    .leaflet-control-attribution{font-size:9px!important;opacity:0.4!important;background:transparent!important;color:inherit!important;}
  `;

  const canSearch = Boolean(from && to && from !== to && originCoords(from) && stopCoords[to] && Object.values(enabledModes).some(Boolean));

  /* Service status line — one glance, no chrome */
  const statusLine = disruptions === null
    ? null
    : disruptions.length === 0
      ? <Micro color={C.accent}>● All lines running normally</Micro>
      : <Micro color={C.ink} style={{ letterSpacing: '0.04em' }}>▲ {disruptions.length} service alert{disruptions.length > 1 ? 's' : ''} — {disruptions[0].description}</Micro>;

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: 'Inter,system-ui,sans-serif', background: C.bg }}>
      <style>{GLOBAL}</style>

      {/* Map layer */}
      <div ref={mapElRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ════════ HOME ════════ */}
      {screen === 'home' && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.05em', color: C.ink }}>
              ParaPo<span style={{ color: C.accent }}>.</span>
            </span>
            <a href="/auth" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink, textDecoration: 'none' }}>
              Sign in
            </a>
          </div>

          <Sheet height="auto" style={{ maxHeight: '62vh' }}>
            <div style={{ overflowY: 'auto', padding: '14px 24px 28px', display: 'flex', flexDirection: 'column' }}>
              {statusLine && <div style={{ marginBottom: 18 }}>{statusLine}</div>}

              {error && (
                <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, color: C.error }}>{error}</p>
              )}

              {/* From / To — typography only */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flexShrink: 0 }}>
                <div>
                  <StopRow label="From" value={from} onChange={setFrom} placeholder="Choose a stop" stops={stopNames} extraOption={myLoc ? MY_LOCATION : undefined} />
                  <button onClick={useMyLocation} disabled={locBusy} style={{ background: 'none', border: 'none', padding: '8px 0 0', fontSize: 13, fontWeight: 700, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em' }}>
                    {locBusy ? 'Locating…' : from === MY_LOCATION ? '● Using current location' : '◉ Use current location'}
                  </button>
                </div>
                <StopRow label="To" value={to} onChange={setTo} placeholder="Choose a stop" stops={stopNames} />
                <button onClick={() => { if (from !== MY_LOCATION) { const t = from; setFrom(to); setTo(t); } }} style={{ alignSelf: 'flex-end', background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: from === MY_LOCATION ? C.border : C.muted, cursor: 'pointer', fontFamily: 'inherit', marginTop: -8 }}>
                  ⇅ Swap
                </button>
              </div>

              {/* Transport modes — text toggles */}
              <div style={{ margin: '18px 0 0', flexShrink: 0 }}>
                <Micro>Transport modes</Micro>
                <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
                  {MODE_GROUPS.map(g => {
                    const on = enabledModes[g.key];
                    return (
                      <button key={g.key}
                        onClick={() => setEnabledModes(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 15, fontWeight: on ? 800 : 500,
                          color: on ? C.ink : C.muted,
                          textDecoration: on ? 'none' : 'line-through',
                          letterSpacing: '-0.01em',
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

              {/* CTA */}
              <button
                onClick={search}
                disabled={!canSearch}
                style={{
                  width: '100%', border: 'none', borderRadius: 2, padding: '17px', margin: '22px 0 0',
                  fontSize: 15, fontWeight: 700, letterSpacing: '0.01em', flexShrink: 0,
                  cursor: canSearch ? 'pointer' : 'default',
                  background: canSearch ? 'var(--gradient-primary)' : C.cardEl,
                  color: canSearch ? C.onPrimary : C.muted,
                  fontFamily: 'inherit',
                }}
              >
                Find routes
              </button>

              {/* Fare reference — plain text */}
              <div style={{ margin: '28px 0 0', flexShrink: 0 }}>
                <Micro>2024 fare rates</Micro>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FARE_REF.map(([mode, ref]) => (
                    <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: 700, color: C.ink }}>{mode}</span>
                      <span className="tnum" style={{ color: C.body }}>{ref}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 11, color: C.muted }}>LTFRB-approved · per boarding, not per segment</p>
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
              <button onClick={() => { setScreen('home'); setItineraries([]); setSelected(null); }} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '8px 14px', cursor: 'pointer', color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                ← Back
              </button>
              <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '10px 14px' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                  {from} <span style={{ color: C.muted, fontWeight: 400 }}>→</span> {to}
                </p>
              </div>
            </div>

            <Sheet height="64vh">
              {/* filter row — text only */}
              <div style={{ display: 'flex', gap: 22, padding: '12px 24px', flexShrink: 0 }}>
                {modeFilters.map(f => (
                  <button key={f.key} onClick={() => setModeFilter(f.key)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: modeFilter === f.key ? 800 : 500,
                    color: modeFilter === f.key ? C.ink : C.muted,
                    borderBottom: modeFilter === f.key ? `2px solid ${C.ink}` : '2px solid transparent',
                    paddingBottom: 4, letterSpacing: '0.02em', textTransform: 'uppercase',
                  }}>{f.label}</button>
                ))}
              </div>

              {/* route list — typography rows, whitespace separation */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 24px 32px' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>No {modeFilter === 'all' ? '' : modeFilter + ' '}routes</p>
                    <p style={{ fontSize: 13, color: C.muted }}>Try a different filter or stops farther apart.</p>
                  </div>
                ) : filtered.map((itin, idx) => {
                  // Don't claim "cheapest" when another shown route is cheaper
                  const minFare = Math.min(...filtered.map(x => x.totalFare));
                  const objLabel = itin.objective === 'cheapest' && itin.totalFare > minFare
                    ? 'Alternative'
                    : OBJ_LABEL[itin.objective] ?? itin.objective;
                  return (
                  <button key={idx} onClick={() => { setSelected(itin); setScreen('detail'); }}
                    style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '18px 0', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <Micro>Route {idx + 1} — {objLabel}</Micro>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                      <span className="tnum" style={{ fontSize: 36, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>
                        {itin.totalDurationMin}<span style={{ fontSize: 15, fontWeight: 500, color: C.muted }}> min</span>
                      </span>
                      <span className="tnum" style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>
                        ₱{itin.totalFare.toFixed(2)}
                      </span>
                    </div>
                    <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.body }}>
                      arrive ~{arriveAt(itin.totalDurationMin)} · {itin.transfers} transfer{itin.transfers !== 1 ? 's' : ''}
                    </p>
                    <p style={{ margin: '4px 0 10px', fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                      {comboLabel(itin)}
                    </p>
                    <JourneyBar itin={itin} />
                  </button>
                  );
                })}
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6, marginTop: 16 }}>
                  Fares per person per boarding · LTFRB 2024 · Walk legs free
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

        return (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setScreen('results')} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '8px 14px', cursor: 'pointer', color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                ← Routes
              </button>
              <span style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink }}>
                {OBJ_LABEL[selected.objective] ?? selected.objective}
              </span>
            </div>

            <Sheet height="70vh">
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 24px 32px' }}>
                {/* Headline numbers */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 0 6px' }}>
                  <div>
                    <span className="tnum" style={{ fontSize: 52, fontWeight: 800, color: C.ink, letterSpacing: '-0.05em', lineHeight: 1 }}>
                      {selected.totalDurationMin}<span style={{ fontSize: 17, fontWeight: 500, color: C.muted }}> min</span>
                    </span>
                    <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.body }}>
                      arrive ~{arriveAt(selected.totalDurationMin)} · {selected.transfers} transfer{selected.transfers !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="tnum" style={{ fontSize: 30, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>₱{selected.totalFare.toFixed(2)}</span>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>per person</p>
                  </div>
                </div>

                <div style={{ margin: '10px 0 26px' }}><JourneyBar itin={selected} /></div>

                {/* Step by step */}
                <Micro>Step by step</Micro>
                <div style={{ margin: '14px 0 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {selected.legs.map((leg, i) => {
                    if (leg.type === 'walk') return (
                      <div key={i} style={{ display: 'flex', gap: 14 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: C.muted, width: 38, flexShrink: 0, paddingTop: 3 }}>WALK</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>Walk to {leg.toName}</p>
                          <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{leg.durationMin} min · {leg.distKm.toFixed(2)} km</p>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Free</span>
                      </div>
                    );
                    const ride = leg as RideLeg;
                    const meta = MODE_META[ride.mode] ?? { label: ride.mode.toUpperCase(), shade: C.muted };
                    return (
                      <div key={i} style={{ display: 'flex', gap: 14 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: C.ink, width: 38, flexShrink: 0, paddingTop: 3 }}>{meta.label}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{ride.line.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: C.body }}>{ride.from.name} → {ride.to.name}</p>
                          <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>
                            {ride.stops.length} stop{ride.stops.length !== 1 ? 's' : ''} · {ride.durationMin} min · {ride.distKm.toFixed(1)} km
                          </p>
                          {ride.stops.length > 2 && (
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                              {ride.stops.map(s => s.name).join(' → ')}
                            </p>
                          )}
                        </div>
                        <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>₱{ride.fare.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Fare breakdown — receipt typography */}
                <Micro>Fare breakdown</Micro>
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
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                          <span style={{ fontWeight: 700, color: C.ink }}>{ride.line.name} <span className="tnum" style={{ fontWeight: 400, color: C.muted }}>{ride.distKm.toFixed(1)} km</span></span>
                          <span className="tnum" style={{ fontWeight: 700, color: C.ink }}>₱{ride.fare.toFixed(2)}</span>
                        </div>
                        {formula && <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{formula}</p>}
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>Total per person</span>
                    <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>₱{selected.totalFare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => {
                    try { sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(selected)); } catch { /* noop */ }
                    router.push('/trip');
                  }} style={{
                    width: '100%', border: 'none', borderRadius: 2, padding: '17px',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--gradient-primary)', color: C.onPrimary, letterSpacing: '0.01em',
                  }}>
                    Start trip — track live
                  </button>
                  <a href={wazeUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: 'block', textAlign: 'center', border: `1.5px solid ${C.ink}`, borderRadius: 2,
                    padding: '15px', fontSize: 15, fontWeight: 700, color: C.ink,
                    textDecoration: 'none', fontFamily: 'inherit',
                  }}>
                    Open in Waze
                  </a>
                  <button onClick={() => { setFrom(''); setTo(''); setSelected(null); setItineraries([]); setScreen('home'); }} style={{
                    width: '100%', background: 'none', border: 'none', padding: '12px',
                    fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    Plan another trip
                  </button>
                </div>
              </div>
            </Sheet>
          </>
        );
      })()}
    </div>
  );
}
