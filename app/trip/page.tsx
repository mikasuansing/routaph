'use client';

import { useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import { TripProvider, useTripContext } from '@/lib/trip/context';
import type { Itinerary, RideLeg, WalkLeg } from '@/lib/routing/types';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { distToNextStop, etaToNextStop } from '@/lib/trip/geo';

// ── Inner component (must be inside TripProvider) ─────────────────────────────

function TripScreen() {
  const router = useRouter();
  const trip = useTripContext();

  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) router.replace('/auth');
    });
    return () => { active = false; };
  }, [router]);

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

  if (trip.status === 'idle') {
    return <div className="flex items-center justify-center h-screen text-gray-400">Loading trip…</div>;
  }

  if (trip.status === 'arrived') {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-6 bg-green-50">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold text-green-800">You&apos;ve arrived!</h1>
        <button
          className="mt-4 px-6 py-3 bg-green-700 text-white rounded-full font-semibold"
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          Plan another trip
        </button>
      </div>
    );
  }

  if (trip.status === 'ended') {
    router.replace('/planner');
    return null;
  }

  const { itinerary, currentLegIndex, position, status, reroutes, rideOptions, activeDisruption } = trip;
  if (!itinerary) return null;

  const currentLeg = itinerary.legs[currentLegIndex];
  const nextLeg    = itinerary.legs[currentLegIndex + 1];
  const isLastLeg  = currentLegIndex >= itinerary.legs.length - 1;

  const distKm = position ? distToNextStop(position, itinerary, currentLegIndex) : null;
  const eta    = position ? etaToNextStop(position, itinerary, currentLegIndex) : null;

  const legLabel = (leg: typeof currentLeg): string => {
    if (!leg) return '';
    if (leg.type === 'ride') {
      const r = leg as RideLeg;
      return `${r.line.name} → ${r.to.name} (${r.stops.length} stop${r.stops.length !== 1 ? 's' : ''})`;
    }
    const w = leg as WalkLeg;
    return `Walk to ${w.toName} (${Math.round(w.distKm * 1000)} m)`;
  };

  const modeIcon = (leg: typeof currentLeg) => {
    if (!leg) return '🚶';
    if (leg.type === 'walk') return '🚶';
    const mode = (leg as RideLeg).line.mode;
    if (mode === 'mrt' || mode === 'lrt') return '🚆';
    if (mode === 'bus') return '🚌';
    return '🚐';
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-slate-100 p-4 flex items-center justify-between">
        <h1 className="font-bold text-lg">Trip in progress</h1>
        <button
          className="text-sm underline opacity-90 text-slate-200"
          onClick={() => { trip.endTrip(); router.replace('/planner'); }}
        >
          End trip
        </button>
      </header>

      {/* Active disruption banner */}
      {activeDisruption && status !== 'rerouting' && (
        <div className="bg-amber-900 border-b border-amber-700 px-4 py-2 flex items-center justify-between">
          <span className="text-amber-100 text-sm">
            ⚠️ {activeDisruption.description}
          </span>
          <button
            className="ml-2 text-sm font-semibold text-amber-100 underline"
            onClick={() => trip.triggerReroute()}
          >
            Reroute
          </button>
        </div>
      )}

      {/* Current leg card */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {currentLeg && (
          <div className="bg-slate-900 rounded-2xl shadow-xl shadow-black/20 p-5">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{modeIcon(currentLeg)}</span>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Now
                </p>
                <p className="font-semibold text-gray-900">{legLabel(currentLeg)}</p>
                {distKm !== null && (
                  <p className="text-sm text-slate-300 mt-1">
                    {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`}
                    {eta !== null && ` · ~${eta} min`} to next stop
                  </p>
                )}
                {position === null && (
                  <p className="text-xs text-slate-500 mt-1">Waiting for GPS…</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Next action */}
        {nextLeg && !isLastLeg && (
          <div className="bg-slate-950 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Next</p>
            <p className="text-slate-200">{modeIcon(nextLeg)} {legLabel(nextLeg)}</p>
          </div>
        )}

        {isLastLeg && (
          <div className="bg-emerald-950 rounded-2xl p-4 text-emerald-200 text-sm font-medium">
            Almost there — this is the last leg!
          </div>
        )}

        {/* Leg progress list */}
        <div className="bg-slate-900 rounded-2xl shadow-xl shadow-black/20 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Full itinerary
          </p>
          {itinerary.legs.map((leg, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 py-1.5 text-sm ${
                i < currentLegIndex ? 'text-gray-300 line-through' :
                i === currentLegIndex ? 'text-blue-700 font-semibold' :
                'text-gray-500'
              }`}
            >
              <span>{modeIcon(leg)}</span>
              <span>{legLabel(leg)}</span>
              {i === currentLegIndex && (
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  You are here
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Rerouting state */}
        {status === 'rerouting' && (
          <div className="bg-white rounded-2xl shadow p-5 text-center text-gray-500">
            Finding alternatives…
          </div>
        )}

        {/* Reroute results */}
        {status !== 'rerouting' && reroutes.length > 0 && (
          <div className="bg-slate-900 rounded-2xl shadow-xl shadow-black/20 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Alternative routes
            </p>
            {reroutes.map((r, i) => (
              <div key={i} className="border-b last:border-0 py-3">
                <p className="font-semibold text-gray-900">
                  {r.totalDurationMin} min · ₱{r.totalFare} · {r.transfers} transfer{r.transfers !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {r.legs.filter(l => l.type === 'ride').map(l => (l as RideLeg).line.name).join(' → ') || 'Walk only'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{r.objective}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ride-hailing options */}
        {rideOptions.length > 0 && (
          <div className="bg-slate-900 rounded-2xl shadow-xl shadow-black/20 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Ride options
            </p>
            {rideOptions.map((opt, i) => (
              <div key={i} className="border-b last:border-0 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{opt.provider}</p>
                    <p className="text-sm text-gray-500">
                      ~₱{opt.fareMin}–₱{opt.fareMax} · {opt.etaMin}–{opt.etaMax} min
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">{opt.disclaimer}</p>
                  </div>
                  <a
                    href={opt.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 px-4 py-2 bg-orange-500 text-white text-sm rounded-full font-semibold whitespace-nowrap"
                  >
                    Book
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Sticky stuck button */}
      {status === 'active' && (
        <div className="sticky bottom-0 p-4 bg-slate-950 border-t border-slate-800 flex gap-3">
          <button
            className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-full"
            onClick={() => trip.triggerReroute()}
          >
            I&apos;m stuck / line down
          </button>
          <button
            className="px-5 py-3 bg-slate-800 text-slate-100 font-semibold rounded-full"
            onClick={() => { trip.endTrip(); router.replace('/planner'); }}
          >
            End
          </button>
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
