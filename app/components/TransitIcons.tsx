/**
 * Custom transit-mode pictograms — a matched family (jeepney, train, bus,
 * walk, pin) drawn once at the same flat, filled silhouette weight, instead
 * of a generic icon-library glyph (gear, arrow-in-circle) standing in for
 * "mode." None of lucide's set says "Manila" or "jeepney" specifically;
 * these do. Flat fill (currentColor), no stroke — a distinct visual family
 * from the outline-style lucide icons used for chrome (settings, close,
 * swap) elsewhere in the app, so mode identity reads as its own thing.
 *
 * All icons share a 24x24 viewBox and a two-wheel/window-band grammar for
 * the vehicles, so the family reads as one hand even at 12-16px.
 */

import type { Mode } from '@/lib/routing/types';

type IconProps = { size?: number; color?: string; bg?: string; className?: string };

export function JeepneyIcon({ size = 20, color = 'currentColor', bg = 'var(--color-bg)', className }: IconProps) {
  // Long, low body with an extended flat hood at the front (left) — the
  // silhouette detail that reads as "jeepney" rather than "generic bus."
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M1.5 15.5V13c0-.9.5-1.7 1.3-2.1L5 9.7c.4-.9 1.3-1.5 2.3-1.5h10.4c1.7 0 3.2.9 4 2.4l1.3 2.4c.3.5.5 1.1.5 1.7v.8c0 .6-.5 1-1 1h-1"
        fill={color}
      />
      <rect x="1.5" y="13" width="21" height="3.5" rx="1" fill={color} />
      <rect x="6.5" y="10" width="3.4" height="2.6" rx="0.5" fill={bg} />
      <rect x="10.6" y="10" width="3.4" height="2.6" rx="0.5" fill={bg} />
      <rect x="14.7" y="10" width="3.4" height="2.6" rx="0.5" fill={bg} />
      <circle cx="6.5" cy="17.5" r="2.2" fill={color} />
      <circle cx="6.5" cy="17.5" r="0.9" fill={bg} />
      <circle cx="17.5" cy="17.5" r="2.2" fill={color} />
      <circle cx="17.5" cy="17.5" r="0.9" fill={bg} />
    </svg>
  );
}

export function TrainIcon({ size = 20, color = 'currentColor', bg = 'var(--color-bg)', className }: IconProps) {
  // Boxy front-facing car, rounded roof, one wide windshield band — reads
  // as rail (MRT/LRT) rather than road transit at a glance.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2h9A2.5 2.5 0 0 1 19 4.5V15a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V4.5Z" fill={color} />
      <rect x="6.7" y="4.5" width="4.3" height="4" rx="0.6" fill={bg} />
      <rect x="13" y="4.5" width="4.3" height="4" rx="0.6" fill={bg} />
      <rect x="6.7" y="10.4" width="10.6" height="2.4" rx="0.6" fill={bg} />
      <circle cx="8.3" cy="19.2" r="1.7" fill={color} />
      <circle cx="15.7" cy="19.2" r="1.7" fill={color} />
      <rect x="3.5" y="16.5" width="17" height="2" rx="1" fill={color} />
    </svg>
  );
}

export function BusIcon({ size = 20, color = 'currentColor', bg = 'var(--color-bg)', className }: IconProps) {
  // Taller, uniform rectangular body (no hood) and a longer window row —
  // the contrast that keeps it from reading as the jeepney glyph reused.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="3" width="19" height="13.5" rx="2.2" fill={color} />
      <rect x="4.3" y="5" width="3.4" height="3.2" rx="0.5" fill={bg} />
      <rect x="8.5" y="5" width="3.4" height="3.2" rx="0.5" fill={bg} />
      <rect x="12.7" y="5" width="3.4" height="3.2" rx="0.5" fill={bg} />
      <rect x="16.9" y="5" width="3.4" height="3.2" rx="0.5" fill={bg} />
      <rect x="4.3" y="10.4" width="15.4" height="2.1" rx="0.5" fill={bg} />
      <circle cx="6.8" cy="18.3" r="2.1" fill={color} />
      <circle cx="6.8" cy="18.3" r="0.85" fill={bg} />
      <circle cx="17.2" cy="18.3" r="2.1" fill={color} />
      <circle cx="17.2" cy="18.3" r="0.85" fill={bg} />
    </svg>
  );
}

export function WalkIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  // A striding silhouette, filled rather than lucide's stick-figure
  // outline, so it sits in the same flat-fill family as the vehicles.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="13.2" cy="4" r="2.1" fill={color} />
      <path
        d="M11.6 8.2c.3-.6 1-1 1.7-1l2.6.2c.6.1 1.1.5 1.3 1.1l1.6 4.1a1.1 1.1 0 0 1-2 .8l-1.4-2.7-.5 2.5 2.6 2.6c.3.3.5.7.4 1.1l-.6 4.6a1.1 1.1 0 0 1-2.2-.3l.4-4-2.7-2.6-1.4 2.4.8 3.8a1.1 1.1 0 0 1-2.2.5l-1-4.4c-.1-.5 0-1 .4-1.4l2.6-3-.3-2.4-1.2 2a1.1 1.1 0 0 1-1.9-1.1Z"
        fill={color}
      />
    </svg>
  );
}

export function PinIcon({ size = 20, color = 'currentColor', bg = 'var(--color-bg)', className }: IconProps) {
  // A flattened, more geometric marker than the default teardrop pin —
  // rounded plate tapering to a point, with a solid centre dot.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2c4.4 0 7.5 3.3 7.5 7.4 0 4.9-5.2 10.2-7 11.9a.8.8 0 0 1-1 0c-1.8-1.7-7-7-7-11.9C4.5 5.3 7.6 2 12 2Z"
        fill={color}
      />
      <circle cx="12" cy="9.4" r="2.6" fill={bg} />
    </svg>
  );
}

const MODE_ICON: Record<Mode, (p: IconProps) => React.JSX.Element> = {
  jeepney: JeepneyIcon,
  bus: BusIcon,
  mrt: TrainIcon,
  lrt: TrainIcon,
  walk: WalkIcon,
};

/** Picks the right family member for a transit mode. */
export function ModeIcon({ mode, ...props }: { mode: Mode } & IconProps) {
  const Icon = MODE_ICON[mode];
  return <Icon {...props} />;
}
