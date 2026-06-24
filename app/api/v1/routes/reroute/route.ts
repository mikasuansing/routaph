import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { planRoute } from '@/lib/routing/engine';
import { Errors, ok } from '@/lib/api/envelope';

export const dynamic = 'force-dynamic';

const modeEnum = z.enum(['jeepney', 'bus', 'mrt', 'lrt']);

const schema = z.object({
  origin:       z.object({ lat: z.number(), lng: z.number() }),
  destination:  z.object({ lat: z.number(), lng: z.number() }),
  departAt:     z.string().datetime().optional(),
  preference:   z.enum(['fastest', 'fewest_transfers', 'cheapest']).optional(),
  excludeLines: z.array(z.number().int().positive()).optional().default([]),
  excludeModes: z.array(modeEnum).optional().default([]),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { origin, destination, departAt, preference, excludeLines, excludeModes } = parsed.data;

  // Rate limiting
  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  const { loadTransitGraph } = await import('@/lib/supabase/graph-loader');
  const graph = await loadTransitGraph();

  const itineraries = planRoute(graph, {
    originLat:    origin.lat,
    originLng:    origin.lng,
    destLat:      destination.lat,
    destLng:      destination.lng,
    departAt:     departAt ? new Date(departAt) : undefined,
    preference,
    excludeLines: excludeLines.length ? excludeLines : undefined,
    excludeModes: excludeModes.length ? excludeModes : undefined,
  });

  if (itineraries.length === 0) return Errors.noRoute();

  return ok(itineraries);
}
