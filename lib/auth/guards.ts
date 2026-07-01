import type { NextRequest } from 'next/server';
import { Errors } from '@/lib/api/envelope';

export async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies.get('parapo_session')?.value;

  if (!token) return null;

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function requireAuthenticatedUser(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) return Errors.unauthorized();
  return user;
}
