import { describe, expect, it } from 'vitest';
import {
  CLUSTER_SPAN,
  MAX_ACCURACY_M,
  PING_FRESH_MS,
  clusterPings,
  inferDirection,
  snapToLine,
  type Direction,
  type LivePing,
} from '../estimate';
import type { Mode, Stop } from '@/lib/routing/types';

// A straight north-south line of stops ~1.1 km apart, so index distance
// maps cleanly onto real distance in these assertions.
const STOPS: Stop[] = [
  { id: 1, name: 'Alpha',   lat: 14.500, lng: 121.000 },
  { id: 2, name: 'Bravo',   lat: 14.510, lng: 121.000 },
  { id: 3, name: 'Charlie', lat: 14.520, lng: 121.000 },
  { id: 4, name: 'Delta',   lat: 14.530, lng: 121.000 },
  { id: 5, name: 'Echo',    lat: 14.540, lng: 121.000 },
  { id: 6, name: 'Foxtrot', lat: 14.550, lng: 121.000 },
];

const LINE = { id: 7, name: 'Test Line', mode: 'mrt' as Mode };

const NOW = 1_700_000_000_000;

function ping(
  riderKey: string,
  lat: number,
  direction: Direction,
  overrides: Partial<LivePing> = {},
): LivePing & { direction: Direction } {
  return {
    riderKey, lat, lng: 121.000, accuracyM: 20, ts: NOW, direction, ...overrides,
  };
}

describe('snapToLine', () => {
  it('snaps a position to the nearest stop index', () => {
    const hit = snapToLine(14.5205, 121.0, STOPS);
    expect(hit?.index).toBe(2);
    expect(hit?.stop.name).toBe('Charlie');
  });

  it('returns null when the position is nowhere near the line', () => {
    // Well over MAX_SNAP_KM away — a rider on a different line entirely.
    expect(snapToLine(14.520, 121.200, STOPS)).toBeNull();
  });

  it('returns null for an empty stop list', () => {
    expect(snapToLine(14.5, 121.0, [])).toBeNull();
  });
});

describe('inferDirection', () => {
  it('reads increasing stop index as forward', () => {
    expect(inferDirection(1, 2)).toBe('forward');
  });

  it('reads decreasing stop index as backward', () => {
    expect(inferDirection(4, 3)).toBe('backward');
  });

  it('refuses to guess when the rider has not passed a stop', () => {
    // Dwelling at a platform is not evidence of a heading — claiming one
    // would put a train on the map pointing the wrong way.
    expect(inferDirection(2, 2)).toBeNull();
  });
});

describe('clusterPings', () => {
  it('returns nothing when there are no pings', () => {
    expect(clusterPings([], LINE, STOPS, NOW)).toEqual([]);
  });

  it('returns nothing when the line has no stops', () => {
    expect(clusterPings([ping('a', 14.50, 'forward')], LINE, [], NOW)).toEqual([]);
  });

  it('groups nearby same-direction riders into one vehicle', () => {
    const out = clusterPings(
      [
        ping('rider-a', 14.5200, 'forward'),
        ping('rider-b', 14.5205, 'forward'),
        ping('rider-c', 14.5210, 'forward'),
      ],
      LINE, STOPS, NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].riderCount).toBe(3);
    expect(out[0].direction).toBe('forward');
    expect(out[0].confidence).toBe('medium');
  });

  it('splits riders heading opposite ways into separate vehicles', () => {
    const out = clusterPings(
      [ping('rider-a', 14.520, 'forward'), ping('rider-b', 14.520, 'backward')],
      LINE, STOPS, NOW,
    );
    expect(out).toHaveLength(2);
    expect(out.map(v => v.direction).sort()).toEqual(['backward', 'forward']);
  });

  it('splits same-direction riders further apart than CLUSTER_SPAN', () => {
    // Alpha (index 0) and Foxtrot (index 5) are 5 apart — two trains.
    expect(CLUSTER_SPAN).toBeLessThan(5);
    const out = clusterPings(
      [ping('rider-a', 14.500, 'forward'), ping('rider-b', 14.550, 'forward')],
      LINE, STOPS, NOW,
    );
    expect(out).toHaveLength(2);
  });

  it('ignores pings older than the freshness window', () => {
    const stale = ping('rider-a', 14.520, 'forward', { ts: NOW - PING_FRESH_MS - 1 });
    expect(clusterPings([stale], LINE, STOPS, NOW)).toEqual([]);
  });

  it('ignores low-quality fixes', () => {
    const blurry = ping('rider-a', 14.520, 'forward', { accuracyM: MAX_ACCURACY_M + 1 });
    expect(clusterPings([blurry], LINE, STOPS, NOW)).toEqual([]);
  });

  it('ignores pings that are not plausibly on this line', () => {
    const offLine = ping('rider-a', 14.520, 'forward', { lng: 121.3 });
    expect(clusterPings([offLine], LINE, STOPS, NOW)).toEqual([]);
  });

  it('counts one rider once even if several of their pings are fresh', () => {
    const out = clusterPings(
      [
        ping('rider-a', 14.5200, 'forward', { ts: NOW - 30_000 }),
        ping('rider-a', 14.5205, 'forward', { ts: NOW - 15_000 }),
        ping('rider-a', 14.5210, 'forward', { ts: NOW }),
      ],
      LINE, STOPS, NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].riderCount).toBe(1);
    expect(out[0].confidence).toBe('low');
  });

  it('uses the median so one wild fix cannot drag the vehicle off-line', () => {
    const out = clusterPings(
      [
        ping('rider-a', 14.5200, 'forward', { lng: 121.000 }),
        ping('rider-b', 14.5205, 'forward', { lng: 121.001 }),
        ping('rider-c', 14.5210, 'forward', { lng: 121.010 }), // outlier
      ],
      LINE, STOPS, NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].lng).toBeCloseTo(121.001, 5);
  });

  it('reports high confidence once four or more riders agree', () => {
    const out = clusterPings(
      ['a', 'b', 'c', 'd'].map((k, i) => ping(k, 14.5200 + i * 0.0002, 'forward')),
      LINE, STOPS, NOW,
    );
    expect(out[0].confidence).toBe('high');
  });

  it('reports the newest ping as the cluster timestamp and near-stop', () => {
    const out = clusterPings(
      [
        ping('rider-a', 14.5100, 'forward', { ts: NOW - 60_000 }),
        ping('rider-b', 14.5205, 'forward', { ts: NOW }),
      ],
      LINE, STOPS, NOW,
    );
    expect(out[0].updatedAt).toBe(new Date(NOW).toISOString());
    expect(out[0].nearStopName).toBe('Charlie');
  });
});
