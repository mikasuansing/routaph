import type { Mode } from '@/lib/routing/types';

/**
 * Modes eligible for crowdsourced live vehicle tracking.
 *
 * Rail and the EDSA Carousel run on fixed, exclusive alignments, so a rider
 * ping near the line is plausibly aboard a vehicle on that line. Jeepneys
 * are deliberately excluded: dozens of jeepney routes share the same
 * thoroughfares, so a ping on Shaw Boulevard can't be attributed to one
 * specific route without guessing — and guessing is exactly what this app
 * refuses to do with transit data.
 */
export const TRACKED_MODES: readonly Mode[] = ['mrt', 'lrt', 'bus'];
