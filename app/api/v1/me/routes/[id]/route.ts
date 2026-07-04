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

export async function DELETE(
  req: NextRequest,
  // Explicit shape — the RouteContext global only exists after `next build`
  // generates .next/types, which CI's typecheck step doesn't have.
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return Errors.unauthorized();

  const { id } = await ctx.params;
  const { supabaseServer } = await import('@/lib/supabase/server');

  const { error, count } = await supabaseServer
    .from('saved_routes')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return Errors.internal(error.message);
  if (count === 0) return Errors.notFound('Saved route');
  return ok({ ok: true });
}
