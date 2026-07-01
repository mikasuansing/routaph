import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';
import { requireAuthenticatedUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  minutes: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const userOrError = await requireAuthenticatedUser(req);
  if (userOrError instanceof Response) return userOrError;

  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Errors.validation('Invalid request');

  return ok({ ok: true, center: { lat: parsed.data.lat, lng: parsed.data.lng }, minutes: parsed.data.minutes ?? 20 });
}
