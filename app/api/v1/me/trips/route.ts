import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { z } from 'zod';
import { requireAuthenticatedUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

const schema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  distanceKm: z.number().min(0),
  fareEstimate: z.number().min(0),
  modesUsed: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const userOrError = await requireAuthenticatedUser(req);
  if (userOrError instanceof Response) return userOrError;
  const user = userOrError;

  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Errors.validation('Invalid request');

  try {
    const { supabaseServer } = await import('@/lib/supabase/server');
    const { error } = await supabaseServer.from('trip_history').insert({
      user_id: user.id,
      origin: parsed.data.origin,
      destination: parsed.data.destination,
      distance_km: parsed.data.distanceKm,
      fare_estimate: parsed.data.fareEstimate,
      modes_used: parsed.data.modesUsed,
    });

    if (error) return Errors.internal(error.message);
    return ok({ ok: true }, 201);
  } catch {
    return Errors.internal('Unable to save trip history');
  }
}
