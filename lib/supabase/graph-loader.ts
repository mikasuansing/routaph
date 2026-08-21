/**
 * Builds a TransitGraph from the Supabase database.
 * Falls back to seed data when Supabase is unconfigured or the query fails.
 * Server-only - never import from a Client Component.
 */
import type { FareRule, Line, Stop, TransitGraph } from '@/lib/routing/types';
import { DEFAULT_FARE_RULES } from '@/lib/routing/fares';
import { buildGraphFromData, getGraph } from '@/lib/routing/graph';

// DB mode → engine Mode
function mapMode(dbMode: string, name = ''): Line['mode'] {
  if (dbMode === 'train') return name.toUpperCase().includes('LRT') ? 'lrt' : 'mrt';
  if (dbMode === 'uv_express') return 'bus';
  return dbMode as Line['mode'];
}

// Module-level TTL cache - shared across requests in one server process
let _cache: { graph: TransitGraph; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadTransitGraph(): Promise<TransitGraph> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.graph;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getGraph(); // dev / test - no DB configured
  }

  try {
    const { supabaseServer } = await import('./server');

    const [corridorsRes, routesRes, routeStopsRes, stopsRes, faresRes] = await Promise.all([
      supabaseServer.from('corridors').select('id, name, mode, color'),
      supabaseServer.from('routes').select('id, corridor_id, name, direction'),
      supabaseServer.from('route_stops').select('route_id, stop_id, seq').order('seq'),
      supabaseServer.from('stops').select('id, name, lat, lng'),
      supabaseServer
        .from('fares')
        .select('route_id, base_fare, per_km')
        .order('effective_on', { ascending: false }),
    ]);

    const corridors = corridorsRes.data ?? [];
    const routes    = routesRes.data ?? [];
    const rsData    = routeStopsRes.data ?? [];
    const stopsData = stopsRes.data ?? [];
    const faresData = faresRes.data ?? [];

    // Fall back to seed when the DB tables are empty
    if (corridors.length === 0 || stopsData.length === 0) return getGraph();

    // One Line per route (route.id becomes the lineId used by the engine)
    const lines: Line[] = routes
      .map(route => {
        const corridor = corridors.find(c => c.id === route.corridor_id);
        if (!corridor) return null;
        return {
          id: route.id,
          name: corridor.name,
          mode: mapMode(corridor.mode, corridor.name),
          color: corridor.color ?? '#666666',
        } satisfies Line;
      })
      .filter((l): l is Line => l !== null);

    // Stops with valid coordinates
    const stops: Stop[] = stopsData
      .filter(s => s.lat != null && s.lng != null)
      .map(s => ({ id: s.id, name: s.name, lat: s.lat!, lng: s.lng! }));

    // [routeId, stopIds ordered by seq]
    const lineStops: Array<[number, number[]]> = routes
      .map(route => {
        const ids = rsData
          .filter(rs => rs.route_id === route.id)
          .sort((a, b) => a.seq - b.seq)
          .map(rs => rs.stop_id);
        return [route.id, ids] as [number, number[]];
      })
      .filter(([, ids]) => ids.length > 0);

    // Flag distances: rail charges per-km from 0; road modes have a free-km window
    const FLAG_KM: Partial<Record<string, number>> = { mrt: 0, lrt: 0, bus: 5, jeepney: 4 };

    // Published single-journey ceilings, keyed by route id (see
    // supabase/migrations/006_2026_fare_rates.sql). Rail fares are matrices
    // with a maximum, so the per-km approximation has to be clamped or it
    // runs past what the operator can actually charge - LRT-1 end to end
    // came out at P51 against a stale P15-30 cap before this was corrected.
    // Road modes are otherwise left uncapped: LTFRB publishes a per-km rate
    // for them with no ceiling, so inventing one would be worse than the
    // overshoot. EDSA Carousel is the one exception, because a real
    // end-to-end ceiling for it is publicly documented (unlike Route 3 or
    // a generic jeepney) - see migration 010 for the two sources.
    const MAX_FARE: Partial<Record<number, number>> = {
      1: 75.50, // EDSA Carousel, Monumento<->PITX ceiling (~P73-75.50)
      3: 14,    // MRT-3, P6-14 matrix
      4: 18,    // LRT-2, P8-18 matrix
      5: 52,    // LRT-1 beep, P16-52 matrix (lrmc.ph 2025-04-02 notice; SJT is P20-55)
    };

    // Per-LINE fare rules (lineId = route id, which is the engine's line id).
    // Never average across a mode: LRT-1 (LRMC, undiscounted) and LRT-2
    // (DOTr 50% discount since 2026-03-23) are both mode 'lrt' but priced
    // very differently. faresData is ordered newest-effective first; keep the
    // first row seen per route so new fare rows supersede old ones.
    const fareRules: FareRule[] = [];
    const seenRoute = new Set<number>();
    for (const fare of faresData) {
      if (seenRoute.has(fare.route_id)) continue;
      const route = routes.find(r => r.id === fare.route_id);
      if (!route) continue;
      const corridor = corridors.find(c => c.id === route.corridor_id);
      if (!corridor) continue;
      seenRoute.add(fare.route_id);
      const mode = mapMode(corridor.mode, corridor.name);
      fareRules.push({
        lineId:         route.id,
        mode:           mode as Line['mode'],
        baseFare:       Number(fare.base_fare),
        perKmRate:      Number(fare.per_km),
        flagDistanceKm: FLAG_KM[mode] ?? 4,
        maxFare:        MAX_FARE[route.id],
      });
    }
    // Mode-level fallbacks for any line without a DB fare row
    fareRules.push(...DEFAULT_FARE_RULES);

    const graph = buildGraphFromData(lines, stops, lineStops, fareRules);
    _cache = { graph, at: Date.now() };
    return graph;

  } catch {
    return getGraph(); // any error → fall back to seed data
  }
}

export function invalidateGraphCache(): void {
  _cache = null;
}
