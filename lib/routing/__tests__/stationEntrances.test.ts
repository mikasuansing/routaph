import { describe, it, expect } from 'vitest';
import { nearestStationEntrance } from '../stationEntrances';

describe('nearestStationEntrance', () => {
  it('returns null for a non-MRT-3 station (e.g. an LRT-2 or bus stop)', () => {
    expect(nearestStationEntrance('Recto', 14.6, 121.0)).toBeNull();
    expect(nearestStationEntrance('Not A Real Station', 14.6, 121.0)).toBeNull();
  });

  it('picks the east entrance when the destination is east of the station', () => {
    const result = nearestStationEntrance('Ayala', 14.5487, 121.0400); // well east
    expect(result).not.toBeNull();
    expect(result!.label).toBe('east side of EDSA');
  });

  it('picks the west entrance when the destination is west of the station', () => {
    const result = nearestStationEntrance('Ayala', 14.5487, 121.0100); // well west
    expect(result).not.toBeNull();
    expect(result!.label).toBe('west side of EDSA');
  });

  it('stays close to the station centroid (small offset, not a distant landmark)', () => {
    const station = { lat: 14.5658, lng: 121.0469 }; // Guadalupe centroid
    const result = nearestStationEntrance('Guadalupe', station.lat, station.lng + 0.01)!;
    // Offset should be small — well under 200m from the centroid.
    const distKm = Math.sqrt((result.lat - station.lat) ** 2 + (result.lng - station.lng) ** 2) * 111;
    expect(distKm).toBeLessThan(0.2);
  });

  it('works for every MRT-3 station name used in the seed data', () => {
    const names = [
      'Taft Avenue (MRT)', 'Magallanes', 'Ayala', 'Buendia', 'Guadalupe',
      'Ortigas (MRT)', 'Shaw Blvd', 'Boni', 'Cubao (MRT)', 'GMA-Kamuning',
      'Quezon Ave (MRT)', 'North Avenue',
    ];
    for (const name of names) {
      expect(nearestStationEntrance(name, 14.6, 121.05)).not.toBeNull();
    }
  });
});
