'use client';
import { useState } from 'react';

const UI = {
  bg: '#050913',
  surface: '#0b1320',
  card: '#111926',
  border: 'rgba(255,255,255,0.12)',
  muted: '#94a3b8',
  ink: '#e2e8f0',
  accent: '#2563eb',
  accent2: '#22c55e',
  glass: 'rgba(255,255,255,0.05)',
  glassBorder: 'rgba(255,255,255,0.1)',
};

const VEHICLES = [
  { id: 'bus', label: 'EDSA Bus', sub: 'Carousel rapid bus', speedN: 22, speedR: 12, fareBase: 13, fareKm: 2.2, color: '#f97316' },
  { id: 'jeepney', label: 'Jeepney', sub: 'Katipunan route', speedN: 18, speedR: 10, fareBase: 11, fareKm: 1.8, color: '#eab308' },
  { id: 'uv', label: 'UV Express', sub: 'Air-conditioned van', speedN: 28, speedR: 16, fareBase: 18, fareKm: 3.2, color: '#10b981' },
  { id: 'mrt', label: 'MRT / LRT', sub: 'Fastest — rail only', speedN: 45, speedR: 40, fareBase: 15, fareKm: 1.5, color: '#6366f1' },
];

const STOPS_EDSA = ['Monumento', 'Balintawak', 'Trinoma', 'Quezon Ave', 'Cubao', 'Ortigas', 'Guadalupe', 'Magallanes', 'Taft Ave'];
const STOPS_KATIP = ['Katipunan LRT2', 'Ateneo Gate', 'UP Diliman', 'Balara', 'Tandang Sora'];
const ALL_STOPS = [...STOPS_EDSA, ...STOPS_KATIP];

const STOP_COORDS: Record<string, [number, number]> = {
  Monumento: [14.6543, 120.984],
  Balintawak: [14.651, 120.9842],
  Trinoma: [14.652, 121.032],
  'Quezon Ave': [14.6448, 121.038],
  Cubao: [14.6197, 121.051],
  Ortigas: [14.5875, 121.0584],
  Guadalupe: [14.567, 121.0469],
  Magallanes: [14.5402, 121.0039],
  'Taft Ave': [14.5545, 120.9942],
  'Katipunan LRT2': [14.6284, 121.073],
  'Ateneo Gate': [14.6395, 121.0775],
  'UP Diliman': [14.654, 121.0685],
  Balara: [14.67, 121.072],
  'Tandang Sora': [14.682, 121.044],
};

function hav(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function getDist(from: string, to: string) {
  const iA = STOPS_EDSA.indexOf(from);
  const iB = STOPS_EDSA.indexOf(to);
  if (iA !== -1 && iB !== -1) {
    const lo = Math.min(iA, iB);
    const hi = Math.max(iA, iB);
    let d = 0;
    for (let i = lo; i < hi; i += 1) d += hav(STOP_COORDS[STOPS_EDSA[i]], STOP_COORDS[STOPS_EDSA[i + 1]]);
    return Math.round(d * 10) / 10;
  }
  const a = STOP_COORDS[from];
  const b = STOP_COORDS[to];
  return a && b ? Math.round(hav(a, b) * 10) / 10 : 5;
}

type Screen = 'home' | 'pick' | 'result';
type Vehicle = typeof VEHICLES[0];

const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
html,body{min-height:100%;}
body{font-family:'Inter',system-ui,sans-serif;background:${UI.bg};color:${UI.ink};}
button,select{font:inherit;}
select{appearance:none;background:transparent;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.fade-in{animation:fadeIn 0.28s ease both;}
`;

function InputField({
  label,
  value,
  onChange,
  icon,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: string;
  placeholder: string;
}) {
  return (
    <label style={{ display: 'grid', gap: 8, fontSize: 12, color: UI.muted }}>
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 20, background: UI.glass, border: `1px solid ${UI.glassBorder}` }}>
        <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.08)', color: UI.accent, fontWeight: 700 }}>{icon}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', color: UI.ink, fontSize: 15, background: 'transparent', cursor: 'pointer' }}
        >
          <option value="">{placeholder}</option>
          {ALL_STOPS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: 22, borderRadius: 32, background: UI.glass, border: `1px solid ${UI.glassBorder}`, boxShadow: '0 24px 80px rgba(0,0,0,0.18)', ...style }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ padding: 18, borderRadius: 24, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: UI.muted }}>{label}</p>
      <p style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 800, color: accent }}>{value}</p>
    </div>
  );
}

export default function DesignD() {
  const [screen, setScreen] = useState<Screen>('home');
  const [from, setFrom] = useState('Katipunan LRT2');
  const [to, setTo] = useState('UP Diliman');
  const [vehicle, setVehicle] = useState<Vehicle | null>(VEHICLES[0]);
  const [rush, setRush] = useState(() => {
    const h = new Date().getHours();
    return (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
  });
  const [dist, setDist] = useState(() => getDist('Katipunan LRT2', 'UP Diliman'));

  const eta = vehicle ? Math.round((dist / (rush ? vehicle.speedR : vehicle.speedN)) * 60) : 0;
  const fare = vehicle ? Math.round((vehicle.fareBase + dist * vehicle.fareKm) * 100) / 100 : 0;
  const canPlan = Boolean(from && to && from !== to);

  if (screen === 'home') return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top, rgba(37,99,235,0.18), transparent 28%), linear-gradient(180deg, #050913 0%, #02040a 100%)', color: UI.ink }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 28 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.24em', color: '#60a5fa' }}>ROUTE PLANNER</p>
            <h1 style={{ margin: '12px 0 0', fontSize: 34, lineHeight: 1.05, fontWeight: 800, color: '#f8fafc' }}>Circuit smart navigation for everyday commutes</h1>
          </div>
          <div style={{ width: 54, height: 54, borderRadius: 18, background: 'rgba(255,255,255,0.08)', border: `1px solid ${UI.glassBorder}`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>A</div>
        </div>

        <Card style={{ display: 'grid', gap: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.18em', color: UI.muted }}>Plan your trip</p>
              <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Find the fastest route with clear travel insights.</p>
            </div>
            <span style={{ padding: '10px 16px', borderRadius: 22, background: 'rgba(255,255,255,0.08)', border: `1px solid ${UI.glassBorder}`, fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>Simulation</span>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <InputField label='From' value={from} onChange={setFrom} icon='A' placeholder='Start stop' />
            <InputField label='To' value={to} onChange={setTo} icon='B' placeholder='Destination' />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button onClick={() => setRush(!rush)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 22, background: rush ? '#2563eb' : 'rgba(255,255,255,0.08)', border: `1px solid ${UI.glassBorder}`, color: '#fff', cursor: 'pointer' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: rush ? '#93c5fd' : 'transparent', border: rush ? 'none' : '1px solid #7c3aed' }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>{rush ? 'Rush hour' : 'Off-peak'}</span>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color: UI.muted, fontSize: 13 }}>
              <span>Traffic profile</span>
              <span>{rush ? 'Peak congestion' : 'Calmer roads'}</span>
            </div>
            <button onClick={() => {
              if (canPlan) {
                setDist(getDist(from, to));
                setVehicle(VEHICLES[0]);
                setScreen('pick');
              }
            }}
              disabled={!canPlan}
              style={{ marginLeft: 'auto', padding: '14px 22px', borderRadius: 24, background: canPlan ? '#2563eb' : 'rgba(255,255,255,0.08)', border: 'none', color: canPlan ? '#fff' : '#94a3b8', fontWeight: 700, cursor: canPlan ? 'pointer' : 'not-allowed' }}>
              View routes
            </button>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 24 }}>
          <StatCard label='Distance' value={`${dist.toFixed(1)} km`} accent='#38bdf8' />
          <StatCard label='Fare estimate' value={`₱${fare.toFixed(2)}`} accent='#22c55e' />
        </div>

        <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
          {VEHICLES.map((v) => {
            const spd = rush ? v.speedR : v.speedN;
            const mins = Math.round((dist / spd) * 60);
            const estFare = Math.round((v.fareBase + dist * v.fareKm) * 100) / 100;
            return (
              <button key={v.id} onClick={() => { setVehicle(v); setScreen('pick'); }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 18, borderRadius: 24, background: 'rgba(255,255,255,0.05)', border: `1px solid ${UI.glassBorder}`, cursor: 'pointer', textAlign: 'left' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{v.label}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: UI.muted }}>{v.sub}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: v.color }}>{mins} min</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: UI.muted }}>₱{estFare.toFixed(2)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
          <div style={{ padding: 18, borderRadius: 26, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: UI.muted }}>QUICK TIP</p>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>Sort by arrival or fare after picking a route card, then confirm the best match for your commute.</p>
          </div>
          <div style={{ padding: 18, borderRadius: 26, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: UI.muted }}>PREVIEW MODE</p>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>This home layout is now styled to match a modern route planner interface with dark glassmorphism and route cards.</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === 'pick') return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #050913 0%, #02040a 100%)', color: UI.ink }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 14 }}>
          <button onClick={() => setScreen('home')} style={{ background: UI.glass, border: `1px solid ${UI.glassBorder}`, borderRadius: 18, padding: '12px 14px', color: UI.ink, cursor: 'pointer' }}>Back</button>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: UI.muted, letterSpacing: '0.18em' }}>CHOOSE ROUTE</p>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>Best matches for your trip</h2>
          </div>
        </div>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: UI.muted }}>FROM</p>
              <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{from || 'Select start'}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: UI.muted }}>TO</p>
              <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{to || 'Select destination'}</p>
            </div>
          </div>
          <div style={{ height: 180, borderRadius: 28, background: 'linear-gradient(180deg, #0f172a 0%, #03060f 100%)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 16, borderRadius: 24, background: 'radial-gradient(circle at 30% 25%, rgba(59,130,246,0.16), transparent 30%), radial-gradient(circle at 75% 70%, rgba(16,185,129,0.12), transparent 24%)' }} />
            <div style={{ position: 'relative', zIndex: 1, height: '100%', padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: UI.muted, letterSpacing: '0.18em' }}>ROUTE PREVIEW</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>Live estimate</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 18, background: 'rgba(255,255,255,0.05)', border: `1px solid ${UI.glassBorder}` }}>
                  <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>DISTANCE</p>
                  <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 800, color: '#fff' }}>{dist.toFixed(1)} km</p>
                </div>
                <div style={{ padding: 12, borderRadius: 18, background: 'rgba(255,255,255,0.05)', border: `1px solid ${UI.glassBorder}` }}>
                  <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>ETA</p>
                  <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 800, color: '#fff' }}>{eta} min</p>
                </div>
                <div style={{ padding: 12, borderRadius: 18, background: 'rgba(255,255,255,0.05)', border: `1px solid ${UI.glassBorder}` }}>
                  <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>FARE</p>
                  <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 800, color: UI.accent2 }}>₱{fare.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 14, marginTop: 22 }}>
          {VEHICLES.map((v) => {
            const spd = rush ? v.speedR : v.speedN;
            const mins = Math.round((dist / spd) * 60);
            const estFare = Math.round((v.fareBase + dist * v.fareKm) * 100) / 100;
            return (
              <button key={v.id} onClick={() => { setVehicle(v); setScreen('result'); }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderRadius: 24, background: 'rgba(255,255,255,0.05)', border: `1px solid ${UI.glassBorder}`, cursor: 'pointer' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{v.label}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: UI.muted }}>{v.sub}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: v.color }}>{mins} min</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: UI.muted }}>₱{estFare.toFixed(2)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #050913 0%, #02040a 100%)', color: UI.ink }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 20px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 14 }}>
          <button onClick={() => setScreen('pick')} style={{ background: UI.glass, border: `1px solid ${UI.glassBorder}`, borderRadius: 18, padding: '12px 14px', color: UI.ink, cursor: 'pointer' }}>Back</button>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: UI.muted, letterSpacing: '0.18em' }}>TRIP SUMMARY</p>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>Ready to roll</h2>
          </div>
        </div>

        <Card style={{ padding: '22px 24px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: UI.muted }}>SELECTED VEHICLE</p>
              <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 800, color: vehicle?.color ?? '#38bdf8' }}>{vehicle?.label ?? 'Route'}</p>
            </div>
            <span style={{ padding: '10px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: `1px solid ${UI.glassBorder}`, color: '#f8fafc' }}>{vehicle?.sub}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
            <div style={{ padding: 18, borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
              <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>DURATION</p>
              <p style={{ margin: '10px 0 0', fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>{eta} min</p>
            </div>
            <div style={{ padding: 18, borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
              <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>FARE</p>
              <p style={{ margin: '10px 0 0', fontSize: 24, fontWeight: 800, color: UI.accent2 }}>₱{fare.toFixed(2)}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
            <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
              <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>DISTANCE</p>
              <p style={{ margin: '10px 0 0', fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{dist.toFixed(1)} km</p>
            </div>
            <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: `1px solid ${UI.glassBorder}` }}>
              <p style={{ margin: 0, fontSize: 10, color: UI.muted, letterSpacing: '0.16em' }}>TRAFFIC</p>
              <p style={{ margin: '10px 0 0', fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{rush ? 'Heavy' : 'Smooth'}</p>
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <p style={{ margin: '0 0 10px', fontSize: 10, color: UI.muted, letterSpacing: '0.18em' }}>TRIP DETAILS</p>
            <div style={{ borderRadius: 22, overflow: 'hidden', border: `1px solid ${UI.glassBorder}` }}>
              {[
                ['From', from],
                ['To', to],
                ['Route type', vehicle?.sub ?? ''],
                ['Estimated travel', `${eta} min`],
                ['Cost', `₱${fare.toFixed(2)}`],
              ].map(([label, value], index, array) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 18px',
                    background: index % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                    borderBottom: index < array.length - 1 ? `1px solid ${UI.glassBorder}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, color: UI.muted }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setScreen('home')}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 22,
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              border: 'none',
              background: 'linear-gradient(90deg, #2563eb, #38bdf8)',
              cursor: 'pointer',
            }}
          >
            Plan another route
          </button>
        </Card>
      </div>
    </div>
  );
}
