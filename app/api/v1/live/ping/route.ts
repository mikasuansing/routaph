import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';
import { MAX_ACCURACY_M, inferDirection, snapToLine } from '@/lib/live/estimate';
import { TRACKED_MODES } from '@/lib/live/tracked';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  lineId:    z.number().int().positive(),
  riderKey:  z.string().min(16).max(64),
  lat:       z.number().min(-90).max(90),
  lng:       z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Errors.validation('Body must be valid JSON');
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid ping payload', {
      issues: parsed.error.issues.map(i => i.path.join('.')),
    });
  }

  const { lineId, riderKey, lat, lng, accuracyM } = parsed.data;

  // A poor fix is dropped at the door rather than stored — a 500 m urban
  // canyon reading would drag the whole cluster off the line.
  if (accuracyM > MAX_ACCURACY_M) {
    return ok({ accepted: false }, 202);
  }

  try {
    const { crowdLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await crowdLimiter.limit(`live:${clientKey(req)}`);
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis unset in dev — fall through; the store call below will fail
    // gracefully if it's genuinely unavailable.
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Errors.unavailable('Live tracking is not configured');
  }

  try {
    const { loadTransitGraph } = await import('@/lib/supabase/graph-loader');
    const graph = await loadTransitGraph();
    const lineData = graph.lines.get(lineId);
    if (!lineData) return Errors.notFound('Line');

    // Rail and the EDSA Carousel only. Jeepney routes overlap on shared
    // roads, so a ping can't be honestly attributed to one of them.
    if (!TRACKED_MODES.includes(lineData.line.mode)) {
      return ok({ accepted: false }, 202);
    }

    const snapped = snapToLine(lat, lng, lineData.stops);
    if (!snapped) return ok({ accepted: false }, 202);

    const { recordPing } = await import('@/lib/live/store');
    const direction = await recordPing(
      lineId,
      { riderKey, lat, lng, accuracyM, ts: Date.now() },
      snapped.index,
      inferDirection,
    );

    // A null direction is a normal outcome (first ping of a trip, or the
    // rider hasn't passed a stop yet), not an error.
    return ok({ accepted: direction !== null }, 202);
  } catch {
    return Errors.unavailable('Could not record position');
  }
}
