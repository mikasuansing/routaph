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

// Never hit the real Open-Meteo API in tests
vi.mock('@/lib/weather', () => ({
  fetchOpenMeteoForecast: vi.fn().mockResolvedValue({
    current: { precipitation: 0, rain: 0 },
    hourly: { precipitation_probability: [10, 10], rain: [0, 0] },
  }),
  interpretForecast: vi.fn().mockReturnValue({
    heavyRainExpected: false, currentPrecipitationMm: 0, maxProbabilityPercent: 10, message: 'No heavy rain expected',
  }),
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

  it('returns 400 when all four modes are excluded', async () => {
    const req = makeRequest('POST', {
      origin:       { lat: 14.55, lng: 121.0 },
      destination:  { lat: 14.62, lng: 121.05 },
      excludeModes: ['jeepney', 'bus', 'mrt', 'lrt'],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('validation_error');
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

// ── POST /api/v1/routes/reroute ────────────────────────────────────────────

describe('POST /api/v1/routes/reroute', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/routes/reroute/route'));
  });

  it('returns 400 when body is missing required fields', async () => {
    const req = makeRequest('POST', { origin: { lat: 14.55, lng: 121.0 } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('validation_error');
  });

  it('is guest-accessible: returns 404 no_route (not 401) with mocked empty graph', async () => {
    const req = makeRequest('POST', {
      origin:      { lat: 14.55, lng: 121.0 },
      destination: { lat: 14.62, lng: 121.05 },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/transport/options (guest access) ─────────────────────────────

describe('GET /api/v1/transport/options (guest access)', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/transport/options/route'));
  });

  it('returns 400 when coordinates are out of range', async () => {
    const url = 'http://localhost:3000/api/v1/transport/options?originLat=95&originLng=121.0&destLat=14.62&destLng=121.05';
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/geo/isochrone ─────────────────────────────────────────────

describe('POST /api/v1/geo/isochrone', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/geo/isochrone/route'));
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeRequest('POST', { lat: 14.55, lng: 121.0, minutes: 20 });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/accessibility/score ────────────────────────────────────────

describe('GET /api/v1/accessibility/score', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/accessibility/score/route'));
  });

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/accessibility/score?stopId=1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/me/trips ───────────────────────────────────────────────────

describe('POST /api/v1/me/trips', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/me/trips/route'));
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeRequest('POST', {
      origin: 'Katipunan',
      destination: 'UP Diliman',
      distanceKm: 4.2,
      fareEstimate: 42,
      modesUsed: ['lrt', 'walk'],
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
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

// ── POST /api/v1/crowd-reports ───────────────────────────────────────────────

describe('POST /api/v1/crowd-reports', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/crowd-reports/route'));
  });

  it('returns 401 with no auth', async () => {
    const req = makeRequest('POST', { stopId: 1, category: 'wrong_fare' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('unauthorized');
  });

  it('returns 400 when category is not recognized', async () => {
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'test@test.com' } as never },
      error: null,
    });
    const req = makeRequest('POST', { stopId: 1, category: 'not_a_real_category' }, { authorization: 'Bearer valid' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'test@test.com' } as never },
      error: null,
    });
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST', body: 'not-json',
      headers: { 'content-type': 'application/json', authorization: 'Bearer valid' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created report on a valid authenticated request', async () => {
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'test@test.com' } as never },
      error: null,
    });
    vi.mocked(supabaseServer.from).mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 1, stop_id: 5, route_id: null, note: '[wrong_stop] Pin is off', created_at: '2026-07-26T00:00:00Z' },
        error: null,
      }),
    } as never);
    const req = makeRequest('POST', { stopId: 5, category: 'wrong_stop', note: 'Pin is off' }, { authorization: 'Bearer valid' });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    // The DB's crowding CHECK constraint means category is encoded into
    // `note` (see route.ts) — the API still returns it decoded as `category`.
    expect(json.data).toMatchObject({ id: 1, stopId: 5, category: 'wrong_stop', note: 'Pin is off' });
  });
});

// ── GET /api/v1/crowd-reports ────────────────────────────────────────────────

describe('GET /api/v1/crowd-reports', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/crowd-reports/route'));
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const req = makeRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const req = makeRequest('GET', undefined, { authorization: 'Bearer invalid-token' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with an array (own reports only) for an authenticated user', async () => {
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'test@test.com' } as never },
      error: null,
    });
    vi.mocked(supabaseServer.from).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockResolvedValue({ data: [], error: null }),
    } as never);
    const req = makeRequest('GET', undefined, { authorization: 'Bearer valid' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
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

// ── GET /api/v1/station-accessibility ────────────────────────────────────────

describe('GET /api/v1/station-accessibility', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/station-accessibility/route'));
  });

  it('returns 400 on invalid stopId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/station-accessibility?stopId=abc');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with data array on valid request (Supabase unconfigured → empty)', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/station-accessibility');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('returns 400 on a non-positive stopId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/station-accessibility?stopId=0');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/v1/admin/station-accessibility ────────────────────────────────

describe('PATCH /api/v1/admin/station-accessibility', () => {
  let PATCH: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.ADMIN_EMAILS;
    ({ PATCH } = await import('../v1/admin/station-accessibility/route'));
  });

  function makePatchRequest(body?: unknown, headers?: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost:3000/api/test', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  it('returns 401 with no auth', async () => {
    const req = makePatchRequest({ stopId: 1, feature: 'elevator', status: 'operational' });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the authenticated email is not in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'someone-else@parapo.app';
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'not-admin@parapo.app' } as never },
      error: null,
    });
    const req = makePatchRequest(
      { stopId: 1, feature: 'elevator', status: 'operational' },
      { authorization: 'Bearer valid' },
    );
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid status value, even for an allowlisted admin', async () => {
    process.env.ADMIN_EMAILS = 'admin@parapo.app';
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'admin@parapo.app' } as never },
      error: null,
    });
    const req = makePatchRequest(
      { stopId: 1, feature: 'elevator', status: 'definitely_broken' },
      { authorization: 'Bearer valid' },
    );
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with the updated row for an allowlisted admin', async () => {
    process.env.ADMIN_EMAILS = 'admin@parapo.app';
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'admin@parapo.app' } as never },
      error: null,
    });
    vi.mocked(supabaseServer.from).mockReturnValueOnce({
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { stop_id: 201, feature: 'elevator', status: 'out_of_service', note: 'Reported by rider', updated_at: '2026-07-26T00:00:00Z' },
        error: null,
      }),
    } as never);
    const req = makePatchRequest(
      { stopId: 201, feature: 'elevator', status: 'out_of_service', note: 'Reported by rider' },
      { authorization: 'Bearer valid' },
    );
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ stopId: 201, feature: 'elevator', status: 'out_of_service' });
  });
});

// ── GET /api/v1/weather/advisory ─────────────────────────────────────────────

describe('GET /api/v1/weather/advisory', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import('../v1/weather/advisory/route'));
  });

  it('returns 200 with the advisory shape', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/weather/advisory');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.data.heavyRainExpected).toBe('boolean');
    expect(typeof json.data.message).toBe('string');
  });

  it('returns 429 when rate limited', async () => {
    const { searchLimiter } = await import('@/lib/ratelimit');
    vi.mocked(searchLimiter.limit).mockResolvedValueOnce({ success: false } as never);
    const req = new NextRequest('http://localhost:3000/api/v1/weather/advisory');
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it('never returns 500, even if the forecast fetch throws', async () => {
    const { fetchOpenMeteoForecast } = await import('@/lib/weather');
    vi.mocked(fetchOpenMeteoForecast).mockRejectedValueOnce(new Error('network down'));
    const req = new NextRequest('http://localhost:3000/api/v1/weather/advisory');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.heavyRainExpected).toBe(false);
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
