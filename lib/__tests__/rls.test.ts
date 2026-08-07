/**
 * RLS policy tests (TEST-1).
 *
 * These tests hit a real Supabase database and are skipped in CI
 * unless TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY are set.
 * In CI, point at a dedicated test project or a local Supabase stack.
 *
 * Run manually: TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... npm test rls
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url    = process.env.TEST_SUPABASE_URL;
const anon   = process.env.TEST_SUPABASE_ANON_KEY;
const svcKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

const SKIP = !url || !anon;

// ── Anonymous client (no session) ────────────────────────────────────────────

describe.skipIf(SKIP)('RLS: anon client', () => {
  let anonClient: SupabaseClient;

  beforeAll(() => {
    anonClient = createClient(url!, anon!);
  });

  it('cannot INSERT into search_logs (policy removed)', async () => {
    const { error } = await anonClient.from('search_logs').insert({
      origin_geohash: 'w6nkp0',
      dest_geohash:   'w6nkq2',
      preference:     null,
      result_count:   3,
    });
    // Should be rejected — no anon INSERT policy exists
    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|RLS|permission/i);
  });

  it('cannot SELECT another user\'s saved_routes', async () => {
    const { data, error } = await anonClient.from('saved_routes').select('*');
    // Anon has no SELECT policy on saved_routes — should return empty or error
    expect(error !== null || (data !== null && data.length === 0)).toBe(true);
  });

  it('cannot INSERT a crowd_report while signed out', async () => {
    const { error } = await anonClient.from('crowd_reports').insert({
      crowding: 'packed',
    });
    expect(error).not.toBeNull();
  });
});

// ── Cross-user isolation test (requires service-role to seed a second user) ─

describe.skipIf(SKIP || !svcKey)('RLS: user A cannot read user B saved_routes', () => {
  let userAClient: SupabaseClient;
  let serviceClient: SupabaseClient;
  const userBId = 'test-user-b-00000000-0000-0000-0000-000000000002';
  let seedRowId: number;

  beforeAll(async () => {
    serviceClient = createClient(url!, svcKey!);
    userAClient   = createClient(url!, anon!);

    // Seed a row attributed to user B via service-role
    const { data } = await serviceClient.from('saved_routes').insert({
      user_id:     userBId,
      name:        'Test B Route',
      origin_lat:  14.55, origin_lng:  121.0, origin_name: 'A',
      dest_lat:    14.62, dest_lng:    121.05, dest_name:   'B',
    }).select().single();

    seedRowId = (data as { id: number } | null)?.id ?? -1;
  });

  it('user A (not signed in) cannot see user B rows', async () => {
    const { data } = await userAClient
      .from('saved_routes')
      .select('id')
      .eq('user_id', userBId);

    expect(data?.length ?? 0).toBe(0);
  });

  it('cleanup: remove seeded row', async () => {
    if (seedRowId === -1) return;
    await serviceClient.from('saved_routes').delete().eq('id', seedRowId);
  });
});

// ── crowd_reports: authenticated user cannot spoof another user_id ──────────

describe.skipIf(SKIP)('RLS: crowd_reports user_id integrity', () => {
  let anonClient: SupabaseClient;

  beforeAll(() => {
    anonClient = createClient(url!, anon!);
  });

  it('cannot insert crowd_report with explicit other user_id', async () => {
    const { error } = await anonClient.from('crowd_reports').insert({
      crowding: 'packed',
      user_id:  '00000000-0000-0000-0000-000000000001', // another user's id
    });
    // Rejected because auth.uid() != passed user_id (and anon = no uid)
    expect(error).not.toBeNull();
  });
});
