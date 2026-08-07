import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  stopId: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ stopId: searchParams.get('stopId') ?? undefined });
  if (!parsed.success) return Errors.validation('Invalid stopId parameter');

  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return ok([]);
  }

  try {
    const { supabaseServer } = await import('@/lib/supabase/server');
    let query = supabaseServer
      .from('station_accessibility')
      .select('stop_id, feature, status, note, updated_at');

    if (parsed.data.stopId !== undefined) {
      query = query.eq('stop_id', parsed.data.stopId);
    }

    const { data, error } = await query;
    if (error) {
      // Table not deployed yet (migration 008 pending) — this is optional
      // infrastructure, so an empty list beats a 500 on every route detail load.
      if (error.message.includes('station_accessibility')) return ok([]);
      return Errors.internal(error.message);
    }

    return ok(
      (data ?? []).map(r => ({
        stopId: r.stop_id,
        feature: r.feature,
        status: r.status,
        note: r.note,
        updatedAt: r.updated_at,
      })),
    );
  } catch {
    return ok([]); // graceful fallback — DB hiccups must not break route detail
  }
}
