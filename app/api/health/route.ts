import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'error' | 'unconfigured'> = {};

  // Supabase ping
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      checks.supabase = 'unconfigured';
    } else {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(3000),
      });
      checks.supabase = res.ok ? 'ok' : 'error';
    }
  } catch {
    checks.supabase = 'error';
  }

  // Redis ping
  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!redisUrl || !redisToken) {
      checks.redis = 'unconfigured';
    } else {
      const res = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(3000),
      });
      checks.redis = res.ok ? 'ok' : 'error';
    }
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every(v => v === 'ok' || v === 'unconfigured');
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    { ok: allOk, checks, ts: new Date().toISOString() },
    { status },
  );
}
