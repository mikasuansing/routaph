import type { NextRequest } from 'next/server';
import { Errors } from '@/lib/api/envelope';

export async function getAuthenticatedUser(req: NextRequest) {
  // Bearer-only, matching proxy.ts — the legacy parapo_session cookie is gone
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

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
