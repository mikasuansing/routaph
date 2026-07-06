'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

/* My ParaPo — saved commutes (F5) + trip history. Login-gated. */

const C = {
  bg:     'var(--color-bg)',
  card:   'var(--color-card)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
  error:  'var(--color-error)',
};
const DISPLAY = 'var(--font-display)';

const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=Baloo+2:wght@600;700;800&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
body{font-family:var(--font-sans);}
button:active{opacity:0.85;}
.tnum{font-variant-numeric:tabular-nums;}
`;

type SavedRoute = {
  id: number; name: string;
  origin_name: string; dest_name: string;
  origin_lat: number; origin_lng: number;
  dest_lat: number; dest_lng: number;
};
type TripHistory = {
  id: number; origin: string; destination: string;
  distanceKm: number; fareEstimate: number;
  modesUsed: string[]; createdAt: string;
};

function Micro({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color ?? C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {children}
    </p>
  );
}

export default function MePage() {
  const router = useRouter();
  const [token, setToken]   = useState<string | null>(null);
  const [saved, setSaved]   = useState<SavedRoute[] | null>(null);
  const [trips, setTrips]   = useState<TripHistory[] | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) { router.replace('/auth?next=/me'); return; }
      setToken(data.session.access_token);
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/v1/me/routes', { headers }).then(r => r.json()),
      fetch('/api/v1/me/trips',  { headers }).then(r => r.json()),
    ]).then(([routesJson, tripsJson]) => {
      if (!active) return;
      setSaved(routesJson.data ?? []);
      setTrips(tripsJson.data ?? []);
    }).catch(() => { if (active) setError('Could not load your data — check your connection.'); });
    return () => { active = false; };
  }, [token]);

  async function removeSaved(id: number) {
    if (!token) return;
    setSaved(prev => prev?.filter(r => r.id !== id) ?? null);
    await fetch(`/api/v1/me/routes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* optimistic; next load reconciles */ });
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: 'Inter,system-ui,sans-serif' }}>
      <style>{GLOBAL}</style>

      <header style={{ padding: '52px 24px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
            ParaPo<span style={{ color: C.ink }}>.</span>
          </span>
          <h1 style={{ margin: '4px 0 0', fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>My trips</h1>
        </div>
        <a href="/planner" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink, textDecoration: 'none', background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 16px' }}>
          ← Planner
        </a>
      </header>

      <main style={{ padding: '8px 24px 48px', display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 560 }}>
        {error && <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.error }}>{error}</p>}

        {/* Saved commutes (F5) */}
        <section>
          <Micro>Saved commutes</Micro>
          {saved === null ? (
            <p style={{ margin: '12px 0 0', fontSize: 14, color: C.muted }}>Loading…</p>
          ) : saved.length === 0 ? (
            <p style={{ margin: '12px 0 0', fontSize: 14, color: C.body, lineHeight: 1.6 }}>
              No saved commutes yet. Plan a route, then tap <strong>Save commute</strong> on the route details.
            </p>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {saved.map(r => (
                <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: C.body }}>{r.origin_name} → {r.dest_name}</p>
                  </div>
                  <button
                    onClick={() => router.push(`/planner?from=${encodeURIComponent(r.origin_name)}&to=${encodeURIComponent(r.dest_name)}`)}
                    style={{ padding: '9px 16px', borderRadius: 999, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    Plan
                  </button>
                  <button
                    onClick={() => removeSaved(r.id)}
                    aria-label={`Remove ${r.name}`}
                    style={{ padding: '9px 12px', borderRadius: 999, border: `1.5px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Trip history */}
        <section>
          <Micro>Trip history</Micro>
          {trips === null ? (
            <p style={{ margin: '12px 0 0', fontSize: 14, color: C.muted }}>Loading…</p>
          ) : trips.length === 0 ? (
            <p style={{ margin: '12px 0 0', fontSize: 14, color: C.body, lineHeight: 1.6 }}>
              No trips saved yet. Finish a trip and tap <strong>Save trip to history</strong> on the arrival screen.
            </p>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {trips.map(t => (
                <div key={t.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                      {t.origin} → {t.destination}
                    </p>
                    <span className="tnum" style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, color: C.accent, flexShrink: 0 }}>
                      ₱{t.fareEstimate.toFixed(2)}
                    </span>
                  </div>
                  <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>
                    {t.distanceKm.toFixed(1)} km · {t.modesUsed.join(', ') || 'walk'} · {fmtDate(t.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
