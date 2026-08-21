import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

vi.mock('@/lib/redis/client', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/ratelimit', () => ({
  searchLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
  clientKey: vi.fn().mockReturnValue('ip:127.0.0.1'),
}));

vi.mock('@/lib/geocode', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/geocode')>();
  return {
    ...actual,
    fetchForwardGeocode: vi.fn().mockResolvedValue([
      { label: 'SM Megamall, Mandaluyong City', lat: 14.5849, lng: 121.0568 },
    ]),
  };
});

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/geo/search?${query}`);
}

describe('GET /api/v1/geo/search', () => {
  it('400s when q is missing', async () => {
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('400s when q is shorter than 3 characters', async () => {
    const res = await GET(makeRequest('q=SM'));
    expect(res.status).toBe(400);
  });

  it('400s when q exceeds the max length', async () => {
    const res = await GET(makeRequest(`q=${'a'.repeat(121)}`));
    expect(res.status).toBe(400);
  });

  it('returns matching places in the envelope shape', async () => {
    const res = await GET(makeRequest('q=SM Megamall'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([
      { label: 'SM Megamall, Mandaluyong City', lat: 14.5849, lng: 121.0568 },
    ]);
  });
});
