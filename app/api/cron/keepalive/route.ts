import { type NextRequest } from 'next/server';
import { ok, Errors } from '@/lib/api/envelope';

export const dynamic = 'force-dynamic';

/**
 * Keep-alive: runs a trivial real database read so the free-tier Supabase
 * project registers activity and never hits the ~7-day idle auto-pause that
 * would take the whole app offline. Invoked daily by Vercel Cron (vercel.json).
 *
 * Secured only when CRON_SECRET is set: Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` to cron routes when that env var
 * exists. If it isn't set, the endpoint stays open — the query is a harmless
 * count, so this is safe out of the box and can be tightened later.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Errors.unauthorized();
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return ok({ pinged: false, reason: 'supabase_unconfigured' });
  }

  try {
    const { supabaseServer } = await import('@/lib/supabase/server');
    // A real, indexed read — this is what counts as DB activity for Supabase.
    const { error } = await supabaseServer
      .from('corridors')
      .select('id', { head: true, count: 'exact' });
    if (error) return Errors.internal(error.message);
    return ok({ pinged: true, at: new Date().toISOString() });
  } catch {
    return Errors.internal('keepalive query failed');
  }
}
