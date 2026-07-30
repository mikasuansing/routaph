import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';
import { clusterPings, type VehicleEstimate } from '@/lib/live/estimate';
import { TRACKED_MODES } from '@/lib/live/tracked';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  lineId: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    lineId: searchParams.get('lineId') ?? undefined,
  });
  if (!parsed.success) return Errors.validation('Invalid lineId parameter');

  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  // Live tracking is a bonus layer over a working planner. With no Redis
  // there are simply no vehicles to show, which is an empty map, not an
  // error the rest of the app should have to handle.
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return ok([]);
  }

  try {
    const { loadTransitGraph } = await import('@/lib/supabase/graph-loader');
    const { readPings } = await import('@/lib/live/store');
    const graph = await loadTransitGraph();

    const targets = [...graph.lines.values()].filter(ld =>
      TRACKED_MODES.includes(ld.line.mode) &&
      (parsed.data.lineId === undefined || ld.line.id === parsed.data.lineId),
    );

    const now = Date.now();
    const all: VehicleEstimate[] = [];
    for (const ld of targets) {
      const pings = await readPings(ld.line.id, now);
      if (pings.length === 0) continue;
      all.push(...clusterPings(pings, ld.line, ld.stops, now));
    }

    // Busiest estimates first — the ones backed by the most riders are the
    // ones worth reading if the list is truncated on a small screen.
    all.sort((a, b) => b.riderCount - a.riderCount);
    return ok(all);
  } catch {
    return ok([]); // never break the map over a live-hint failure
  }
}
