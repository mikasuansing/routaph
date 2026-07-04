import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { requireAuthenticatedUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userOrError = await requireAuthenticatedUser(req);
  if (userOrError instanceof Response) return userOrError;

  const { searchParams } = new URL(req.url);
  const stopId = searchParams.get('stopId');
  if (!stopId) return Errors.validation('stopId is required');

  return ok({ stopId, score: 82 });
}
