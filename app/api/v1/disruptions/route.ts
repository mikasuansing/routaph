import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  lineId: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ lineId: searchParams.get('lineId') ?? undefined });
  if (!parsed.success) {
    return Errors.validation('Invalid lineId parameter');
  }

  const { lineId } = parsed.data;

  // No Supabase configured — return empty list (dev / test)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return ok([]);
  }

  try {
    const { supabaseServer } = await import('@/lib/supabase/server');
    const now = new Date().toISOString();

    let query = supabaseServer
      .from('service_disruptions')
      .select('id, corridor_id, start_at, end_at, description')
      .lte('start_at', now)
      .or(`end_at.is.null,end_at.gt.${now}`)
      .order('start_at', { ascending: false });

    if (lineId !== undefined) {
      query = query.eq('corridor_id', lineId);
    }

    const { data, error } = await query;
    if (error) return Errors.internal(error.message);

    const disruptions = (data ?? []).map(r => ({
      id:          r.id,
      corridorId:  r.corridor_id,
      startAt:     r.start_at,
      endAt:       r.end_at ?? null,
      description: r.description,
    }));

    return ok(disruptions);
  } catch {
    return ok([]); // graceful fallback — trip tracking must not break if DB is down
  }
}
