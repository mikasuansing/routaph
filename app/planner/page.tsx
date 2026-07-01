'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { supabaseBrowser } from '@/lib/supabase/browser';

/* ── Design tokens ─────────────────────────────────────────────────────────── */
const C = {
  bg:         'var(--color-bg)',
  surface:    'var(--color-surface)',
  card:       'var(--color-card)',
  cardEl:     'var(--color-card-el)',
  border:     'var(--color-border)',
  muted:      'var(--color-muted)',
  body:       'var(--color-body)',
  ink:        'var(--color-ink)',
  accent:     'var(--color-accent)',
  accent2:    'var(--color-accent-2)',
  green:      'var(--color-green)',
  error:      'var(--color-error)',
  glass:      'var(--color-glass)',
  glassBorder:'var(--color-glass-border)',
};

/* ── Vibrant mode colors (work in both light + dark) ─────────────────────── */
const MODE_META: Record<string, { label: string; color: string; icon: string }> = {
  mrt:     { label: 'MRT-3',   color: '#6366F1', icon: '🚇' },
  lrt:     { label: 'LRT',     color: '#06B6D4', icon: '🚈' },
  bus:     { label: 'Bus',     color: '#F97316', icon: '🚌' },
  jeepney: { label: 'Jeepney', color: '#EAB308', icon: '🚐' },
  walk:    { label: 'Walk',    color: '#94A3B8', icon: '🚶' },
};

const FARE_REF: Record<string, string> = {
  mrt:     '₱13 min · ₱0.94/km',
  lrt:     '₱12 min · ₱0.89/km',
  bus:     '₱15 for 5km · ₱2.65/km',
  jeepney: '₱14 for 4km · ₱1.80/km',
};

const STOP_COORDS: Record<string, [number, number]> = {
  'Taft Avenue (MRT)':       [14.5395, 120.9985],
  'Magallanes':              [14.5401, 121.0038],
  'Ayala':                   [14.5487, 121.0279],
  'Buendia':                 [14.5536, 121.0347],
  'Guadalupe':               [14.5658, 121.0469],
  'Ortigas (MRT)':           [14.5876, 121.0583],
  'Shaw Blvd':               [14.5811, 121.0543],
  'Boni':                    [14.5762, 121.0477],
  'Cubao (MRT)':             [14.6228, 121.0526],
  'GMA-Kamuning':            [14.6378, 121.0484],
  'Quezon Ave (MRT)':        [14.6449, 121.0403],
  'North Avenue':            [14.6521, 121.0322],
  'Recto':                   [14.5987, 120.9844],
  'Cubao (LRT-2)':           [14.6224, 121.0524],
  'Katipunan (LRT-2)':       [14.6284, 121.0731],
  'Santolan (LRT-2)':        [14.6221, 121.0883],
  'Marikina (LRT-2)':        [14.6217, 121.1012],
  'Antipolo':                [14.6249, 121.1240],
  'Monumento (Bus)':         [14.6543, 120.9840],
  'Trinoma':                 [14.6520, 121.0320],
  'Cubao (Bus)':             [14.6197, 121.0510],
  'Ortigas (Bus)':           [14.5870, 121.0576],
  'Taft Ave (Bus)':          [14.5545, 120.9942],
  'Katipunan LRT2 (Jeep)':   [14.6284, 121.0730],
  'UP Diliman':              [14.6540, 121.0685],
  'Tandang Sora':            [14.6820, 121.0440],
};
const ALL_STOPS = Object.keys(STOP_COORDS).sort();

type WalkLeg = { type: 'walk'; fromName: string; toName: string; distKm: number; durationMin: number };
type RideLeg = { type: 'ride'; mode: string; line: { id: number; name: string; color: string }; from: { name: string }; to: { name: string }; stops: { name: string }[]; distKm: number; durationMin: number; fare: number };
type Leg = WalkLeg | RideLeg;
type Itinerary = { legs: Leg[]; totalDurationMin: number; totalFare: number; transfers: number; objective: string };
type Screen = 'home' | 'loading' | 'results' | 'detail';
type ModeFilter = 'all' | 'train' | 'bus' | 'jeepney';

function rideLegs(itin: Itinerary): RideLeg[] {
  return itin.legs.filter(l => l.type === 'ride') as RideLeg[];
}
function matchesFilter(itin: Itinerary, f: ModeFilter): boolean {
  if (f === 'all') return true;
  const modes = rideLegs(itin).map(l => l.mode);
  if (f === 'train') return modes.some(m => m === 'mrt' || m === 'lrt');
  return modes.some(m => m === f);
}
function primaryColor(itin: Itinerary): string {
  const first = rideLegs(itin)[0];
  return first ? (MODE_META[first.mode]?.color ?? '#6366F1') : '#6366F1';
}
const OBJ_LABEL: Record<string, string> = {
  fastest: 'Fastest', fewest_transfers: 'Fewest transfers', cheapest: 'Cheapest',
};

/* ── Journey bar: colored segments proportional to leg duration ─────────── */
function JourneyBar({ itin }: { itin: Itinerary }) {
  const total = itin.totalDurationMin || 1;
  return (
    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1.5, marginTop: 10 }}>
      {itin.legs.map((leg, i) => {
        const pct = Math.max((leg.durationMin / total) * 100, 3).toFixed(1) + '%';
        const color = leg.type === 'walk' ? 'rgba(148,163,184,0.3)' : MODE_META[leg.mode]?.color ?? '#6366F1';
        return <div key={i} style={{ width: pct, background: color, borderRadius: 3 }} />;
      })}
    </div>
  );
}

/* ── Mode pill ──────────────────────────────────────────────────────────── */
function ModePill({ mode }: { mode: string }) {
  const meta = MODE_META[mode] ?? { label: mode, color: '#94A3B8', icon: '' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
      borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
      background: `${meta.color}18`, border: `1px solid ${meta.color}40`, color: meta.color,
    }}>{meta.icon} {meta.label}</span>
  );
}

/* ── Glass card ─────────────────────────────────────────────────────────── */
function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.glass, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${C.glassBorder}`, borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)', ...style,
    }}>{children}</div>
  );
}

/* ── Bottom sheet ───────────────────────────────────────────────────────── */
function Sheet({ children, height, style }: { children: React.ReactNode; height: string | number; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
      height, background: C.surface,
      borderRadius: '24px 24px 0 0',
      border: `1px solid ${C.glassBorder}`,
      borderBottom: 'none',
      boxShadow: '0 -4px 40px rgba(0,0,0,0.3)',
      display: 'flex', flexDirection: 'column',
      paddingBottom: 'env(safe-area-inset-bottom)',
      ...style,
    }}>
      {/* drag handle */}
      <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '12px auto 0', flexShrink: 0 }} />
      {children}
    </div>
  );
}

/* ── Select row inside glass card ───────────────────────────────────────── */
function StopRow({ icon, value, onChange, placeholder }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
      {icon}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        flex: 1, background: 'transparent', border: 'none', outline: 'none',
        padding: '14px 0', fontSize: 15, color: value ? C.ink : C.muted,
        fontFamily: 'inherit', fontWeight: value ? 500 : 400, cursor: 'pointer',
        WebkitAppearance: 'none',
      }}>
        <option value="">{placeholder}</option>
        {ALL_STOPS.map(s => <option key={s}>{s}</option>)}
      </select>
    </div>
  );
}

/* ── Dot markers for origin / destination ──────────────────────────────── */
function GreenDot() {
  return <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2.5px solid #10B981', background: 'var(--color-surface)', flexShrink: 0 }} />;
}
function PurpleDot() {
  return <div style={{ width: 10, height: 10, borderRadius: 3, background: '#6366F1', flexShrink: 0 }} />;
}

/* ── Main ───────────────────────────────────────────────────────────────── */
export default function Planner() {
  const router = useRouter();
  const [screen, setScreen]       = useState<Screen>('home');
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [rush, setRush]           = useState(() => { const h = new Date().getHours(); return (h >= 7 && h <= 9) || (h >= 17 && h <= 19); });
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selected, setSelected]   = useState<Itinerary | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace('/auth');
        return;
      }
      setIsAuthed(true);
    });
    return () => { active = false; };
  }, [router]);

  /* ── Leaflet map refs ─────────────────────────────────────────────── */
  const mapElRef    = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<unknown>(null);   // L.Map
  const routeGroup  = useRef<unknown>(null);   // L.LayerGroup

  /* ── Initialise Leaflet once (client-only) ───────────────────────── */
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;

    // Add Leaflet CSS dynamically
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

      // attribution tucked bottom-left, small
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L as any).control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeGroup.current = (L as any).layerGroup().addTo(map);
      mapRef.current = map;
    });

    return () => { cancelled = true; };
  }, []);

  /* ── Draw route when selection changes ──────────────────────────── */
  const drawRoute = useCallback(() => {
    if (!mapRef.current || !routeGroup.current) return;
    import('leaflet').then(mod => {
      const L = mod.default ?? mod;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const group = routeGroup.current as any;
      group.clearLayers();
      if (!selected) return;

      const allCoords: [number, number][] = [];

      for (const leg of selected.legs) {
        if (leg.type === 'walk') {
          const a = STOP_COORDS[leg.fromName], b = STOP_COORDS[leg.toName];
          if (a && b) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (L as any).polyline([a, b], { color: '#94A3B8', weight: 2, dashArray: '5,7', opacity: 0.6 }).addTo(group);
            allCoords.push(a, b);
          }
        } else {
          const ride = leg as RideLeg;
          const coords = ride.stops.map(s => STOP_COORDS[s.name]).filter(Boolean) as [number, number][];
          if (coords.length >= 2) {
            const color = MODE_META[ride.mode]?.color ?? '#6366F1';
            // glow pass
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (L as any).polyline(coords, { color, weight: 14, opacity: 0.18, lineCap: 'round', lineJoin: 'round' }).addTo(group);
            // main line
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (L as any).polyline(coords, { color, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(group);
            allCoords.push(...coords);
          }
        }
      }

      // origin / dest markers
      const originC = STOP_COORDS[from], destC = STOP_COORDS[to];
      if (originC) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).circleMarker(originC, { radius: 8, fillColor: '#10B981', fillOpacity: 1, color: '#fff', weight: 2.5 }).addTo(group);
      }
      if (destC) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).circleMarker(destC, { radius: 8, fillColor: '#6366F1', fillOpacity: 1, color: '#fff', weight: 2.5 }).addTo(group);
      }

      if (allCoords.length >= 2) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).fitBounds((L as any).latLngBounds(allCoords), { padding: [80, 40], maxZoom: 15 });
      }
    });
  }, [selected, from, to]);

  useEffect(() => { drawRoute(); }, [drawRoute]);

  /* ── Clear route on home ─────────────────────────────────────────── */
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

  /* ── Search ──────────────────────────────────────────────────────── */
  async function search() {
    const origin = STOP_COORDS[from], dest = STOP_COORDS[to];
    if (!origin || !dest) return;
    setError(null); setModeFilter('all'); setScreen('loading');
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: { lat: origin[0], lng: origin[1] }, destination: { lat: dest[0], lng: dest[1] } }),
      });
      const json = await res.json() as { data?: Itinerary[]; error?: { message: string } };
      if (!res.ok || json.error) { setError(json.error?.message ?? 'No route found.'); setScreen('home'); return; }
      setItineraries(json.data ?? []);
      setScreen('results');
    } catch {
      setError('Network error — check your connection.'); setScreen('home');
    }
  }

  /* ── Styles ──────────────────────────────────────────────────────── */
  const GLOBAL = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
    body{font-family:'Inter',system-ui,sans-serif;}
    select{-webkit-appearance:none;-moz-appearance:none;appearance:none;}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    .fade-in{animation:fadeIn 0.3s ease both;}
    .leaflet-container{font-family:'Inter',system-ui,sans-serif!important;}
    .leaflet-attribution-flag{display:none!important;}
    .leaflet-control-attribution{font-size:9px!important;opacity:0.4!important;background:transparent!important;color:inherit!important;}
  `;

  if (isAuthed === false) return null;

  /* ════════════════════════════════════════════════════════════════
     RENDER — map is always mounted; screens overlay it
  ════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: 'Inter,system-ui,sans-serif', background: C.bg }}>
      <style>{GLOBAL}</style>

      {/* ── Map layer (always present) ───────────────────────────── */}
      <div ref={mapElRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ── Gradient overlay for readability ────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.45) 100%)',
      }} />

      {/* ════════ HOME ════════ */}
      {screen === 'home' && (
        <>
          {/* Top bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '48px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Para</span>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>Po</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(99,102,241,0.5)', borderRadius: 20, padding: '3px 8px', letterSpacing: '0.05em' }}>BETA</span>
            </div>
          </div>

          {/* Bottom sheet — home */}
          <Sheet height="auto" style={{ maxHeight: '55vh' }}>
            <div style={{ overflowY: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.error }}>
                  {error}
                </div>
              )}

              {/* From / To card */}
              <GlassCard style={{ overflow: 'hidden' }}>
                <div style={{ borderBottom: `1px solid ${C.glassBorder}` }}>
                  <StopRow icon={<GreenDot />} value={from} onChange={setFrom} placeholder="From stop" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <StopRow icon={<PurpleDot />} value={to} onChange={setTo} placeholder="To stop" />
                  </div>
                  <button onClick={() => { const t = from; setFrom(to); setTo(t); }} style={{ marginRight: 10, background: 'none', border: `1px solid ${C.glassBorder}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5l4-4 4 4M11 9l-4 4-4-4" /></svg>
                  </button>
                </div>
              </GlassCard>

              {/* Rush toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: rush ? 'rgba(99,102,241,0.08)' : C.glass, border: `1px solid ${rush ? 'rgba(99,102,241,0.25)' : C.glassBorder}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink }}>Rush hour</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>7–9 am · 5–7 pm</p>
                </div>
                <button onClick={() => setRush(!rush)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
                  <div style={{ width: 44, height: 26, borderRadius: 13, background: rush ? '#6366F1' : C.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: rush ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
                  </div>
                </button>
              </div>

              {/* CTA */}
              <button
                onClick={search}
                disabled={!from || !to || from === to}
                style={{
                  width: '100%', border: 'none', borderRadius: 12, padding: '15px',
                  fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
                  cursor: from && to && from !== to ? 'pointer' : 'default',
                  background: from && to && from !== to ? 'var(--gradient-primary)' : C.card,
                  color: from && to && from !== to ? '#fff' : C.muted,
                  boxShadow: from && to && from !== to ? '0 4px 20px rgba(99,102,241,0.35)' : 'none',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >
                Find routes
              </button>

              {/* Fare reference */}
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', margin: '4px 0 10px' }}>2024 FARE RATES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  {Object.entries(FARE_REF).map(([mode, ref], i, a) => {
                    const meta = MODE_META[mode];
                    return (
                      <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: C.surface, borderBottom: i < a.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <div style={{ width: 3, height: 28, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.ink }}>{meta.icon} {meta.label}</p>
                          <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{ref}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>LTFRB-approved rates · Per boarding, not per segment</p>
              </div>
            </div>
          </Sheet>
        </>
      )}

      {/* ════════ LOADING ════════ */}
      {screen === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GlassCard style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>Calculating routes…</p>
          </GlassCard>
        </div>
      )}

      {/* ════════ RESULTS ════════ */}
      {screen === 'results' && (() => {
        const filtered = itineraries.filter(itin => matchesFilter(itin, modeFilter));
        const modeFilters: { key: ModeFilter; label: string }[] = [
          { key: 'all', label: 'All routes' },
          { key: 'train', label: '🚇 Train' },
          { key: 'bus', label: '🚌 Bus' },
          { key: 'jeepney', label: '🚐 Jeepney' },
        ];
        return (
          <>
            {/* Back button + trip summary */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '48px 16px 0' }}>
              <button onClick={() => { setScreen('home'); setItineraries([]); setSelected(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 500 }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 3l-6 5 6 5"/></svg>
                Back
              </button>
              <GlassCard style={{ marginTop: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <GreenDot />
                  <div style={{ width: 1, height: 12, background: C.border }} />
                  <PurpleDot />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.ink }}>{from}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 500, color: C.ink }}>{to}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: rush ? C.accent : C.green, background: rush ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', padding: '3px 8px', borderRadius: 10 }}>
                  {rush ? 'Rush' : 'Clear'}
                </span>
              </GlassCard>
            </div>

            {/* Results sheet */}
            <Sheet height="62vh">
              {/* filter chips */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 20px', overflowX: 'auto', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
                {modeFilters.map(f => (
                  <button key={f.key} onClick={() => setModeFilter(f.key)} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: modeFilter === f.key ? 'var(--gradient-primary)' : C.glass,
                    color: modeFilter === f.key ? '#fff' : C.body,
                    border: `1px solid ${modeFilter === f.key ? 'transparent' : C.glassBorder}`,
                    whiteSpace: 'nowrap', fontFamily: 'inherit', transition: 'all 0.15s',
                    boxShadow: modeFilter === f.key ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                  }}>{f.label}</button>
                ))}
              </div>

              {/* route cards */}
              <div className="fade-in" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 8 }}>No {modeFilter === 'all' ? '' : modeFilter + ' '}routes</p>
                    <p style={{ fontSize: 13, color: C.muted }}>Try a different filter or select stops farther apart.</p>
                  </div>
                ) : filtered.map((itin, idx) => {
                  const rides = rideLegs(itin);
                  const color = primaryColor(itin);
                  return (
                    <button key={idx} onClick={() => { setSelected(itin); setScreen('detail'); }}
                      style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block', overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 1px ${color}40`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      {/* top accent bar */}
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
                      <div style={{ padding: '14px 16px' }}>
                        {/* header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ fontSize: 34, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>{itin.totalDurationMin}</span>
                              <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>min</span>
                            </div>
                            <p style={{ margin: '3px 0 0', fontSize: 11, color: C.muted }}>
                              {itin.transfers} transfer{itin.transfers !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.03em' }}>₱{itin.totalFare.toFixed(2)}</p>
                            <span style={{ fontSize: 10, fontWeight: 700, background: `${color}15`, color, borderRadius: 20, padding: '2px 8px', letterSpacing: '0.04em' }}>
                              {OBJ_LABEL[itin.objective] ?? itin.objective}
                            </span>
                          </div>
                        </div>
                        {/* mode pills */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
                          {rides.length === 0
                            ? <span style={{ fontSize: 11, color: C.muted }}>Walk only</span>
                            : rides.map((leg, li) => <ModePill key={li} mode={leg.mode} />)}
                        </div>
                        {/* journey bar */}
                        <JourneyBar itin={itin} />
                        {/* per-leg fare */}
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                          {rides.map((leg, li) => (
                            <div key={li} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.body, marginBottom: 2 }}>
                              <span>{MODE_META[leg.mode]?.icon} {leg.line.name} · {leg.from.name} → {leg.to.name}</span>
                              <span style={{ fontWeight: 700, color: C.ink, marginLeft: 8, flexShrink: 0 }}>₱{leg.fare.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
                <p style={{ fontSize: 10, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
                  Fares per person per boarding · LTFRB 2024 · Walk legs free
                </p>
              </div>
            </Sheet>
          </>
        );
      })()}

      {/* ════════ DETAIL ════════ */}
      {screen === 'detail' && selected && (() => {
        const color = primaryColor(selected);
        const lastRide = [...selected.legs].reverse().find(l => l.type === 'ride') as RideLeg | undefined;
        const destName = lastRide?.to.name ?? to;
        const destCoords = STOP_COORDS[destName];
        const wazeUrl = destCoords
          ? `https://waze.com/ul?ll=${destCoords[0]},${destCoords[1]}&navigate=yes&utm_source=parapo`
          : `https://waze.com/ul?q=${encodeURIComponent(destName + ' Metro Manila')}&navigate=yes&utm_source=parapo`;

        return (
          <>
            {/* Back button */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '48px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setScreen('results')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 500 }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 3l-6 5 6 5"/></svg>
                Routes
              </button>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: `${color}80`, border: `1px solid ${color}`, borderRadius: 20, padding: '4px 10px', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                {OBJ_LABEL[selected.objective] ?? selected.objective}
              </span>
            </div>

            {/* Detail sheet */}
            <Sheet height="68vh">
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Summary tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px 10px' }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em' }}>TOTAL TIME</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span style={{ fontSize: 38, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>{selected.totalDurationMin}</span>
                      <span style={{ fontSize: 13, color: C.muted }}>min</span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: C.muted }}>{selected.transfers} transfer{selected.transfers !== 1 ? 's' : ''}</p>
                  </div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em' }}>TOTAL FARE</p>
                    <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>₱{selected.totalFare.toFixed(2)}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: C.muted }}>per person</p>
                  </div>
                </div>

                {/* Journey bar full width */}
                <div style={{ padding: '0 16px 12px' }}><JourneyBar itin={selected} /></div>

                {/* Step by step */}
                <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', padding: '0 16px', marginBottom: 8 }}>STEP BY STEP</p>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', margin: '0 16px 16px', background: C.card }}>
                  {selected.legs.map((leg, i) => {
                    const isLast = i === selected.legs.length - 1;
                    const divStyle = !isLast ? { borderBottom: `1px solid ${C.border}` } : {};
                    if (leg.type === 'walk') return (
                      <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start', ...divStyle }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>🚶</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.ink }}>Walk to {leg.toName}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.muted }}>{leg.durationMin} min · {leg.distKm.toFixed(2)} km</p>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Free</span>
                      </div>
                    );
                    const ride = leg as RideLeg;
                    const meta = MODE_META[ride.mode] ?? { label: ride.mode, color: '#6366F1', icon: '🚌' };
                    return (
                      <div key={i} style={divStyle}>
                        <div style={{ display: 'flex', gap: 12, padding: '12px 14px 8px', alignItems: 'flex-start' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${meta.color}18`, border: `1px solid ${meta.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>{meta.icon}</div>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.ink }}>{ride.line.name}</p>
                            <p style={{ margin: '1px 0 0', fontSize: 12, color: C.body }}>{ride.from.name} → {ride.to.name}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.muted }}>{ride.stops.length} stop{ride.stops.length !== 1 ? 's' : ''} · {ride.durationMin} min · {ride.distKm.toFixed(1)} km</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: meta.color }}>₱{ride.fare.toFixed(2)}</p>
                            <p style={{ margin: '1px 0 0', fontSize: 10, color: C.muted }}>1 boarding</p>
                          </div>
                        </div>
                        {ride.stops.length > 2 && (
                          <div style={{ margin: '0 14px 10px 56px', padding: '7px 10px', background: C.cardEl, borderRadius: 8, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                            {ride.stops.slice(0, -1).map((s, si) => (
                              <span key={si}>{s.name}{si < ride.stops.length - 2 ? ' → ' : ''}</span>
                            ))}
                            <span style={{ fontWeight: 600, color: C.body }}> → {ride.stops[ride.stops.length - 1].name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Fare breakdown */}
                <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', padding: '0 16px', marginBottom: 8 }}>FARE BREAKDOWN</p>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', margin: '0 16px 16px' }}>
                  {selected.legs.map((leg, i) => {
                    const isLast = i === selected.legs.length - 1;
                    if (leg.type === 'walk') return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: isLast ? 'none' : `1px solid ${C.border}`, background: C.card }}>
                        <span style={{ fontSize: 12, color: C.muted }}>🚶 Walk · {leg.distKm.toFixed(2)} km</span>
                        <span style={{ fontSize: 12, color: C.muted }}>Free</span>
                      </div>
                    );
                    const ride = leg as RideLeg;
                    const meta = MODE_META[ride.mode] ?? { label: ride.mode, color: '#6366F1', icon: '🚌' };
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: isLast ? 'none' : `1px solid ${C.border}`, background: C.card }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: C.ink, fontWeight: 500 }}>{meta.icon} {meta.label}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>{ride.distKm.toFixed(1)} km</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>₱{ride.fare.toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: C.cardEl, borderTop: `1.5px solid ${C.border}` }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Total per person</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color }}>₱{selected.totalFare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a href={wazeUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#00B0FF', color: '#fff', borderRadius: 12, padding: '14px',
                    fontSize: 15, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 6.63C19.44 3.23 16.22 1 12 1 6.48 1 2 5.48 2 11c0 2.76 1.12 5.26 2.93 7.08C5.78 19 6 19.93 6 21v1h12v-1c0-1.07.22-2 1.07-2.92C20.88 16.26 22 13.76 22 11c0-1.57-.53-3.04-1.46-4.37z"/></svg>
                    Navigate with Waze
                  </a>
                  <button onClick={() => {
                    try { sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(selected)); } catch { /* noop */ }
                    router.push('/trip');
                  }} style={{
                    width: '100%', border: 'none', borderRadius: 12, padding: '14px',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--gradient-primary)', color: '#fff',
                    boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
                  }}>
                    Start trip — track live
                  </button>
                  <button onClick={() => { setFrom(''); setTo(''); setSelected(null); setItineraries([]); setScreen('home'); }} style={{
                    width: '100%', background: C.card, color: C.ink, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
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
