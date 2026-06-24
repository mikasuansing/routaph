/**
 * Route handler tests (TEST-2).
 *
 * Strategy: import the actual POST/GET functions, mock out
 * `@/lib/redis/client` and `@/lib/ratelimit` so the routes
 * run without real Redis, and verify:
 *   - 400 on bad input
 *   - 401 when auth is required and no Bearer token provided
 *   - response shapes match the API envelope spec
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Shared mocks ─────────────────────────────────────────────────────────────

// Silence Redis / ratelimit — let every request through
vi.mock('@/lib/redis/client', () => ({
  redis:          { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
  ratelimit:      { limit: vi.fn().mockResolvedValue({ success: true }) },
  ROUTE_CACHE_TTL: 300,
  routeCacheKey:  vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  searchLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
  crowdLimiter:  { limit: vi.fn().mockResolvedValue({ success: true }) },
  authLimiter:   { limit: vi.fn().mockResolvedValue({ success: true }) },
  clientKey:     vi.fn().mockReturnValue('ip:127.0.0.1'),
}));

// Silence the graph loader so routing tests don't hit Supabase
vi.mock('@/lib/supabase/graph-loader', () => ({
  loadTransitGraph: vi.fn().mockResolvedValue({ nodes: new Map(), edges: new Map() }),
}));

// Silence Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('no token') }),
    },
  },
}));

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost:3000/api/test';
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── POST /api/v1/routes/plan ─────────────────────────────────────────────────

describe('POST /api/v1/routes/plan', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/routes/plan/route'));
  });

  it('returns 400 when body is missing required fields', async () => {
    const req = makeRequest('POST', {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('validation_error');
  });

  it('returns 400 when coordinates are outside Metro Manila bbox', async () => {
    const req = makeRequest('POST', {
      origin:      { lat: 0, lng: 0 },
      destination: { lat: 14.5, lng: 121.0 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const url = 'http://localhost:3000/api/test';
    const req = new NextRequest(url, {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 no_route_found with mocked empty graph', async () => {
    const req = makeRequest('POST', {
      origin:      { lat: 14.55, lng: 121.0 },
      destination: { lat: 14.62, lng: 121.05 },
    });
    const res = await POST(req);
    // With mocked empty graph, engine returns [] → no_route_found 404
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe('no_route_found');
  });
});

// ── GET /api/v1/me/routes ────────────────────────────────────────────────────

describe('GET /api/v1/me/routes', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/me/routes/route'));
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const req = makeRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('unauthorized');
  });

  it('returns 401 when token is invalid', async () => {
    const req = makeRequest('GET', undefined, { authorization: 'Bearer invalid-token' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/me/routes ───────────────────────────────────────────────────

describe('POST /api/v1/me/routes', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/me/routes/route'));
  });

  it('returns 401 with no auth', async () => {
    const req = makeRequest('POST', { name: 'test' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 with bad body when auth mock returns a user', async () => {
    // Override auth mock to simulate a logged-in user
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'test@test.com' } as never },
      error: null,
    });

    // Empty name fails SavedRouteSchema validation → 400
    const req = makeRequest('POST', { name: '' }, { authorization: 'Bearer valid' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('validation_error');
  });
});

// ── GET /api/v1/disruptions ──────────────────────────────────────────────────

describe('GET /api/v1/disruptions', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/disruptions/route'));
  });

  it('returns 400 on invalid lineId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/disruptions?lineId=abc');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with data array on valid request (Supabase unconfigured → empty)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/disruptions');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });
});

// ── GET /api/v1/transport/options ────────────────────────────────────────────

describe('GET /api/v1/transport/options', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/transport/options/route'));
  });

  it('returns 400 when lat/lng are non-numeric strings', async () => {
    // z.coerce.number() coerces null → 0 (valid) but NaN-producing strings → fail
    const url = 'http://localhost:3000/api/v1/transport/options?originLat=abc&originLng=abc&destLat=abc&destLng=abc';
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with provider list on valid params', async () => {
    const url = 'http://localhost:3000/api/v1/transport/options?originLat=14.55&originLng=121.0&destLat=14.62&destLng=121.05';
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    // Each provider must have a disclaimer (anti-goal: no unlabeled fare estimates)
    for (const item of json.data) {
      expect(item).toHaveProperty('disclaimer');
      expect(typeof item.disclaimer).toBe('string');
    }
  });
});
