import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok, okList } from '@/lib/api/envelope';

export const dynamic = 'force-dynamic';

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

const createSchema = z.object({
  name:        z.string().min(1).max(120),
  originLat:   z.number(),
  originLng:   z.number(),
  originName:  z.string().min(1),
  destLat:     z.number(),
  destLng:     z.number(),
  destName:    z.string().min(1),
});

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Errors.unauthorized();

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data, error } = await supabaseServer
    .from('saved_routes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return Errors.internal(error.message);
  return okList(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Errors.unauthorized();

  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data, error } = await supabaseServer
    .from('saved_routes')
    .insert({
      user_id:     user.id,
      name:        parsed.data.name,
      origin_lat:  parsed.data.originLat,
      origin_lng:  parsed.data.originLng,
      origin_name: parsed.data.originName,
      dest_lat:    parsed.data.destLat,
      dest_lng:    parsed.data.destLng,
      dest_name:   parsed.data.destName,
    })
    .select()
    .single();

  if (error) return Errors.internal(error.message);
  return ok(data, 201);
}
