/**
 * Filipino/Taglish string map — key UI strings only, not a full i18n
 * library. `{var}` placeholders are substituted via a plain string
 * replace; there's no pluralization/ICU machinery here on purpose.
 */

export type Lang = 'en' | 'tl';

export const LANG_STORAGE_KEY = 'parapo:lang';

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    find_routes:        'Find routes',
    choose_a_stop:       'Choose a stop',
    use_current_location: 'Use current location',
    transport_modes:     'Transport modes',
    step_by_step:        'Step by step',
    walk_to:             'Walk to {stop}',
    board_here:          'Board',
    no_fixed_schedule:   'No fixed schedule — ride until your stop',
    fare_breakdown:       'Fare breakdown',
    total_per_person:    'Total per person',
    start_trip:          'Start trip — track live',
    save_commute:        'Save commute',
    plan_another_trip:   'Plan another trip',
    now:                  'Now',
    next:                 'Next',
    mark_leg_done:        "Mark leg done — I'm here",
    mark_arrived:         "Mark as done — I've arrived",
    almost_there:         'Almost there — this is the last leg.',
    get_off_at:           'Get off at {stop}',
    report_to_ltfrb:      'Report to LTFRB · 1342',
  },
  tl: {
    find_routes:        'Hanapin ang ruta',
    choose_a_stop:       'Pumili ng himpilan',
    use_current_location: 'Gamitin ang kasalukuyang lokasyon',
    transport_modes:     'Uri ng sasakyan',
    step_by_step:        'Hakbang-hakbang',
    walk_to:             'Lakad papuntang {stop}',
    board_here:          'Sakay dito',
    no_fixed_schedule:   'Maghintay ng jeep — walang schedule, sumakay hanggang sa hintuan mo',
    fare_breakdown:       'Breakdown ng pamasahe',
    total_per_person:    'Kabuuan bawat tao',
    start_trip:          'Simulan ang biyahe — subaybayan nang live',
    save_commute:        'I-save ang biyahe',
    plan_another_trip:   'Magplano ng panibagong biyahe',
    now:                  'Ngayon',
    next:                 'Susunod',
    mark_leg_done:        'Tapos na ang hakbang na ito — nandito na ako',
    mark_arrived:         'Tapos na — nakarating na ako',
    almost_there:         'Malapit ka na — ito na ang huling hakbang.',
    get_off_at:           'Bumaba sa {stop}',
    report_to_ltfrb:      'Magreklamo sa LTFRB · 1342',
  },
};

export type StringKey = keyof typeof STRINGS['en'];

export function t(lang: Lang, key: StringKey, vars?: Record<string, string>): string {
  let str = STRINGS[lang][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
  }
  return str;
}

export function loadLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'tl' ? 'tl' : 'en';
  } catch {
    return 'en';
  }
}
