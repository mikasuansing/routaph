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

const JEEPNEY_YELLOW = '#f5c518';
const JEEPNEY_RED = '#d62828';

export default function DesignC() {
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
    <div style={{ minHeight: '100vh', background: '#fafaf8', fontFamily: '"Inter",ui-sans-serif,system-ui,sans-serif' }}>

      {/* Top stripe — jeepney colors */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${JEEPNEY_RED} 0%, ${JEEPNEY_RED} 33%, ${JEEPNEY_YELLOW} 33%, ${JEEPNEY_YELLOW} 66%, #1a56db 66%, #1a56db 100%)` }} />

      <header style={{
        background: '#fff', borderBottom: '1px solid #ebebeb',
        padding: '0 32px', height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.04em', color: '#0f0f0f' }}>Para</span>
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.04em', color: JEEPNEY_RED }}>Po</span>
          <div style={{ width: 1, height: 18, background: '#ebebeb', margin: '0 6px' }} />
          <span style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>Metro Manila Routes</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Plan</span>
          <span style={{ fontSize: 12, color: '#bbb' }}>Reports</span>
          <span style={{ fontSize: 12, color: '#bbb' }}>Network</span>
        </div>
      </header>

      {/* Split layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', minHeight: 'calc(100vh - 62px)' }}>
        {/* Left sidebar - planner */}
        <aside style={{ background: '#fff', borderRight: '1px solid #ebebeb', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f0f0f', marginBottom: 4 }}>Plan your commute</h2>
            <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Select two stops on the same corridor.</p>
          </div>

          {/* From */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1a56db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#0f0f0f', letterSpacing: '0.02em', textTransform: 'uppercase' }}>From</label>
            </div>
            <select value={from} onChange={e => setFrom(e.target.value)} style={{
              width: '100%', border: '1.5px solid #ebebeb', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, color: '#0f0f0f',
              background: '#fafaf8', outline: 'none', cursor: 'pointer',
              fontWeight: 500,
            }}>
              <option value="">Pick a stop</option>
              {STOPS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Swap divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
            <div style={{
              width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #ebebeb',
              background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 12, color: '#888',
            }} onClick={() => { const t = from; setFrom(to); setTo(t); }}>⇅</div>
            <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
          </div>

          {/* To */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: JEEPNEY_RED, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#0f0f0f', letterSpacing: '0.02em', textTransform: 'uppercase' }}>To</label>
            </div>
            <select value={to} onChange={e => setTo(e.target.value)} style={{
              width: '100%', border: '1.5px solid #ebebeb', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, color: '#0f0f0f',
              background: '#fafaf8', outline: 'none', cursor: 'pointer',
              fontWeight: 500,
            }}>
              <option value="">Pick a stop</option>
              {STOPS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <button onClick={plan} disabled={loading || !from || !to} style={{
            background: from && to ? JEEPNEY_RED : '#f0f0f0',
            color: from && to ? '#fff' : '#bbb',
            border: 'none', borderRadius: 10, padding: '13px',
            fontSize: 14, fontWeight: 700, cursor: from && to ? 'pointer' : 'default',
            transition: 'background 0.15s', letterSpacing: '-0.01em',
          }}>
            {loading ? 'Finding route…' : 'Find route →'}
          </button>

          {error && <div style={{ background: '#fff5f5', border: '1px solid #fcc', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: JEEPNEY_RED }}>{error}</div>}

          {/* Corridor legend */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid #ebebeb', paddingTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#888', marginBottom: 12, textTransform: 'uppercase' }}>Corridors</div>
            {[
              { name: 'EDSA Carousel', color: '#e63946', stops: 9 },
              { name: 'Katipunan Jeepney', color: '#2a9d8f', stops: 5 },
            ].map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ width: 28, height: 4, borderRadius: 2, background: c.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f0f0f' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{c.stops} stops</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right - result panel */}
        <main style={{ padding: 32, background: '#fafaf8', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!result && !error && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
              <div style={{ fontSize: 64 }}>🚌</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f0f0f', letterSpacing: '-0.02em' }}>Pick your stops to start</h3>
              <p style={{ fontSize: 14, color: '#aaa', maxWidth: 300 }}>Choose a departure and arrival stop on the left to see your route, ETA, and fare.</p>
            </div>
          )}

          {result && (
            <>
              {/* Route header */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: result.corridorColor }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{result.corridor}</span>
                  {result.rushHour && <span style={{ fontSize: 11, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 8px', fontWeight: 600 }}>Rush hour</span>}
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f0f0f' }}>
                  {result.from} <span style={{ color: result.corridorColor }}>→</span> {result.to}
                </h3>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'ETA', val: `${result.etaMinutes}`, sub: 'minutes', color: '#1a56db' },
                  { label: 'Fare', val: `₱${result.fare.toFixed(2)}`, sub: 'estimated', color: JEEPNEY_RED },
                  { label: 'Distance', val: `${result.distanceKm}`, sub: 'kilometers', color: '#2a9d8f' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', padding: '20px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#aaa', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.04em', color: s.color, lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Stop timeline */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', padding: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#aaa', textTransform: 'uppercase', marginBottom: 16 }}>Stops along route</div>
                <div style={{ position: 'relative', paddingLeft: 28 }}>
                  <div style={{ position: 'absolute', left: 8, top: 12, bottom: 12, width: 2, background: result.corridorColor, opacity: 0.3 }} />
                  {result.stops.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: -28+6,
                        width: i === 0 || i === result.stops.length - 1 ? 12 : 8,
                        height: i === 0 || i === result.stops.length - 1 ? 12 : 8,
                        borderRadius: '50%',
                        background: i === 0 || i === result.stops.length - 1 ? result.corridorColor : '#fff',
                        border: `2px solid ${result.corridorColor}`,
                        marginLeft: i === 0 || i === result.stops.length - 1 ? -2 : 0,
                      }} />
                      <span style={{
                        fontSize: 14, fontWeight: i === 0 || i === result.stops.length - 1 ? 700 : 400,
                        color: i === 0 || i === result.stops.length - 1 ? '#0f0f0f' : '#777',
                      }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <div style={{ background: '#fff', borderTop: '1px solid #ebebeb', padding: '10px 32px', fontSize: 11, color: '#bbb' }}>
        ⚠ Seeded / simulated data · Not a live operator feed
      </div>
    </div>
  );
}
