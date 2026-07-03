'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TripProvider, useTripContext } from '@/lib/trip/context';
import type { Itinerary, RideLeg, WalkLeg } from '@/lib/routing/types';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { distToNextStop, etaToNextStop } from '@/lib/trip/geo';

/*
 * Trip Companion — live tracking screen.
 * Monochrome minimal: typography carries the hierarchy; the single accent
 * (transit green) marks the live GPS state and arrival confirmation.
 */

const C = {
  bg:     'var(--color-bg)',
  card:   'var(--color-card)',
  cardEl: 'var(--color-card-el)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
  onPrimary: 'var(--color-on-primary)',
};

const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=Baloo+2:wght@600;700;800&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
body{font-family:var(--font-sans);}
button:active{opacity:0.85;}
.tnum{font-variant-numeric:tabular-nums;}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
`;

const DISPLAY = 'var(--font-display)';

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

// ── Inner component (must be inside TripProvider) ─────────────────────────────

function TripScreen() {
  const router = useRouter();
  const trip = useTripContext();

  // On mount: restore itinerary from sessionStorage and start trip
  useEffect(() => {
    if (trip.status !== 'idle') return;
    try {
      const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
      if (!raw) { router.replace('/planner'); return; }
      const itinerary = JSON.parse(raw) as Itinerary;
      trip.startTrip(itinerary);
    } catch {
      router.replace('/planner');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation is a side effect — never call router.replace during render
  useEffect(() => {
    if (trip.status === 'ended') router.replace('/planner');
  }, [trip.status, router]);

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
        <Micro color={C.accent}>✓ Trip complete</Micro>
        <h1 style={{ margin: '14px 0 0', fontFamily: DISPLAY, fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          You&apos;ve arrived.
        </h1>
        {trip.itinerary && (
          <p className="tnum" style={{ margin: '16px 0 0', fontSize: 16, color: C.body }}>
            ₱{trip.itinerary.totalFare.toFixed(2)} total fare · {trip.itinerary.transfers} transfer{trip.itinerary.transfers !== 1 ? 's' : ''}
          </p>
        )}
        <button
          style={{ marginTop: 36, padding: '17px', background: 'var(--gradient-primary)', color: C.onPrimary, border: 'none', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', boxShadow: '0 6px 18px rgba(41,71,222,0.25)' }}
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          Plan another trip
        </button>
      </div>
    );
  }

  if (trip.status === 'ended') return null;

  const { itinerary, currentLegIndex, position, gpsDenied, status, reroutes, rideOptions, activeDisruption, originalDest } = trip;
  if (!itinerary) return null;

  const currentLeg = itinerary.legs[currentLegIndex];
  const nextLeg    = itinerary.legs[currentLegIndex + 1];
  const isLastLeg  = currentLegIndex >= itinerary.legs.length - 1;

  const distKm = position ? distToNextStop(position, itinerary, currentLegIndex) : null;
  const eta    = position ? etaToNextStop(position, itinerary, currentLegIndex, position.speedMps) : null;

  const wazeUrl = originalDest
    ? `https://waze.com/ul?ll=${originalDest.lat},${originalDest.lng}&navigate=yes&utm_source=parapo`
    : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', flexDirection: 'column', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <style>{GLOBAL}</style>

      {/* Header */}
      <header style={{ padding: '52px 24px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
            ParaPo<span style={{ color: C.ink }}>.</span>
          </span>
          <h1 style={{ margin: '4px 0 0', fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Trip in progress</h1>
          {/* Live status — the single accent marks a live GPS fix */}
          <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: position ? C.accent : C.muted }}>
            {position
              ? '● Live — GPS tracking'
              : gpsDenied
                ? '○ Location off — manual mode'
                : <span style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>○ Waiting for GPS</span>}
          </p>
        </div>
        <button
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          End trip
        </button>
      </header>

      {/* Active disruption — bold type, no color theatre */}
      {activeDisruption && status !== 'rerouting' && (
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>▲ {activeDisruption.description}</p>
          <button
            style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 800, color: C.ink, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            onClick={() => trip.triggerReroute()}
          >
            Reroute
          </button>
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
        {/* GPS denied notice */}
        {gpsDenied && (
          <p style={{ margin: '0 0 22px', fontSize: 13, color: C.body, lineHeight: 1.7 }}>
            Location access is off, so legs won&apos;t advance automatically.
            Tap <strong style={{ color: C.ink }}>Mark leg done</strong> as you go — or re-enable
            location in your browser settings.
          </p>
        )}

        {/* Current leg — the glance */}
        {currentLeg && (
          <section style={{ marginBottom: 28, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18 }}>
            <Micro color={C.accent}>Now · {modeTag(currentLeg)}</Micro>
            <p style={{ margin: '8px 0 0', fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              {legLabel(currentLeg)}
            </p>
            {distKm !== null && (
              <p className="tnum" style={{ margin: '8px 0 0', fontSize: 16, color: C.body }}>
                {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`}
                {eta !== null && ` · ~${eta} min`} to next stop
              </p>
            )}
            {status === 'active' && (
              <button
                style={{
                  marginTop: 18, width: '100%', padding: '16px', borderRadius: 999,
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'var(--gradient-primary)',
                  color: C.onPrimary,
                  border: 'none', letterSpacing: '0.01em',
                  boxShadow: '0 6px 18px rgba(41,71,222,0.25)',
                }}
                onClick={() => trip.advanceLeg()}
              >
                {isLastLeg ? '✓ Mark as done — I’ve arrived' : '✓ Mark leg done — I’m here'}
              </button>
            )}
          </section>
        )}

        {/* Next leg */}
        {nextLeg && !isLastLeg && (
          <section style={{ marginBottom: 28 }}>
            <Micro>Next · {modeTag(nextLeg)}</Micro>
            <p style={{ margin: '6px 0 0', fontSize: 15, color: C.body }}>{legLabel(nextLeg)}</p>
          </section>
        )}

        {isLastLeg && (
          <p style={{ margin: '0 0 28px', fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: '0.02em' }}>
            Almost there — this is the last leg.
          </p>
        )}

        {/* Full itinerary */}
        <section style={{ marginBottom: 28 }}>
          <Micro>Full itinerary</Micro>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {itinerary.legs.map((leg, i) => {
              const done = i < currentLegIndex;
              const here = i === currentLegIndex;
              return (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: here ? C.ink : C.muted, width: 38, flexShrink: 0 }}>
                    {modeTag(leg)}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 14,
                    fontWeight: here ? 700 : 400,
                    color: done ? C.muted : here ? C.ink : C.body,
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {legLabel(leg)}
                  </span>
                  {here && <Micro color={C.accent} style={{ flexShrink: 0 }}>You are here</Micro>}
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

      {/* Sticky action bar */}
      {status === 'active' && (
        <div style={{ position: 'sticky', bottom: 0, padding: '14px 24px calc(14px + env(safe-area-inset-bottom))', background: C.bg, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
          <button
            style={{
              flex: 1, padding: '15px', borderRadius: 999, fontSize: 14, fontWeight: 700,
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
              style={{ padding: '15px 22px', borderRadius: 999, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${C.accent}`, color: C.accent, textDecoration: 'none' }}>
              Waze
            </a>
          )}
        </div>
      )}
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
