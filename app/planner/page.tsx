'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';

const C = {
  bg:      'var(--color-bg)',
  surface: 'var(--color-surface)',
  card:    'var(--color-card)',
  border:  'var(--color-border)',
  muted:   'var(--color-muted)',
  body:    'var(--color-body)',
  ink:     'var(--color-ink)',
  accent:  'var(--color-accent)',
  green:   'var(--color-green)',
  blue:    'var(--color-blue)',
};

const MODE_META: Record<string, { label: string; color: string; icon: string }> = {
  mrt:     { label: 'MRT-3',   color: '#1A5FA8', icon: '🚇' },
  lrt:     { label: 'LRT',     color: '#2A9D8F', icon: '🚈' },
  bus:     { label: 'Bus',     color: '#D05A28', icon: '🚌' },
  jeepney: { label: 'Jeepney', color: '#B8962E', icon: '🚐' },
  walk:    { label: 'Walk',    color: '#A89E8E', icon: '🚶' },
};

// 2024 fare reference (shown on UI for transparency)
const FARE_REF: Record<string, string> = {
  mrt:     '₱13 min · ₱0.94/km',
  lrt:     '₱12 min · ₱0.89/km',
  bus:     '₱15 for 5km · ₱2.65/km',
  jeepney: '₱14 for 4km · ₱1.80/km',
};

const STOP_COORDS: Record<string, [number, number]> = {
  'Taft Avenue (MRT)':     [14.5395, 120.9985],
  'Magallanes':            [14.5401, 121.0038],
  'Ayala':                 [14.5487, 121.0279],
  'Buendia':               [14.5536, 121.0347],
  'Guadalupe':             [14.5658, 121.0469],
  'Ortigas (MRT)':         [14.5876, 121.0583],
  'Shaw Blvd':             [14.5811, 121.0543],
  'Boni':                  [14.5762, 121.0477],
  'Cubao (MRT)':           [14.6228, 121.0526],
  'GMA-Kamuning':          [14.6378, 121.0484],
  'Quezon Ave (MRT)':      [14.6449, 121.0403],
  'North Avenue':          [14.6521, 121.0322],
  'Recto':                 [14.5987, 120.9844],
  'Cubao (LRT-2)':         [14.6224, 121.0524],
  'Katipunan (LRT-2)':     [14.6284, 121.0731],
  'Antipolo':              [14.6249, 121.1240],
  'Monumento (Bus)':       [14.6543, 120.9840],
  'Trinoma':               [14.6520, 121.0320],
  'Cubao (Bus)':           [14.6197, 121.0510],
  'Ortigas (Bus)':         [14.5870, 121.0576],
  'Taft Ave (Bus)':        [14.5545, 120.9942],
  'Katipunan LRT2 (Jeep)': [14.6284, 121.0730],
  'UP Diliman':            [14.6540, 121.0685],
  'Tandang Sora':          [14.6820, 121.0440],
};

const ALL_STOPS = Object.keys(STOP_COORDS).sort();

type WalkLeg = {
  type: 'walk'; fromName: string; toName: string;
  distKm: number; durationMin: number;
};
type RideLeg = {
  type: 'ride'; mode: string;
  line: { id: number; name: string; color: string };
  from: { name: string }; to: { name: string };
  stops: { name: string }[];
  distKm: number; durationMin: number; fare: number;
};
type Leg = WalkLeg | RideLeg;
type Itinerary = {
  legs: Leg[]; totalDurationMin: number; totalFare: number;
  transfers: number; objective: string;
};

type Screen = 'home' | 'loading' | 'results' | 'detail';
type ModeFilter = 'all' | 'train' | 'bus' | 'jeepney';

function rideLegsOf(itin: Itinerary): RideLeg[] {
  return itin.legs.filter(l => l.type === 'ride') as RideLeg[];
}

function matchesFilter(itin: Itinerary, f: ModeFilter): boolean {
  if (f === 'all') return true;
  const modes = rideLegsOf(itin).map(l => l.mode);
  if (f === 'train') return modes.some(m => m === 'mrt' || m === 'lrt');
  if (f === 'bus') return modes.some(m => m === 'bus');
  if (f === 'jeepney') return modes.some(m => m === 'jeepney');
  return true;
}

function primaryColor(itin: Itinerary): string {
  const first = rideLegsOf(itin)[0];
  return first ? (MODE_META[first.mode]?.color ?? C.accent) : C.accent;
}

const OBJ_LABEL: Record<string, string> = {
  fastest: 'Fastest', fewest_transfers: 'Least transfers', cheapest: 'Cheapest',
};

// ── Nav ───────────────────────────────────────────────────────────────────────
function NavBar({ onBack, label }: { onBack?: () => void; label?: string }) {
  return (
    <div style={{ height: 52, background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4, color: C.ink }}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 4l-7 6 7 6" /></svg>
        </button>
      )}
      <span style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{label || 'ParaPo'}</span>
      {!onBack && <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, background: C.card, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.04em' }}>BETA</span>}
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: active ? 600 : 400,
      background: active ? C.ink : C.surface, color: active ? '#fff' : C.body,
      border: `1px solid ${active ? C.ink : C.border}`, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Planner() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('home');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rush, setRush] = useState(() => { const h = new Date().getHours(); return (h >= 7 && h <= 9) || (h >= 17 && h <= 19); });
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selected, setSelected] = useState<Itinerary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const origin = STOP_COORDS[from];
    const dest = STOP_COORDS[to];
    if (!origin || !dest) return;
    setError(null);
    setModeFilter('all');
    setScreen('loading');
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: { lat: origin[0], lng: origin[1] }, destination: { lat: dest[0], lng: dest[1] } }),
      });
      const json = await res.json() as { data?: Itinerary[]; error?: { message: string } };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'No route found between those stops.');
        setScreen('home');
        return;
      }
      setItineraries(json.data ?? []);
      setScreen('results');
    } catch {
      setError('Network error — check your connection.');
      setScreen('home');
    }
  }

  // ── HOME ─────────────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: 'Inter,-apple-system,sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}select{-webkit-appearance:none;}`}</style>
      <NavBar />

      <div style={{ padding: '24px 20px 0', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Where are you headed?</p>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px' }}>Exact 2024 PH fare rates · Real multimodal routes</p>

        {error && (
          <div style={{ background: 'color-mix(in srgb, var(--color-error) 12%, var(--color-surface))', border: `1px solid var(--color-error)`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        {/* From / To */}
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${C.green}`, background: C.surface, flexShrink: 0 }} />
            <select value={from} onChange={e => setFrom(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '14px 0', fontSize: 15, color: from ? C.ink : C.muted, fontFamily: 'inherit', fontWeight: from ? 500 : 400, cursor: 'pointer' }}>
              <option value="">From stop</option>
              {ALL_STOPS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.accent, flexShrink: 0 }} />
            <select value={to} onChange={e => setTo(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '14px 0', fontSize: 15, color: to ? C.ink : C.muted, fontFamily: 'inherit', fontWeight: to ? 500 : 400, cursor: 'pointer' }}>
              <option value="">To stop</option>
              {ALL_STOPS.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => { const t = from; setFrom(to); setTo(t); }} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5l4-4 4 4M11 9l-4 4-4-4" /></svg>
            </button>
          </div>
        </div>

        {/* Rush toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: rush ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : C.card, border: `1px solid ${rush ? 'color-mix(in srgb, var(--color-accent) 30%, var(--color-border))' : C.border}`, marginBottom: 20 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.ink }}>Rush hour</p>
            <p style={{ margin: 0, fontSize: 12, color: C.muted }}>7–9 am · 5–7 pm (slower speeds)</p>
          </div>
          <button onClick={() => setRush(!rush)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
            <span style={{ fontSize: 12, color: rush ? C.accent : C.muted, fontWeight: 500 }}>{rush ? 'On' : 'Off'}</span>
            <div style={{ width: 42, height: 24, borderRadius: 12, background: rush ? C.accent : C.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: C.surface, position: 'absolute', top: 3, left: rush ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
            </div>
          </button>
        </div>

        <button
          onClick={search}
          disabled={!from || !to || from === to}
          style={{ width: '100%', background: from && to && from !== to ? C.ink : C.border, color: 'var(--color-surface)', border: 'none', borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', cursor: from && to && from !== to ? 'pointer' : 'default', marginBottom: 24, transition: 'background 0.15s', fontFamily: 'inherit' }}
        >
          Find routes
        </button>
      </div>

      {/* Fare reference */}
      <div style={{ flex: 1, padding: '20px 20px 32px' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', margin: '0 0 12px' }}>2024 FARE RATES</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.surface }}>
          {Object.entries(FARE_REF).map(([mode, ref], i, a) => {
            const meta = MODE_META[mode];
            return (
              <div key={mode} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: C.surface, borderBottom: i < a.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ width: 4, height: 32, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink }}>{meta.icon} {meta.label}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{ref}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 0', lineHeight: 1.6 }}>
          LTFRB-approved rates · Exact per-boarding fare, not per-segment
        </p>
      </div>
    </div>
  );

  // ── LOADING ───────────────────────────────────────────────────────────────────
  if (screen === 'loading') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: 'Inter,-apple-system,sans-serif', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Calculating routes…</p>
    </div>
  );

  // ── RESULTS ───────────────────────────────────────────────────────────────────
  if (screen === 'results') {
    const filtered = itineraries.filter(itin => matchesFilter(itin, modeFilter));
    const modeFilters: { key: ModeFilter; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'train', label: '🚇 Train' },
      { key: 'bus', label: '🚌 Bus' },
      { key: 'jeepney', label: '🚐 Jeepney' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: 'Inter,-apple-system,sans-serif' }}>
        <NavBar onBack={() => setScreen('home')} label="Route options" />

        {/* Trip strip */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${C.green}`, background: C.surface }} />
            <div style={{ width: 1, height: 14, background: C.border }} />
            <div style={{ width: 8, height: 8, borderRadius: 2, background: C.accent }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.ink }}>{from}</p>
            <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 500, color: C.ink }}>{to}</p>
          </div>
          <span style={{ fontSize: 12, color: rush ? C.accent : C.green, fontWeight: 500, background: rush ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))' : 'color-mix(in srgb, var(--color-green) 12%, var(--color-surface))', padding: '2px 8px', borderRadius: 10 }}>{rush ? 'Rush' : 'Normal'}</span>
        </div>

        {/* Mode filter */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {modeFilters.map(f => (
            <Chip key={f.key} label={f.label} active={modeFilter === f.key} onClick={() => setModeFilter(f.key)} />
          ))}
        </div>

        <div style={{ flex: 1, padding: '16px 20px 32px', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, margin: '0 0 8px' }}>No {modeFilter === 'all' ? '' : modeFilter + ' '}routes found</p>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                {modeFilter !== 'all' ? 'Try "All" or pick a different filter.' : 'Try stops that are farther apart or on different lines.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((itin, idx) => {
                const rides = rideLegsOf(itin);
                const color = primaryColor(itin);
                const modeIcons = rides.map(l => MODE_META[l.mode]?.icon ?? '').join(' → ');
                return (
                  <button key={idx} onClick={() => { setSelected(itin); setScreen('detail'); }}
                    style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block', overflow: 'hidden', transition: 'box-shadow 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                    {/* Color bar */}
                    <div style={{ height: 4, background: color }} />
                    <div style={{ padding: '16px' }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>{itin.totalDurationMin} <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>min</span></p>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>{itin.transfers} transfer{itin.transfers !== 1 ? 's' : ''}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: color }}>₱{itin.totalFare.toFixed(2)}</p>
                          <span style={{ fontSize: 10, fontWeight: 600, background: `${color}18`, color, borderRadius: 6, padding: '2px 8px' }}>
                            {OBJ_LABEL[itin.objective] ?? itin.objective}
                          </span>
                        </div>
                      </div>

                      {/* Mode pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {rides.map((leg, li) => {
                          const meta = MODE_META[leg.mode] ?? { label: leg.mode, color: C.muted, icon: '' };
                          return (
                            <span key={li} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: `${meta.color}18`, border: `1px solid ${meta.color}40`, fontSize: 12, fontWeight: 600, color: meta.color }}>
                              {meta.icon} {meta.label}
                            </span>
                          );
                        })}
                        {modeIcons && rides.length === 0 && (
                          <span style={{ fontSize: 12, color: C.muted }}>Walk only</span>
                        )}
                      </div>

                      {/* Per-leg fare breakdown */}
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                        {rides.map((leg, li) => (
                          <div key={li} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.body, marginBottom: 3 }}>
                            <span>{MODE_META[leg.mode]?.icon} {leg.line.name} · {leg.from.name} → {leg.to.name}</span>
                            <span style={{ fontWeight: 600, color: C.ink, flexShrink: 0, marginLeft: 8 }}>₱{leg.fare.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p style={{ fontSize: 11, color: C.muted, margin: '20px 0 0', textAlign: 'center', lineHeight: 1.6 }}>
            Fares are per person per boarding · LTFRB 2024 rates · Walk legs are free
          </p>
        </div>
      </div>
    );
  }

  // ── DETAIL ────────────────────────────────────────────────────────────────────
  if (!selected) return null;
  const detailColor = primaryColor(selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: 'Inter,-apple-system,sans-serif' }}>
      <NavBar onBack={() => setScreen('results')} label="Trip details" />
      <div style={{ height: 4, background: detailColor }} />

      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.06em' }}>TOTAL TIME</p>
            <p style={{ margin: 0, fontSize: 40, fontWeight: 700, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>{selected.totalDurationMin}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>minutes · {selected.transfers} transfer{selected.transfers !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.06em' }}>TOTAL FARE</p>
            <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: detailColor, letterSpacing: '-0.03em', lineHeight: 1 }}>₱{selected.totalFare.toFixed(2)}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>per person</p>
          </div>
        </div>

        {/* Step-by-step */}
        <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', margin: '0 0 10px' }}>STEP BY STEP</p>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.surface, marginBottom: 20 }}>
          {selected.legs.map((leg, i) => {
            const isLast = i === selected.legs.length - 1;
            const divider = !isLast ? `1px solid ${C.border}` : 'none';

            if (leg.type === 'walk') {
              return (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderBottom: divider, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, fontSize: 15 }}>🚶</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.ink }}>Walk to {leg.toName}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>{leg.durationMin} min · {leg.distKm.toFixed(2)} km</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, flexShrink: 0 }}>Free</span>
                </div>
              );
            }

            const ride = leg as RideLeg;
            const meta = MODE_META[ride.mode] ?? { label: ride.mode, color: C.muted, icon: '🚌' };
            return (
              <div key={i} style={{ borderBottom: divider }}>
                {/* Leg header */}
                <div style={{ display: 'flex', gap: 14, padding: '14px 16px 10px', alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, fontSize: 16 }}>{meta.icon}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink }}>{ride.line.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: C.body }}>{ride.from.name} → {ride.to.name}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>
                      {ride.stops.length} stop{ride.stops.length !== 1 ? 's' : ''} · {ride.durationMin} min · {ride.distKm.toFixed(1)} km
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: meta.color }}>₱{ride.fare.toFixed(2)}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: C.muted }}>1 boarding</p>
                  </div>
                </div>
                {/* Stop list (collapsed to first/last + count) */}
                {ride.stops.length > 2 && (
                  <div style={{ margin: '0 16px 12px 60px', padding: '8px 12px', background: C.card, borderRadius: 8, fontSize: 12, color: C.muted }}>
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
        <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', margin: '0 0 10px' }}>FARE BREAKDOWN</p>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.surface, marginBottom: 24 }}>
          {selected.legs.map((leg, i) => {
            const isLast = i === selected.legs.length - 1;
            if (leg.type === 'walk') {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Walk · {leg.distKm.toFixed(2)} km</span>
                  <span style={{ fontSize: 13, color: C.muted }}>Free</span>
                </div>
              );
            }
            const ride = leg as RideLeg;
            const meta = MODE_META[ride.mode] ?? { label: ride.mode, color: C.muted, icon: '🚌' };
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
                <div>
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{meta.icon} {meta.label}</span>
                  <span style={{ fontSize: 12, color: C.muted, marginLeft: 6 }}>{ride.distKm.toFixed(1)} km</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>₱{ride.fare.toFixed(2)}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', background: C.card, borderTop: `1.5px solid ${C.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Total per person</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: detailColor }}>₱{selected.totalFare.toFixed(2)}</span>
          </div>
        </div>

        {/* Navigate with Waze — sends destination coordinate to Waze (best-effort, additive) */}
        {(() => {
          const lastRideLeg = [...selected.legs].reverse().find(l => l.type === 'ride') as RideLeg | undefined;
          const dest = lastRideLeg ? { name: lastRideLeg.to.name } : null;
          if (!dest) return null;
          const destCoords = STOP_COORDS[dest.name];
          const wazeUrl = destCoords
            ? `https://waze.com/ul?ll=${destCoords[0]},${destCoords[1]}&navigate=yes&utm_source=parapo`
            : `https://waze.com/ul?q=${encodeURIComponent(dest.name + ' Metro Manila')}&navigate=yes&utm_source=parapo`;
          return (
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', background: '#00B0FF', color: '#fff', borderRadius: 10,
                padding: '15px', fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                textDecoration: 'none', fontFamily: 'inherit', marginBottom: 12,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.54 6.63C19.44 3.23 16.22 1 12 1 6.48 1 2 5.48 2 11c0 2.76 1.12 5.26 2.93 7.08C5.78 19 6 19.93 6 21v1h12v-1c0-1.07.22-2 1.07-2.92C20.88 16.26 22 13.76 22 11c0-1.57-.53-3.04-1.46-4.37z"/>
              </svg>
              Navigate with Waze
            </a>
          );
        })()}

        {/* Start Trip (F15) */}
        <button
          onClick={() => {
            try { sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(selected)); } catch { /* noop */ }
            router.push('/trip');
          }}
          style={{ width: '100%', background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em', fontFamily: 'inherit', marginBottom: 12 }}
        >
          🗺️ Start trip — track live
        </button>

        <button onClick={() => { setFrom(''); setTo(''); setSelected(null); setItineraries([]); setScreen('home'); }}
          style={{ width: '100%', background: C.ink, color: '#fff', border: 'none', borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em', fontFamily: 'inherit' }}>
          Plan another trip
        </button>
      </div>
    </div>
  );
}
