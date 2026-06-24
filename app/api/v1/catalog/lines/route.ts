import { type NextRequest } from 'next/server';
import { ok } from '@/lib/api/envelope';
import { seedLines, seedLineStops, seedStops } from '@/lib/routing/graph';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Rate limiting
  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) {
      const { Errors } = await import('@/lib/api/envelope');
      return Errors.rateLimited();
    }
  } catch {
    // Redis not configured — skip in dev
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseServer } = await import('@/lib/supabase/server');
      const [corridorsRes, routesRes, rsRes, stopsRes] = await Promise.all([
        supabaseServer.from('corridors').select('id, name, mode, color').order('id'),
        supabaseServer.from('routes').select('id, corridor_id, name, direction'),
        supabaseServer.from('route_stops').select('route_id, stop_id, seq').order('seq'),
        supabaseServer.from('stops').select('id, name, lat, lng'),
      ]);

      const corridors = corridorsRes.data ?? [];
      const routes    = routesRes.data ?? [];
      const rs        = rsRes.data ?? [];
      const stops     = stopsRes.data ?? [];

      if (corridors.length > 0) {
        const stopMap = new Map(stops.map(s => [s.id, s]));

        const lines = corridors.map(corridor => {
          const corridorRoutes = routes.filter(r => r.corridor_id === corridor.id);
          const stopIds = new Set<number>();
          for (const route of corridorRoutes) {
            rs.filter(r => r.route_id === route.id).forEach(r => stopIds.add(r.stop_id));
          }
          return {
            id:         corridor.id,
            name:       corridor.name,
            mode:       corridor.mode,
            color:      corridor.color,
            stopCount:  stopIds.size,
            stops:      [...stopIds].map(id => stopMap.get(id)).filter(Boolean),
          };
        });

        return ok(lines);
      }
    } catch {
      // fall through to seed
    }
  }

  const stopMap = new Map(seedStops.map(s => [s.id, s]));
  const lines = seedLines.map(line => {
    const stopIds = (seedLineStops.find(([lid]) => lid === line.id)?.[1]) ?? [];
    return { ...line, stopCount: stopIds.length, stops: stopIds.map(id => stopMap.get(id)).filter(Boolean) };
  });
  return ok(lines);
}
