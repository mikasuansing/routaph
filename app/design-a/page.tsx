'use client';
import { useState } from 'react';

const STOPS = [
  'Monumento','Balintawak','Trinoma','Quezon Ave','Cubao','Ortigas','Guadalupe','Magallanes','Taft Ave',
  'Katipunan LRT2','Ateneo Gate','UP Diliman','Balara','Tandang Sora',
];

type TripResult = {
  corridor: string; corridorColor: string; from: string; to: string;
  distanceKm: number; etaMinutes: number; fare: number; rushHour: boolean;
  stops: { id: number; name: string; seq: number }[];
};

export default function DesignA() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<TripResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function plan() {
    if (!from || !to) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/trips/plan', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({from, to}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1f18', color: '#e8f0ec', fontFamily: 'ui-monospace,"SF Mono","Roboto Mono",monospace' }}>
      {/* Top bar */}
      <header style={{ borderBottom: '1px solid #1e3a2b', padding: '0 24px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#4ade80' }}>ParaPo</span>
          <span style={{ fontSize: 10, background: '#1e3a2b', color: '#4ade80', border: '1px solid #2d5a3f', borderRadius: 3, padding: '2px 7px', letterSpacing: '0.08em' }}>BETA · SEEDED</span>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 11, color: '#5a7a65', letterSpacing: '0.05em' }}>
          <span>PLANNER</span><span style={{ opacity: 0.4 }}>REPORTS</span><span style={{ opacity: 0.4 }}>ADMIN</span>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Hero label */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.15em', color: '#4ade80', marginBottom: 8 }}>METRO MANILA COMMUTE INTELLIGENCE</div>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#e8f0ec' }}>
            Where are you going?
          </h1>
        </div>

        {/* Planner card */}
        <div style={{ background: '#0a1812', border: '1px solid #1e3a2b', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', color: '#5a7a65', marginBottom: 6 }}>FROM</label>
              <select value={from} onChange={e => setFrom(e.target.value)} style={{
                width: '100%', background: '#0d1f18', border: '1px solid #1e3a2b', color: '#e8f0ec',
                padding: '10px 12px', borderRadius: 4, fontSize: 13, outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                <option value="">Select stop</option>
                {STOPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', color: '#5a7a65', marginBottom: 6 }}>TO</label>
              <select value={to} onChange={e => setTo(e.target.value)} style={{
                width: '100%', background: '#0d1f18', border: '1px solid #1e3a2b', color: '#e8f0ec',
                padding: '10px 12px', borderRadius: 4, fontSize: 13, outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                <option value="">Select stop</option>
                {STOPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={plan} disabled={loading || !from || !to} style={{
              background: from && to ? '#4ade80' : '#1e3a2b',
              color: from && to ? '#0a1812' : '#3a5a45',
              border: 'none', borderRadius: 4, padding: '10px 20px', fontSize: 12,
              fontWeight: 700, letterSpacing: '0.08em', cursor: from && to ? 'pointer' : 'default',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}>
              {loading ? 'ROUTING…' : 'PLAN ROUTE →'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#2a0a0a', border: '1px solid #5a1515', borderRadius: 6, padding: '12px 16px', fontSize: 12, color: '#f87171', marginBottom: 24 }}>
            ✗ {error}
          </div>
        )}

        {result && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            {/* Main result */}
            <div style={{ background: '#0a1812', border: '1px solid #1e3a2b', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: result.corridorColor }} />
                <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#5a7a65' }}>{result.corridor.toUpperCase()}</span>
                {result.rushHour && <span style={{ fontSize: 9, background: '#3a1e0a', color: '#f59e0b', border: '1px solid #5a3210', borderRadius: 3, padding: '2px 6px', letterSpacing: '0.08em' }}>RUSH HOUR</span>}
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {result.from} <span style={{ color: '#4ade80' }}>→</span> {result.to}
                </div>
              </div>
              {/* Stop timeline */}
              <div style={{ borderLeft: '2px solid #1e3a2b', paddingLeft: 16 }}>
                {result.stops.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', position: 'relative' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginLeft: -20,
                      background: i === 0 || i === result.stops.length - 1 ? result.corridorColor : '#1e3a2b',
                      border: `1px solid ${result.corridorColor}`, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: i === 0 || i === result.stops.length - 1 ? '#e8f0ec' : '#5a7a65' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'ETA', value: `${result.etaMinutes}`, unit: 'min' },
                { label: 'FARE', value: `₱${result.fare.toFixed(2)}`, unit: '' },
                { label: 'DISTANCE', value: `${result.distanceKm}`, unit: 'km' },
              ].map(stat => (
                <div key={stat.label} style={{ background: '#0a1812', border: '1px solid #1e3a2b', borderRadius: 8, padding: '20px 20px' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#5a7a65', marginBottom: 6 }}>{stat.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#4ade80', letterSpacing: '-0.02em', lineHeight: 1 }}>{stat.value}</div>
                  {stat.unit && <div style={{ fontSize: 11, color: '#5a7a65', marginTop: 2 }}>{stat.unit}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Corridors */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#5a7a65', marginBottom: 16 }}>ACTIVE CORRIDORS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { name: 'EDSA Carousel', color: '#e63946', stops: 9, status: 'OPERATIONAL' },
              { name: 'Katipunan Jeepney', color: '#2a9d8f', stops: 5, status: 'OPERATIONAL' },
            ].map(c => (
              <div key={c.name} style={{ background: '#0a1812', border: '1px solid #1e3a2b', borderRadius: 6, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: '#4ade80', letterSpacing: '0.08em' }}>{c.status}</div>
                  <div style={{ fontSize: 11, color: '#5a7a65' }}>{c.stops} stops</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer style={{ borderTop: '1px solid #1e3a2b', padding: '12px 24px', fontSize: 10, color: '#3a5a45', letterSpacing: '0.05em' }}>
        ⚠ SEEDED / SIMULATED DATA — Not a live operator feed. ETA not production-validated.
      </footer>
    </div>
  );
}
