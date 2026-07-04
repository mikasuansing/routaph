import { Errors, ok } from '@/lib/api/envelope';
import { seedLines, seedLineStops, seedStops } from '@/lib/routing/graph';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  // Explicit shape — the RouteContext global only exists after `next build`
  // generates .next/types, which CI's typecheck step doesn't have.
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const lineId = Number(id);
  if (isNaN(lineId)) return Errors.validation('id must be a number');

  // Try Supabase first
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseServer } = await import('@/lib/supabase/server');
      const { data: corridor, error } = await supabaseServer
        .from('corridors')
        .select('id, name, mode, color')
        .eq('id', lineId)
        .single();

      if (!error && corridor) {
        const { data: routes } = await supabaseServer
          .from('routes')
          .select('id')
          .eq('corridor_id', lineId);

        const routeIds = (routes ?? []).map(r => r.id);
        const { data: rsRows } = await supabaseServer
          .from('route_stops')
          .select('stop_id, stops(id, name, lat, lng)')
          .in('route_id', routeIds);

        type StopRow = { id: number; name: string; lat: number | null; lng: number | null };
        type RsRow = { stop_id: number; stops: StopRow | StopRow[] | null };
        const stopsMap = new Map<number, StopRow>();
        for (const rs of (rsRows ?? []) as unknown as RsRow[]) {
          const stop = Array.isArray(rs.stops) ? rs.stops[0] : rs.stops;
          if (stop && !stopsMap.has(rs.stop_id)) {
            stopsMap.set(rs.stop_id, stop);
          }
        }

        return ok({
          id:    corridor.id,
          name:  corridor.name,
          mode:  corridor.mode,
          color: corridor.color,
          stops: [...stopsMap.values()].filter(s => s.lat != null && s.lng != null),
        });
      }
    } catch {
      // fall through to seed
    }
  }

  // Seed fallback
  const line = seedLines.find(l => l.id === lineId);
  if (!line) return Errors.notFound('Line');

  const stopMap = new Map(seedStops.map(s => [s.id, s]));
  const stopIds = (seedLineStops.find(([lid]) => lid === lineId)?.[1]) ?? [];
  return ok({ ...line, stops: stopIds.map(id => stopMap.get(id)).filter(Boolean) });
}
