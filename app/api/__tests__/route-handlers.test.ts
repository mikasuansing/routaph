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
  liveLimiter:   { limit: vi.fn().mockResolvedValue({ success: true }) },
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

// /api/v1/geo/isochrone and /api/v1/accessibility/score were deleted along
// with the account system. Both were auth-gated stubs — permanently 401 in
// an app with no login — and neither was ever called by the UI. The
// accessibility one also returned a hardcoded score of 82, which is exactly
// the kind of invented figure this project refuses to ship.

// ── POST /api/v1/me/* — deleted with saved commutes / trip history (no auth
// model in the app any more, see BASELINE.md scope note)

// ── POST /api/v1/crowd-reports ───────────────────────────────────────────────

describe('POST /api/v1/crowd-reports', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    ({ POST } = await import('../v1/crowd-reports/route'));
  });

  it('returns 400 when category is not recognized', async () => {
    const req = makeRequest('POST', { stopId: 1, category: 'not_a_real_category' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST', body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created report on a valid anonymous request', async () => {
    const { supabaseServer } = await import('@/lib/supabase/server');
    vi.mocked(supabaseServer.from).mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 1, stop_id: 5, route_id: null, note: '[wrong_stop] Pin is off', created_at: '2026-07-26T00:00:00Z' },
        error: null,
      }),
    } as never);
    const req = makeRequest('POST', { stopId: 5, category: 'wrong_stop', note: 'Pin is off' });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    // The DB's crowding CHECK constraint means category is encoded into
    // `note` (see route.ts) — the API still returns it decoded as `category`.
    expect(json.data).toMatchObject({ id: 1, stopId: 5, category: 'wrong_stop', note: 'Pin is off' });
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
