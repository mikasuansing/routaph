/**
 * Contract tests for the crowdsourced live-tracking endpoints.
 *
 * Kept separate from route-handlers.test.ts because these need a graph
 * mock with a real `lines` map (to snap pings onto a stop sequence) and a
 * stateful in-memory stand-in for the Redis sorted set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Mode } from '@/lib/routing/types';

const STOPS = [
  { id: 1, name: 'Alpha',   lat: 14.500, lng: 121.000 },
  { id: 2, name: 'Bravo',   lat: 14.510, lng: 121.000 },
  { id: 3, name: 'Charlie', lat: 14.520, lng: 121.000 },
  { id: 4, name: 'Delta',   lat: 14.530, lng: 121.000 },
];

// Line 1 is trackable rail; line 2 is a jeepney line, which must never be
// tracked no matter what a client posts.
vi.mock('@/lib/supabase/graph-loader', () => ({
  loadTransitGraph: vi.fn().mockResolvedValue({
    nodes: new Map(),
    lines: new Map([
      [1, { line: { id: 1, name: 'Test Rail', mode: 'mrt' as Mode, color: '#000' }, stops: STOPS }],
      [2, { line: { id: 2, name: 'Test Jeep', mode: 'jeepney' as Mode, color: '#111' }, stops: STOPS }],
    ]),
    fareRules: [],
  }),
}));

vi.mock('@/lib/ratelimit', () => ({
  searchLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
  crowdLimiter:  { limit: vi.fn().mockResolvedValue({ success: true }) },
  authLimiter:   { limit: vi.fn().mockResolvedValue({ success: true }) },
  clientKey:     vi.fn().mockReturnValue('ip:127.0.0.1'),
}));

// Minimal in-memory Redis: enough of get/set/zadd/zrange for the store.
const kv = new Map<string, unknown>();
const zsets = new Map<string, Array<{ score: number; member: string }>>();

vi.mock('@/lib/redis/client', () => ({
  redis: {
    get: vi.fn(async (k: string) => kv.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown) => { kv.set(k, v); }),
    expire: vi.fn(async () => 1),
    zadd: vi.fn(async (k: string, entry: { score: number; member: string }) => {
      const arr = zsets.get(k) ?? [];
      arr.push(entry);
      zsets.set(k, arr);
    }),
    zremrangebyscore: vi.fn(async (k: string, min: number, max: number) => {
      const arr = (zsets.get(k) ?? []).filter(e => e.score < min || e.score > max);
      zsets.set(k, arr);
    }),
    zrange: vi.fn(async (k: string, min: number, max: number) =>
      (zsets.get(k) ?? []).filter(e => e.score >= min && e.score <= max).map(e => e.member),
    ),
  },
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  ROUTE_CACHE_TTL: 300,
  routeCacheKey: vi.fn(),
}));

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/live/ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(qs = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/live/vehicles${qs}`);
}

const RIDER = 'rider-key-0123456789abcdef';

describe('POST /api/v1/live/ping', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    kv.clear();
    zsets.clear();
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    ({ POST } = await import('../v1/live/ping/route'));
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/live/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    expect((await POST(req)).status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(postReq({ lineId: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation_error');
  });

  it('returns 400 for an out-of-range coordinate', async () => {
    const res = await POST(postReq({
      lineId: 1, riderKey: RIDER, lat: 999, lng: 121, accuracyM: 10,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a riderKey that is too short to be random', async () => {
    const res = await POST(postReq({
      lineId: 1, riderKey: 'short', lat: 14.5, lng: 121, accuracyM: 10,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a line that does not exist', async () => {
    const res = await POST(postReq({
      lineId: 999, riderKey: RIDER, lat: 14.5, lng: 121, accuracyM: 10,
    }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('rejects a low-quality fix without storing it', async () => {
    const res = await POST(postReq({
      lineId: 1, riderKey: RIDER, lat: 14.5, lng: 121, accuracyM: 500,
    }));
    expect(res.status).toBe(202);
    expect((await res.json()).data.accepted).toBe(false);
    expect(zsets.size).toBe(0);
  });

  it('refuses to track a jeepney line', async () => {
    // Jeepney routes share roads, so a ping can't be attributed honestly.
    const res = await POST(postReq({
      lineId: 2, riderKey: RIDER, lat: 14.5, lng: 121, accuracyM: 10,
    }));
    expect(res.status).toBe(202);
    expect((await res.json()).data.accepted).toBe(false);
    expect(zsets.size).toBe(0);
  });

  it('does not accept a first ping — there is no direction yet', async () => {
    const res = await POST(postReq({
      lineId: 1, riderKey: RIDER, lat: 14.500, lng: 121.000, accuracyM: 10,
    }));
    expect(res.status).toBe(202);
    expect((await res.json()).data.accepted).toBe(false);
  });

  it('accepts the second ping once a direction can be inferred', async () => {
    await POST(postReq({ lineId: 1, riderKey: RIDER, lat: 14.500, lng: 121.0, accuracyM: 10 }));
    const res = await POST(postReq({ lineId: 1, riderKey: RIDER, lat: 14.520, lng: 121.0, accuracyM: 10 }));
    expect(res.status).toBe(202);
    expect((await res.json()).data.accepted).toBe(true);
  });

  it('returns 503 when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    vi.resetModules();
    ({ POST } = await import('../v1/live/ping/route'));
    const res = await POST(postReq({
      lineId: 1, riderKey: RIDER, lat: 14.5, lng: 121, accuracyM: 10,
    }));
    expect(res.status).toBe(503);
  });
});

describe('GET /api/v1/live/vehicles', () => {
  let GET: (req: NextRequest) => Promise<Response>;
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    kv.clear();
    zsets.clear();
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    ({ GET } = await import('../v1/live/vehicles/route'));
    ({ POST } = await import('../v1/live/ping/route'));
  });

  it('returns 400 for a non-numeric lineId', async () => {
    const res = await GET(getReq('?lineId=abc'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation_error');
  });

  it('returns 400 for a negative lineId', async () => {
    expect((await GET(getReq('?lineId=-5'))).status).toBe(400);
  });

  it('returns an empty list when nobody is sharing', async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('returns an empty list rather than an error when Redis is unset', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    vi.resetModules();
    ({ GET } = await import('../v1/live/vehicles/route'));
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('surfaces a vehicle estimate once a rider has established a direction', async () => {
    await POST(postReq({ lineId: 1, riderKey: RIDER, lat: 14.500, lng: 121.0, accuracyM: 10 }));
    await POST(postReq({ lineId: 1, riderKey: RIDER, lat: 14.520, lng: 121.0, accuracyM: 10 }));

    const res = await GET(getReq());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toMatchObject({
      lineId: 1,
      lineName: 'Test Rail',
      mode: 'mrt',
      direction: 'forward',
      riderCount: 1,
      confidence: 'low',
    });
    expect(typeof json.data[0].updatedAt).toBe('string');
  });

  it('filters by lineId when asked', async () => {
    await POST(postReq({ lineId: 1, riderKey: RIDER, lat: 14.500, lng: 121.0, accuracyM: 10 }));
    await POST(postReq({ lineId: 1, riderKey: RIDER, lat: 14.520, lng: 121.0, accuracyM: 10 }));

    const match = await GET(getReq('?lineId=1'));
    expect((await match.json()).data).toHaveLength(1);

    // Line 2 is a jeepney line, so it is never tracked and never returned.
    const other = await GET(getReq('?lineId=2'));
    expect((await other.json()).data).toEqual([]);
  });
});
