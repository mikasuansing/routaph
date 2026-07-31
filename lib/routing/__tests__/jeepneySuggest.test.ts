import { describe, it, expect } from 'vitest';
import { suggestJeepneyCorridor } from '../jeepneySuggest';

describe('suggestJeepneyCorridor', () => {
  it('matches a walk whose endpoints sit near two different points on a known corridor', () => {
    // Near Welcome Rotonda -> near Quiapo, both on España Boulevard.
    const result = suggestJeepneyCorridor(14.6095, 120.9935, 14.5993, 120.9837);
    expect(result).not.toBeNull();
    expect(result!.corridorName).toBe('España Boulevard');
    expect(result!.towardLabel).toBe('Quiapo');
    expect(result!.fareLow).toBeGreaterThan(0);
    expect(result!.fareHigh).toBeGreaterThanOrEqual(result!.fareLow);
  });

  it('returns null when the walk is too short to bother suggesting', () => {
    const result = suggestJeepneyCorridor(14.6095, 120.9935, 14.6098, 120.9938);
    expect(result).toBeNull();
  });

  it('returns null when only one endpoint is near a known corridor', () => {
    // Near Welcome Rotonda, but destination is nowhere near any corridor.
    const result = suggestJeepneyCorridor(14.6095, 120.9935, 14.3000, 121.3000);
    expect(result).toBeNull();
  });

  it('returns null when both endpoints match the same waypoint (no real travel)', () => {
    const result = suggestJeepneyCorridor(14.6095, 120.9935, 14.6090, 120.9930);
    expect(result).toBeNull();
  });

  it('returns null when neither endpoint is near any known corridor', () => {
    const result = suggestJeepneyCorridor(14.3, 121.3, 14.35, 121.35);
    expect(result).toBeNull();
  });
});
