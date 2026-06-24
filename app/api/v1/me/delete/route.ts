import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';

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

// DELETE /api/v1/me/delete
// Permanently deletes the authenticated user's data and auth account.
// Order: app data first, then auth account last (cascade-safe).
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Errors.unauthorized();

  // Rate limiting — strict: deletion is not a spammable action
  try {
    const { authLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await authLimiter.limit(clientKey(req, user.id));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  const { supabaseServer } = await import('@/lib/supabase/server');

  // Delete app data first (order matters for FK constraints)
  const [routesDel, reportsDel] = await Promise.all([
    supabaseServer.from('saved_routes').delete().eq('user_id', user.id),
    supabaseServer.from('crowd_reports').delete().eq('user_id', user.id),
  ]);

  if (routesDel.error) return Errors.internal(`Failed to delete saved routes: ${routesDel.error.message}`);
  if (reportsDel.error && reportsDel.error.code !== '42P01') {
    // 42P01 = table does not exist — crowd_reports table might not be provisioned yet
    return Errors.internal(`Failed to delete crowd reports: ${reportsDel.error.message}`);
  }

  // Delete the auth.users record (service-role required)
  const { error: authError } = await supabaseServer.auth.admin.deleteUser(user.id);
  if (authError) return Errors.internal(`Failed to delete account: ${authError.message}`);

  return ok({ deleted: true });
}
