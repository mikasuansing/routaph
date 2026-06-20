/**
 * Builds a TransitGraph from the Supabase database.
 * Falls back to seed data when Supabase is unconfigured or the query fails.
 * Server-only — never import from a Client Component.
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

// Module-level TTL cache — shared across requests in one server process
let _cache: { graph: TransitGraph; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadTransitGraph(): Promise<TransitGraph> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.graph;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getGraph(); // dev / test — no DB configured
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

    // Aggregate DB fares to per-mode FareRule[]
    const modeAccum = new Map<string, { baseSum: number; perKmSum: number; n: number }>();
    for (const fare of faresData) {
      const route = routes.find(r => r.id === fare.route_id);
      if (!route) continue;
      const corridor = corridors.find(c => c.id === route.corridor_id);
      if (!corridor) continue;
      const mode = mapMode(corridor.mode, corridor.name);
      const acc = modeAccum.get(mode) ?? { baseSum: 0, perKmSum: 0, n: 0 };
      acc.baseSum   += Number(fare.base_fare);
      acc.perKmSum  += Number(fare.per_km);
      acc.n++;
      modeAccum.set(mode, acc);
    }

    // Flag distances: rail charges per-km from 0; road modes have a free-km window
    const FLAG_KM: Partial<Record<string, number>> = { mrt: 0, lrt: 0, bus: 5, jeepney: 4 };

    const fareRules: FareRule[] = [...modeAccum.entries()].map(([mode, acc]) => ({
      lineId:          null,
      mode:            mode as Line['mode'],
      baseFare:        acc.baseSum  / acc.n,
      perKmRate:       acc.perKmSum / acc.n,
      flagDistanceKm:  FLAG_KM[mode] ?? 4,
    }));
    for (const def of DEFAULT_FARE_RULES) {
      if (!modeAccum.has(def.mode)) fareRules.push(def);
    }

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
