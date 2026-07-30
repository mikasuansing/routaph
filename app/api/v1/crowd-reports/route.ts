import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { IssueReportSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// crowd_reports.crowding has a live DB CHECK constraint limited to
// empty/moderate/packed (confirmed by probing the constraint directly —
// no migration captures it, another instance of the pre-existing schema
// drift documented in supabase/migrations/007_crowd_reports_own_only.sql).
// 'moderate' is an inert filler; the real signal lives in `note`, which we
// prefix with "[category] " and parse back out below. See IssueReportSchema.
const CROWDING_FILLER = 'moderate';

function encodeNote(category: string, note?: string): string {
  return `[${category}] ${note ?? ''}`.trim();
}

function decodeNote(stored: string | null): { category: string | null; note: string | null } {
  if (!stored) return { category: null, note: null };
  const match = stored.match(/^\[(\w+)\]\s?/);
  if (!match) return { category: null, note: stored };
  const rest = stored.slice(match[0].length).trim();
  return { category: match[1], note: rest.length > 0 ? rest : null };
}

// Anonymous submission — the app has no accounts. Writes go through the
// service-role key (bypasses RLS), so nothing here relies on a Supabase
// session; rate limiting is IP-keyed instead of user-keyed. There is no GET:
// reports were never surfaced back to the submitter, and without accounts
// there's no "your reports" to scope a read to.
export async function POST(req: NextRequest) {
  try {
    const { crowdLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await crowdLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return Errors.validation('Request body must be valid JSON'); }

  const parsed = IssueReportSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation('Invalid request', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data, error } = await supabaseServer
    .from('crowd_reports')
    .insert({
      stop_id:  parsed.data.stopId ?? null,
      route_id: parsed.data.routeId ?? null,
      crowding: CROWDING_FILLER,
      note:     encodeNote(parsed.data.category, parsed.data.note),
    })
    .select('id, stop_id, route_id, note, created_at')
    .single();

  if (error) return Errors.internal(error.message);
  const { category, note } = decodeNote(data.note);
  return ok(
    {
      id: data.id,
      stopId: data.stop_id,
      routeId: data.route_id,
      category,
      note,
      createdAt: data.created_at,
    },
    201,
  );
}
