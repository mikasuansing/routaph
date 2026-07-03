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

export default function DesignB() {
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
    <div style={{ minHeight: '100vh', background: '#050913', fontFamily: 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif', color: '#e2e8f0' }}>
      {/* Nav */}
      <header style={{ background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: '#ff6b35', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#fff" strokeWidth="1.5"/>
              <path d="M7 4v3l2 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', color: '#1a1410' }}>ParaPo</span>
        </div>
        <nav style={{ display: 'flex', gap: 6 }}>
          {['Plan', 'Reports', 'Network'].map((item, i) => (
            <button key={item} style={{
              background: i === 0 ? '#1a1410' : 'transparent',
              color: i === 0 ? '#fff' : '#7a6f5e',
              border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 13,
              fontWeight: 500, cursor: 'pointer',
            }}>{item}</button>
          ))}
        </nav>
      </header>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#93c5fd', marginBottom: 16, fontWeight: 500 }}>
            <span>●</span> 2 corridors active
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', color: '#f8fafc', lineHeight: 1.05, marginBottom: 12 }}>
            Get there faster.
          </h1>
          <p style={{ fontSize: 15, color: '#cbd5e1', maxWidth: 400, margin: '0 auto' }}>
            Seeded route data for Metro Manila&apos;s busiest corridors.
          </p>
        </div>

        {/* Planner */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>From</label>
              <select value={from} onChange={e => setFrom(e.target.value)} style={{
                width: '100%', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#f8fafc',
                outline: 'none', cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237a6f5e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
              }}>
                <option value="">Choose a stop</option>
                {STOPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>To</label>
              <select value={to} onChange={e => setTo(e.target.value)} style={{
                width: '100%', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#f8fafc',
                outline: 'none', cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237a6f5e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
              }}>
                <option value="">Choose a stop</option>
                {STOPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <button onClick={plan} disabled={loading || !from || !to} style={{
            width: '100%', background: from && to ? '#ff6b35' : '#e8e3da',
            color: from && to ? '#fff' : '#b0a898',
            border: 'none', borderRadius: 10, padding: '13px', fontSize: 14,
            fontWeight: 700, cursor: from && to ? 'pointer' : 'default',
            transition: 'all 0.15s',
          }}>
            {loading ? 'Finding best route…' : 'Plan my commute'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#fff5f5', border: '1.5px solid #fcc', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#c0392b', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {result && (
          <>
            {/* Big stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Travel time', value: result.etaMinutes, unit: 'min', accent: '#ff6b35' },
                { label: 'Estimated fare', value: `₱${result.fare.toFixed(2)}`, unit: '', accent: '#2a9d8f' },
                { label: 'Distance', value: `${result.distanceKm} km`, unit: '', accent: '#8b5cf6' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: '18px 20px' }}>
                  <div style={{ fontSize: 12, color: '#7a6f5e', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: s.accent }}>{s.value}</div>
                  {s.unit && <div style={{ fontSize: 12, color: '#7a6f5e' }}>{s.unit}</div>}
                </div>
              ))}
            </div>

            {/* Route card */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#7a6f5e', display: 'block', marginBottom: 2 }}>Route</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1410' }}>{result.corridor}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {result.rushHour && <span style={{ fontSize: 11, background: '#fff7e6', color: '#e08a00', border: '1px solid #fde68a', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>Rush hour</span>}
                  <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>Seeded data</span>
                </div>
              </div>

              {/* Stop pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {result.stops.map((s, i) => (
                  <>
                    <span key={s.id} style={{
                      background: i === 0 || i === result.stops.length - 1 ? result.corridorColor : '#f7f4ef',
                      color: i === 0 || i === result.stops.length - 1 ? '#fff' : '#4a3f2f',
                      borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${i === 0 || i === result.stops.length - 1 ? result.corridorColor : '#e8e3da'}`,
                    }}>{s.name}</span>
                    {i < result.stops.length - 1 && <span key={`arrow-${s.id}`} style={{ color: '#c0b8a8', fontSize: 12 }}>→</span>}
                  </>
                ))}
              </div>
            </div>
          </>
        )}

        {!result && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { name: 'EDSA Carousel', color: '#e63946', stops: 9, detail: 'Monumento → Taft Ave' },
              { name: 'Katipunan Jeepney', color: '#2a9d8f', stops: 5, detail: 'Katipunan → Tandang Sora' },
            ].map(c => (
              <div key={c.name} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e3da', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1410' }}>{c.name}</span>
                </div>
                <p style={{ fontSize: 12, color: '#7a6f5e', margin: 0 }}>{c.detail} · {c.stops} stops</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer style={{ borderTop: '1px solid #e8e3da', padding: '14px 32px', fontSize: 11, color: '#b0a898', textAlign: 'center' }}>
        ⚠ Seeded / simulated data — Not a live operator feed
      </footer>
    </div>
  );
}
