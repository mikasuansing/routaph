import { describe, it, expect } from 'vitest';
import {
  SearchSchema,
  SearchBodySchema,
  CrowdReportSchema,
  SavedRouteSchema,
  LogSearchSchema,
} from '../validation';

// Metro Manila bounding box: lat 14.3–14.8, lng 120.9–121.2

describe('SearchSchema', () => {
  const valid = { originLat: 14.55, originLng: 121.0, destLat: 14.62, destLng: 121.05 };

  it('accepts valid Metro Manila coordinates', () => {
    expect(SearchSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects lat out of Metro Manila bounds', () => {
    expect(SearchSchema.safeParse({ ...valid, originLat: 0 }).success).toBe(false);
    expect(SearchSchema.safeParse({ ...valid, destLat: 20 }).success).toBe(false);
  });

  it('rejects lng out of Metro Manila bounds', () => {
    expect(SearchSchema.safeParse({ ...valid, originLng: 110 }).success).toBe(false);
    expect(SearchSchema.safeParse({ ...valid, destLng: 130 }).success).toBe(false);
  });

  it('rejects invalid preference enum', () => {
    expect(SearchSchema.safeParse({ ...valid, preference: 'walking' }).success).toBe(false);
  });

  it('accepts valid preference values', () => {
    for (const p of ['fastest', 'cheapest', 'fewest_transfers']) {
      expect(SearchSchema.safeParse({ ...valid, preference: p }).success).toBe(true);
    }
  });
});

describe('SearchBodySchema', () => {
  const valid = {
    origin:      { lat: 14.55, lng: 121.0 },
    destination: { lat: 14.62, lng: 121.05 },
  };

  it('accepts valid body', () => {
    expect(SearchBodySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects out-of-bounds coordinates', () => {
    expect(SearchBodySchema.safeParse({
      ...valid, origin: { lat: 0, lng: 121.0 },
    }).success).toBe(false);
  });

  it('rejects invalid departAt format', () => {
    expect(SearchBodySchema.safeParse({
      ...valid, departAt: 'not-a-date',
    }).success).toBe(false);
  });

  it('accepts valid ISO 8601 departAt', () => {
    expect(SearchBodySchema.safeParse({
      ...valid, departAt: '2026-06-24T08:00:00Z',
    }).success).toBe(true);
  });
});

describe('CrowdReportSchema', () => {
  it('accepts valid report', () => {
    expect(CrowdReportSchema.safeParse({ crowding: 'packed' }).success).toBe(true);
  });

  it('rejects invalid crowding value', () => {
    expect(CrowdReportSchema.safeParse({ crowding: 'jampacked' }).success).toBe(false);
  });

  it('rejects note longer than 200 chars', () => {
    expect(CrowdReportSchema.safeParse({
      crowding: 'empty',
      note: 'x'.repeat(201),
    }).success).toBe(false);
  });

  it('accepts note exactly 200 chars', () => {
    expect(CrowdReportSchema.safeParse({
      crowding: 'moderate',
      note: 'x'.repeat(200),
    }).success).toBe(true);
  });

  it('rejects non-positive stopId', () => {
    expect(CrowdReportSchema.safeParse({ crowding: 'empty', stopId: -1 }).success).toBe(false);
    expect(CrowdReportSchema.safeParse({ crowding: 'empty', stopId: 0 }).success).toBe(false);
  });
});

describe('SavedRouteSchema', () => {
  const valid = {
    name:       'Home to Work',
    originLat:  14.55,
    originLng:  121.0,
    originName: 'Home',
    destLat:    14.62,
    destLng:    121.05,
    destName:   'Ortigas',
  };

  it('accepts valid saved route', () => {
    expect(SavedRouteSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(SavedRouteSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects name over 120 chars', () => {
    expect(SavedRouteSchema.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false);
  });

  it('rejects out-of-bounds coordinates', () => {
    expect(SavedRouteSchema.safeParse({ ...valid, originLat: 9.0 }).success).toBe(false);
  });
});

describe('LogSearchSchema', () => {
  const valid = { originLat: 14.55, originLng: 121.0, destLat: 14.62, destLng: 121.05 };

  it('accepts valid log entry', () => {
    expect(LogSearchSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects out-of-bounds coordinates', () => {
    expect(LogSearchSchema.safeParse({ ...valid, originLat: 15.0 }).success).toBe(false);
  });

  it('rejects negative result count', () => {
    expect(LogSearchSchema.safeParse({ ...valid, resultCount: -1 }).success).toBe(false);
  });
});
