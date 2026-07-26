import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { StationAccessibilityUpdateSchema } from '@/lib/validation';

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

// No roles table in this schema — the simplest gate that isn't "anyone
// logged in": an email allowlist from a server-only env var.
function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Errors.unauthorized();
  if (!isAdminEmail(user.email)) return Errors.forbidden();

  try {
    const { authLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await authLimiter.limit(clientKey(req, user.id));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = StationAccessibilityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data, error } = await supabaseServer
    .from('station_accessibility')
    .upsert(
      {
        stop_id: parsed.data.stopId,
        feature: parsed.data.feature,
        status: parsed.data.status,
        note: parsed.data.note ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: 'stop_id,feature' },
    )
    .select('stop_id, feature, status, note, updated_at')
    .single();

  if (error) return Errors.internal(error.message);
  return ok({
    stopId: data.stop_id,
    feature: data.feature,
    status: data.status,
    note: data.note,
    updatedAt: data.updated_at,
  });
}
