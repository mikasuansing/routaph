/**
 * Filipino/Taglish string map - key UI strings only, not a full i18n
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
    trip_progress:       'Trip progress',
    walk_to:             'Walk to {stop}',
    board_here:          'Board',
    along_corridor:      'Along',
    no_fixed_schedule:   'Flag one down anywhere along the road, hop off anywhere too',
    fare_breakdown:       'Fare breakdown',
    total_per_person:    'Total per person',
    start_trip:          'Start trip and track live',
    plan_another_trip:   'Plan another trip',
    now:                  'Now',
    next:                 'Next',
    mark_leg_done:        "Mark leg done, I'm here",
    mark_arrived:         "Mark as done, I've arrived",
    almost_there:         'Almost there. This is the last leg.',
    get_off_at:           'Get off at {stop}',
    // Step-by-step guidance. Each leg names the vehicle to take, where to
    // get off, and what comes after, so finishing one step visibly hands
    // over to the next.
    step_of:              'Step {n} of {total}',
    take_the_train:       'Take the {line} train',
    take_the_bus:         'Take the {line} bus',
    take_a_jeepney:       'Take the {line} jeepney',
    walk_step:            'Walk to {stop}',
    board_at:             'Get on at {stop}',
    ride_stops:           '{count} stops',
    done_got_off:         "Done, I got off at {stop}",
    done_arrived_at:      "Done, I'm at {stop}",
    done_finish_trip:     "Done, I've arrived",
    up_next:              'Up next',
    trip_finished:        'Trip finished',
    about_min:            'about {n} min',
    where_to:             'Where are you headed?',
    plan_tagline:         'Fares, ETAs, live tracking',
    choose_a_destination: 'Choose a destination',
  },
  tl: {
    find_routes:        'Hanapin ang ruta',
    choose_a_stop:       'Pumili ng himpilan',
    use_current_location: 'Gamitin ang kasalukuyang lokasyon',
    transport_modes:     'Uri ng sasakyan',
    step_by_step:        'Hakbang-hakbang',
    trip_progress:       'Progreso ng biyahe',
    walk_to:             'Lakad papuntang {stop}',
    board_here:          'Sakay dito',
    along_corridor:      'Sa daanan ng',
    no_fixed_schedule:   'Sumakay kahit saan sa daan, bumaba rin kahit saan',
    fare_breakdown:       'Breakdown ng pamasahe',
    total_per_person:    'Kabuuan bawat tao',
    start_trip:          'Simulan ang biyahe at subaybayan nang live',
    plan_another_trip:   'Magplano ng panibagong biyahe',
    now:                  'Ngayon',
    next:                 'Susunod',
    mark_leg_done:        'Tapos na ang hakbang na ito, nandito na ako',
    mark_arrived:         'Tapos na, nakarating na ako',
    almost_there:         'Malapit ka na. Ito na ang huling hakbang.',
    get_off_at:           'Bumaba sa {stop}',
    step_of:              'Hakbang {n} sa {total}',
    take_the_train:       'Sumakay sa tren na {line}',
    take_the_bus:         'Sumakay sa bus na {line}',
    take_a_jeepney:       'Sumakay ng jeep sa {line}',
    walk_step:            'Maglakad papuntang {stop}',
    board_at:             'Sumakay sa {stop}',
    ride_stops:           '{count} na hintuan',
    done_got_off:         'Tapos, bumaba na ako sa {stop}',
    done_arrived_at:      'Tapos, nandito na ako sa {stop}',
    done_finish_trip:     'Tapos, nakarating na ako',
    up_next:              'Susunod na hakbang',
    trip_finished:        'Tapos na ang biyahe',
    about_min:            'mga {n} minuto',
    where_to:             'Saan ka papunta?',
    plan_tagline:         'Pamasahe, ETA, live na pagsubaybay',
    choose_a_destination: 'Pumili ng patutunguhan',
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
