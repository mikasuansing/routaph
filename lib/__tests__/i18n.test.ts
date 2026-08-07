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

  it('leaves no unsubstituted placeholder in the step-by-step strings', () => {
    // These drive the trip screen's instructions; a stray {line} or {stop}
    // reaching the UI would read as broken to a commuter mid-journey.
    const filled: Record<string, string> = {
      step_of: t('en', 'step_of', { n: '2', total: '4' }),
      take_the_train: t('en', 'take_the_train', { line: 'LRT-2' }),
      take_the_bus: t('en', 'take_the_bus', { line: 'Route 3' }),
      take_a_jeepney: t('en', 'take_a_jeepney', { line: 'Katipunan' }),
      walk_step: t('en', 'walk_step', { stop: 'Cubao' }),
      ride_stops: t('en', 'ride_stops', { count: '9' }),
      done_got_off: t('en', 'done_got_off', { stop: 'Cubao' }),
      done_arrived_at: t('en', 'done_arrived_at', { stop: 'Cubao' }),
      about_min: t('en', 'about_min', { n: '5' }),
    };
    for (const [key, value] of Object.entries(filled)) {
      expect({ key, hasPlaceholder: /\{[a-z]+\}/.test(value) })
        .toEqual({ key, hasPlaceholder: false });
    }
    expect(filled.step_of).toBe('Step 2 of 4');
    expect(filled.take_the_train).toBe('Take the LRT-2 train');
  });

  it('resolves a non-empty string in both languages for every key used in the UI', () => {
    for (const key of [
      'find_routes', 'choose_a_stop', 'use_current_location', 'transport_modes',
      'step_by_step', 'walk_to', 'board_here', 'no_fixed_schedule', 'fare_breakdown',
      'total_per_person', 'start_trip', 'plan_another_trip',
      'now', 'next', 'mark_leg_done', 'mark_arrived', 'almost_there', 'get_off_at',
      // Step-by-step trip guidance
      'step_of', 'take_the_train', 'take_the_bus', 'take_a_jeepney', 'walk_step',
      'board_at', 'ride_stops', 'done_got_off', 'done_arrived_at',
      'done_finish_trip', 'up_next', 'trip_finished', 'about_min',
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
