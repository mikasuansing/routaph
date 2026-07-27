import { describe, it, expect } from 'vitest';
import { t, loadLang } from '../i18n';

describe('t', () => {
  it('returns the English string by default', () => {
    expect(t('en', 'find_routes')).toBe('Find routes');
  });

  it('returns the Taglish string for the same key', () => {
    expect(t('tl', 'find_routes')).toBe('Hanapin ang ruta');
  });

  it('substitutes a {var} placeholder', () => {
    expect(t('en', 'walk_to', { stop: 'Cubao' })).toBe('Walk to Cubao');
    expect(t('tl', 'walk_to', { stop: 'Cubao' })).toBe('Lakad papuntang Cubao');
  });

  it('resolves a non-empty string in both languages for every key used in the UI', () => {
    for (const key of [
      'find_routes', 'choose_a_stop', 'use_current_location', 'transport_modes',
      'step_by_step', 'walk_to', 'board_here', 'no_fixed_schedule', 'fare_breakdown',
      'total_per_person', 'start_trip', 'save_commute', 'plan_another_trip',
      'now', 'next', 'mark_leg_done', 'mark_arrived', 'almost_there', 'get_off_at',
    ] as const) {
      expect(t('en', key)).toBeTruthy();
      expect(t('tl', key)).toBeTruthy();
    }
  });
});

describe('loadLang', () => {
  it('defaults to "en" outside the browser (SSR)', () => {
    expect(loadLang()).toBe('en');
  });
});
