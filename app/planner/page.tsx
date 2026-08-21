'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TRIP_STORAGE_KEY } from '@/lib/trip/types';
import { checkLastTrain, formatClockTime, type LastTrainCheck } from '@/lib/routing/lastTrain';
import { beepAdjustedFare, beepAdjustedTotalFare } from '@/lib/routing/beepFare';
import { suggestJeepneyCorridor } from '@/lib/routing/jeepneySuggest';
import { nearestStationEntrance } from '@/lib/routing/stationEntrances';
import { ReportIssueButton } from '@/app/components/ReportIssueSheet';
import { t, loadLang, LANG_STORAGE_KEY, type Lang } from '@/lib/i18n';
import { useTheme } from '@/app/providers';
import { PinPickerSheet, type PickedLocation } from '@/app/components/PinPickerSheet';
import { Settings, MapPin, X, ArrowUpRight, ArrowLeftRight, ArrowUpDown, AlertTriangle, Check, Circle, CircleDot, ArrowLeft } from 'lucide-react';
import { ModeIcon } from '@/app/components/TransitIcons';
import type { Mode } from '@/lib/routing/types';

const BEEP_STORAGE_KEY = 'parapo:has_beep';

/*
 * Planner - the primary commuter dashboard.
 * Monochrome minimal: typography scale is the hierarchy; whitespace groups
 * information; the single accent (transit green) marks live/positive states
 * (location fix, normal service, GO actions) and nothing decorative.
 */

const C = {
  bg: 'var(--color-bg)',
  surface:'var(--color-surface)',
  card: 'var(--color-card)',
  cardEl: 'var(--color-card-el)',
  border: 'var(--color-border)',
  muted: 'var(--color-muted)',
  body: 'var(--color-body)',
  ink: 'var(--color-ink)',
  accent: 'var(--color-accent)',
  error: 'var(--color-error)',
  onPrimary: 'var(--color-on-primary)',
};

const DISPLAY = 'var(--font-display)';
// Reserved for the fare, the ETA, and the "arrived" moment only - see
// the --font-numeral comment in globals.css.
const NUMERAL = 'var(--font-numeral)';

/* Grayscale ramp for route segments - line identity is carried by TEXT */
const MODE_META: Record<string, { label: string; shade: string }> = {
  mrt: { label: 'MRT', shade: 'var(--color-ink)' },
  lrt: { label: 'LRT', shade: 'var(--color-body)' },
  bus: { label: 'BUS', shade: 'var(--color-muted)' },
  jeepney: { label: 'JEEP', shade: 'var(--color-border)' },
  walk: { label: 'WALK', shade: 'var(--color-card-el)' },
};

/**
 * A bordered plate for the mode tag (MRT/BUS/JEEP…), referencing the
 * painted destination boards real jeepneys carry - monospace, high
 * contrast, a wider corner radius than the app's other chips (6px against
 * the 14px+ scale everywhere else) so it reads as its own object instead
 * of another rounded pill.
 */
function SignboardChip({ label, shade }: { label: string; shade: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 38, padding: '3px 6px', flexShrink: 0,
      fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: shade,
      border: `1.5px solid ${shade}`, borderRadius: 6,
    }}>
      {label}
    </span>
  );
}

const FARE_REF: [string, string][] = [
  ['MRT-3', '₱6 min · ₱0.48/km ½-price'],
  ['LRT-2', '₱8 min · ₱0.46/km ½-price'],
  ['LRT-1', '₱16.25 min · ₱1.47/km'],
  ['Bus', '₱18 first 5 km · ₱2.98/km'],
  ['Jeepney', '₱14 first 4 km · ₱2.00/km'],
];

// Stop catalog comes from /api/v1/catalog/stops so pick lists always match
// the routable network (F4). Never hardcode stops here.
type CatalogStop = { id: number; name: string; lat: number; lng: number };

type WalkLeg = { type: 'walk'; fromName: string; toName: string; fromLat: number; fromLng: number; toLat: number; toLng: number; distKm: number; durationMin: number };
type RideLeg = { type: 'ride'; mode: string; line: { id: number; name: string; color: string }; from: { id: number; name: string; lat: number; lng: number }; to: { id: number; name: string; lat: number; lng: number }; stops: { id: number; name: string; lat: number; lng: number }[]; distKm: number; durationMin: number; fare: number; fareRule?: { baseFare: number; perKmRate: number; flagDistanceKm: number } };
type Leg = WalkLeg | RideLeg;
type Itinerary = { legs: Leg[]; totalDurationMin: number; totalFare: number; transfers: number; objective: string; alternative?: true };
type Disruption = { id: number; corridorId: number; description: string };
type StationAccessibility = { stopId: number; feature: 'elevator' | 'escalator'; status: 'unknown' | 'operational' | 'out_of_service'; note: string | null };
type RainAdvisory = { heavyRainExpected: boolean; message: string };
// Crowdsourced vehicle estimate - see docs/api-contracts.md. Never an
// official operator position; every surface that shows one must say so.
type LiveVehicle = {
  lineId: number; lineName: string; mode: string;
  direction: 'forward' | 'backward';
  lat: number; lng: number;
  nearStopId: number; nearStopName: string;
  riderCount: number; confidence: 'low' | 'medium' | 'high';
  updatedAt: string;
};
type Screen = 'home' | 'loading' | 'results' | 'detail';
type ModeFilter = 'all' | 'train' | 'bus' | 'jeepney';
type ModeGroup = 'train' | 'bus' | 'jeepney';

const MODE_GROUPS: { key: ModeGroup; label: string; engineModes: string[]; icon: Mode }[] = [
  { key: 'train', label: 'Train', engineModes: ['mrt', 'lrt'], icon: 'mrt' },
  { key: 'bus', label: 'Bus', engineModes: ['bus'], icon: 'bus' },
  { key: 'jeepney', label: 'Jeepney', engineModes: ['jeepney'], icon: 'jeepney' },
];

const MY_LOCATION = 'My location';
// Warm basemaps - Voyager (light) / Dark Matter (dark). Picked at map init
// AND swapped on every theme change; a dark basemap under a cream page is
// the one thing that makes the whole screen look broken.
const TILE_URL = (isDark: boolean) => isDark
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
// Live estimates go stale after 2 min server-side, so polling faster than
// this buys nothing but battery.
const LIVE_POLL_MS = 20_000;
const OBJ_LABEL: Record<string, string> = {
  fastest: 'Fastest', fewest_transfers: 'Fewest transfers', cheapest: 'Cheapest',
};

function rideLegs(itin: Itinerary): RideLeg[] {
  return itin.legs.filter(l => l.type === 'ride') as RideLeg[];
}
function matchesFilter(itin: Itinerary, f: ModeFilter): boolean {
  if (f === 'all') return true;
  const modes = rideLegs(itin).map(l => l.mode);
  if (f === 'train') return modes.some(m => m === 'mrt' || m === 'lrt');
  return modes.some(m => m === f);
}

/* "arrive 7:42 PM" - the split-second number a commuter actually needs */
function arriveAt(durationMin: number): string {
  return new Date(Date.now() + durationMin * 60_000)
    .toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/* Worst-first: a "closed" line always outranks a "final call" for display */
function worstLastTrainCheck(checks: LastTrainCheck[]): LastTrainCheck | null {
  if (checks.length === 0) return null;
  return checks.find(c => c.status === 'closed') ?? checks[0];
}

/* Transport combination, e.g. "MRT-3 → EDSA Carousel" */
/*
 * "LRT-2" already tells you it's a train, but "Route 3 (Aurora Blvd)" or
 * "EDSA Carousel" don't say BUS anywhere in the name - so on the results
 * list, before anyone taps in, a bus route read exactly like a train one.
 * Prefixing the mode only when the line's own name doesn't already carry
 * it keeps "LRT-2" clean while making "BUS · Route 3 (Aurora Blvd)"
 * unambiguous at a glance.
 */
function comboLabel(itin: Itinerary): string {
  const rides = rideLegs(itin);
  if (!rides.length) return 'Walk only';
  return rides.map(r => {
    const tag = MODE_META[r.mode]?.label ?? r.mode.toUpperCase();
    return r.line.name.toUpperCase().includes(tag) ? r.line.name : `${tag} · ${r.line.name}`;
  }).join(' → ');
}

/* ── Journey bar: grayscale segments proportional to leg duration ─────────── */
function JourneyBar({ itin }: { itin: Itinerary }) {
  const total = itin.legs.reduce((s, l) => s + l.durationMin, 0) || 1;
  return (
    <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', gap: 2 }}>
      {itin.legs.map((leg, i) => {
        const mode = leg.type === 'walk' ? 'walk' : (leg as RideLeg).mode;
        return <div key={i} style={{ flex: Math.max(leg.durationMin / total, 0.04), background: MODE_META[mode]?.shade ?? C.muted }} />;
      })}
    </div>
  );
}

/* ── Micro label ──────────────────────────────────────────────────────────── */
function Micro({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color ?? C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', ...style }}>
      {children}
    </p>
  );
}

/* ── Searchable stop input - underline, custom-rendered dropdown ──────────── */
/* Native <datalist> suggestion UI never renders on iOS Safari and is
 * inconsistent elsewhere, so matches are rendered as a real absolutely-
 * positioned list instead of relying on the browser's own popup. */
type AddressResult = { label: string; lat: number; lng: number };
/** One entry in the merged dropdown: a known stop/pin (already a string
 *  everywhere else in the app), or a live geocoded address result. */
type Suggestion = { kind: 'stop'; value: string } | { kind: 'address'; result: AddressResult };

/** Debounce before hitting the search API, so typing doesn't fire a
 *  request per keystroke - matches the map-drag settle pattern in
 *  PinPickerSheet. */
const ADDRESS_SEARCH_DEBOUNCE_MS = 350;

function StopRow({ label, value, onChange, placeholder, stops, extraOption, onPickAddress }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  stops: string[]; extraOption?: string;
  /** Called when the rider picks a live-searched address rather than a
   *  known stop, so the caller can register it (same as a dropped pin). */
  onPickAddress?: (result: AddressResult) => void;
}) {
  const [text, setText] = useState(value);
  // Sync when the committed value changes externally (swap, saved-commute
  // prefill) - state-during-render, per React's derived-state guidance.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = extraOption ? [extraOption, ...stops] : stops;
  const stopMatches = text === ''
    ? options
    : options.filter(s => s.toLowerCase().includes(text.toLowerCase()));

  // Address search: only once the rider has typed enough to be worth a
  // request, and only past the point stop names alone already answer it -
  // a query that exactly matches a known stop shouldn't also hit the
  // network. Triggered from the input handler itself (not an effect) since
  // it's a direct response to typing, not a sync with an external system;
  // cleanup on unmount still needs an effect, just with no setState in it.
  function triggerAddressSearch(v: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 3 || options.includes(v)) {
      setAddressResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/geo/search?q=${encodeURIComponent(v)}`);
        const json = await res.json() as { data?: AddressResult[] };
        setAddressResults(json.data ?? []);
      } catch {
        setAddressResults([]);
      } finally {
        setSearching(false);
      }
    }, ADDRESS_SEARCH_DEBOUNCE_MS);
  }
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const suggestions: Suggestion[] = [
    ...stopMatches.map((value): Suggestion => ({ kind: 'stop', value })),
    ...addressResults.map((result): Suggestion => ({ kind: 'address', result })),
  ];

  function commit(v: string) {
    setText(v);
    onChange(v);
    setOpen(false);
  }

  function pick(s: Suggestion) {
    if (s.kind === 'stop') { commit(s.value); return; }
    onPickAddress?.(s.result);
    commit(s.result.label);
  }

  return (
    <div style={{ position: 'relative' }}>
      <Micro>{label}</Micro>
      <input
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          setHighlight(0);
          if (v === '') onChange('');
          else if (options.includes(v)) onChange(v); // committed on exact match
          triggerAddressSearch(v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Deferred so a click on a suggestion (onMouseDown) fires first.
          setTimeout(() => { if (!options.includes(text)) setText(value); }, 0);
          setOpen(false);
        }}
        onKeyDown={e => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[highlight]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          borderBottom: `2px solid ${C.border}`, borderRadius: 0,
          padding: '10px 0', fontSize: 19, color: C.ink,
          fontFamily: 'inherit', fontWeight: options.includes(text) ? 700 : 400,
          letterSpacing: '-0.02em',
        }}
      />
      {open && (suggestions.length > 0 || searching) && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: 'var(--shadow-md)', maxHeight: 260, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.kind === 'stop' ? `stop:${s.value}` : `addr:${s.result.lat},${s.result.lng}`}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', fontSize: 15, cursor: 'pointer',
                color: C.ink, background: i === highlight ? C.cardEl : 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {s.kind === 'address' && (
                <MapPin size={14} strokeWidth={2} color={C.muted} style={{ flexShrink: 0 }} />
              )}
              {s.kind === 'stop' ? s.value : s.result.label}
            </div>
          ))}
          {searching && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: C.muted, fontFamily: 'inherit' }}>
              Searching addresses…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Bottom sheet - plain surface, hairline top, no shadow theatre ────────── */
/** How far down (px) a drag has to travel before it counts as "collapse the
 *  sheet" rather than a tap or a scroll-through-the-handle. */
const SHEET_DRAG_THRESHOLD_PX = 60;
/** How much of the screen a collapsed sheet still shows - just enough for
 *  the handle and a hint of content, so it's obviously still there. */
const SHEET_PEEK_HEIGHT = '14%';

function Sheet({ children, height, style, collapsible }: {
  children: React.ReactNode; height: string | number; style?: React.CSSProperties;
  /** When true, dragging the handle down reveals the map behind the sheet
   *  (collapses to a peek height) instead of the sheet being a fixed,
   *  immovable panel - the handle bar looks draggable everywhere else in
   *  the app, but nothing behind it actually was. */
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startY: number } | null>(null);
  // A drag release also fires a click event afterwards (pointerup then
  // click, same as any button) - without this, a drag that just set
  // `collapsed` gets immediately flipped back by the click handler below.
  // Set on a real drag, read and cleared by the very next click.
  const justDraggedRef = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (!collapsible) return;
    dragRef.current = { startY: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!collapsible || !dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    if (delta > SHEET_DRAG_THRESHOLD_PX) { setCollapsed(true); justDraggedRef.current = true; }
    else if (delta < -SHEET_DRAG_THRESHOLD_PX) { setCollapsed(false); justDraggedRef.current = true; }
    dragRef.current = null;
  }
  function onHandleClick() {
    if (!collapsible) return;
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    setCollapsed(c => !c);
  }

  return (
    <div style={{
      // Heights come in as PERCENTAGES, not `vh`. On mobile `vh` is locked
      // to the viewport with the browser toolbar hidden, so a vh-sized sheet
      // hangs below the screen while the toolbar shows and shifts as it
      // hides on scroll - taking anything pinned to its bottom with it. The
      // root here is `fixed; inset: 0`, so a percentage tracks the viewport
      // that is actually visible.
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
      height: collapsible && collapsed ? SHEET_PEEK_HEIGHT : height,
      transition: 'height 0.25s ease',
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex', flexDirection: 'column',
      paddingBottom: 'env(safe-area-inset-bottom)',
      ...style,
    }}>
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onHandleClick}
        style={{
          // A generous invisible touch target around the visible bar - a
          // real thumb is much wider than a 4px-tall handle.
          padding: collapsible ? '14px 40px' : 0, margin: '10px auto 0',
          touchAction: collapsible ? 'none' : undefined,
          cursor: collapsible ? 'grab' : undefined,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 32, height: 4, borderRadius: 2, background: C.border }} />
      </div>
      {(!collapsible || !collapsed) && children}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */
export default function Planner() {
  const router = useRouter();
  const { theme } = useTheme();
  const [screen, setScreen] = useState<Screen>('home');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rush, setRush] = useState(() => { const h = new Date().getHours(); return (h >= 7 && h <= 9) || (h >= 17 && h <= 19); });
  const [hasBeep, setHasBeep] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem(BEEP_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch { return true; }
  });
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [enabledModes, setEnabledModes] = useState<Record<ModeGroup, boolean>>({ train: true, bus: true, jeepney: true });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selected, setSelected] = useState<Itinerary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jeepneyFallback, setJeepneyFallback] = useState<ReturnType<typeof suggestJeepneyCorridor>>(null);
  const [liveVehicles, setLiveVehicles] = useState<LiveVehicle[]>([]);
  // The map builds asynchronously, so effects that draw onto it have to wait
  // for it rather than run once against a null layer group and never retry.
  const [mapReady, setMapReady] = useState(false);
  // Locations dropped on the map, keyed by the label shown in the picker.
  // They live alongside catalog stops so the rest of the planner - search,
  // map drawing, swap - treats a pinned address exactly like a named stop.
  const [pinned, setPinned] = useState<Record<string, [number, number]>>({});
  const [pinningFor, setPinningFor] = useState<'from' | 'to' | null>(null);
  const [stopCoords, setStopCoords] = useState<Record<string, [number, number]>>({});
  const [myLoc, setMyLoc] = useState<[number, number] | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [disruptions, setDisruptions] = useState<Disruption[] | null>(null);
  const [accessibilityByStop, setAccessibilityByStop] = useState<Record<number, StationAccessibility[]>>({});
  const [rainAdvisory, setRainAdvisory] = useState<RainAdvisory | null>(null);
  // App-shell state (map-first, TrainSight-style): the map is the home
  // screen by default; the plan form and settings are overlays a tap opens.
  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [nextStop, setNextStop] = useState('');
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(loadLang);
  function toggleLang() {
    setLang(prev => {
      const next: Lang = prev === 'en' ? 'tl' : 'en';
      try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* noop */ }
      return next;
    });
  }
  const stopNames = Object.keys(stopCoords).sort();

  /* ── Beep card preference - persisted locally, not tied to the account ──── */
  function toggleHasBeep() {
    setHasBeep(prev => {
      const next = !prev;
      try { localStorage.setItem(BEEP_STORAGE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }

  /* ── Load the stop catalog (F4) so pick lists match the routable network ── */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/catalog/stops')
      .then(res => res.json())
      .then((json: { data?: CatalogStop[] }) => {
        if (!active || !json.data) return;
        const coords: Record<string, [number, number]> = {};
        for (const s of json.data) coords[s.name] = [s.lat, s.lng];
        setStopCoords(coords);
        // Prefill from a saved commute (/planner?from=…&to=…)
        try {
          const params = new URLSearchParams(window.location.search);
          const qFrom = params.get('from'), qTo = params.get('to');
          if (qFrom && coords[qFrom]) setFrom(qFrom);
          if (qTo && coords[qTo]) setTo(qTo);
        } catch { /* SSR guard */ }
      })
      .catch(() => { if (active) setError('Could not load the stop catalog - check your connection.'); });
    return () => { active = false; };
  }, []);

  /* ── Service status (F13 disruption feed) ─────────────────────────────── */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/disruptions')
      .then(res => res.json())
      .then((json: { data?: Disruption[] }) => { if (active) setDisruptions(json.data ?? []); })
      .catch(() => { if (active) setDisruptions(null); });
    return () => { active = false; };
  }, []);

  /* ── Rain/flood advisory (planner home nudge) ──────────────────────────── */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/weather/advisory')
      .then(res => res.json())
      .then((json: { data?: RainAdvisory }) => { if (active && json.data?.heavyRainExpected) setRainAdvisory(json.data); })
      .catch(() => { /* non-fatal - a missed nudge is not worth surfacing as an error */ });
    return () => { active = false; };
  }, []);

  /* ── Station accessibility (MRT-3 elevator/escalator) - manual, best-effort */
  useEffect(() => {
    let active = true;
    fetch('/api/v1/station-accessibility')
      .then(res => res.json())
      .then((json: { data?: StationAccessibility[] }) => {
        if (!active) return;
        const map: Record<number, StationAccessibility[]> = {};
        for (const row of json.data ?? []) {
          (map[row.stopId] ??= []).push(row);
        }
        setAccessibilityByStop(map);
      })
      .catch(() => { /* non-fatal - absence of this data doesn't block planning */ });
    return () => { active = false; };
  }, []);

  /* ── "Use my location" - one-shot fix, never persisted ────────────────── */
  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device.'); return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocBusy(false);
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (lat < 14.3 || lat > 14.8 || lng < 120.9 || lng > 121.2) {
          setError('You appear to be outside Metro Manila - pick a stop instead.');
          return;
        }
        setMyLoc([lat, lng]);
        setFrom(MY_LOCATION);
        setError(null);
      },
      () => {
        setLocBusy(false);
        setError('Could not get your location - allow location access or pick a stop.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  const originCoords = (name: string): [number, number] | undefined =>
    name === MY_LOCATION ? myLoc ?? undefined : stopCoords[name] ?? pinned[name];
  // Destination resolution has to know about pins too, or a pinned address
  // would render as a valid choice and then fail to route.
  const resolveStop = (name: string): [number, number] | undefined =>
    stopCoords[name] ?? pinned[name];

  /* ── Leaflet map ──────────────────────────────────────────────────────── */
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const routeGroup = useRef<unknown>(null);
  const liveGroup = useRef<unknown>(null);
  const networkGroup = useRef<unknown>(null);
  const tileRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then(mod => {
      if (cancelled || !mapElRef.current) return;
      const L = mod.default ?? mod;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const tileUrl = TILE_URL(isDark);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (L as any).map(mapElRef.current, {
        center: [14.5850, 121.0100],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tileRef.current = (L as any).tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L as any).control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeGroup.current = (L as any).layerGroup().addTo(map);
      // Separate layer so live vehicles survive a route redraw and vice versa.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      liveGroup.current = (L as any).layerGroup().addTo(map);
      // The transit network, drawn under everything else on the home screen.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      networkGroup.current = (L as any).layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    });

    return () => { cancelled = true; };
  }, []);

  /* ── Draw the selected route - single ink line, dashed walks ──────────── */
  const drawRoute = useCallback(() => {
    if (!mapRef.current || !routeGroup.current) return;
    import('leaflet').then(mod => {
      const L = mod.default ?? mod;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const group = routeGroup.current as any;
      group.clearLayers();
      if (!selected) return;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const inkLine = isDark ? '#7A90FF' : '#2947DE';
      const walkLine = isDark ? '#A5988A' : '#8D8672';
      const accent = isDark ? '#7A90FF' : '#2947DE';

      const allCoords: [number, number][] = [];

      for (const leg of selected.legs) {
        if (leg.type === 'walk') {
          const a: [number, number] = [leg.fromLat, leg.fromLng];
          const b: [number, number] = [leg.toLat, leg.toLng];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (L as any).polyline([a, b], { color: walkLine, weight: 2, dashArray: '4,7', opacity: 0.8 }).addTo(group);
          allCoords.push(a, b);
        } else {
          const ride = leg as RideLeg;
          const coords = ride.stops.map(s => [s.lat, s.lng] as [number, number]);
          if (coords.length >= 2) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (L as any).polyline(coords, { color: inkLine, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(group);
            allCoords.push(...coords);
          }
        }
      }

      const originC = originCoords(from), destC = resolveStop(to);
      if (originC) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).circleMarker(originC, { radius: 7, fillColor: accent, fillOpacity: 1, color: isDark ? '#000' : '#fff', weight: 2.5 }).addTo(group);
      }
      if (destC) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).circleMarker(destC, { radius: 7, fillColor: isDark ? '#F6F0E3' : '#191610', fillOpacity: 1, color: isDark ? '#000' : '#fff', weight: 2.5 }).addTo(group);
      }

      if (allCoords.length >= 2) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).fitBounds((L as any).latLngBounds(allCoords), { padding: [80, 40], maxZoom: 15 });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from, to, stopCoords, myLoc]);

  useEffect(() => { drawRoute(); }, [drawRoute]);

  useEffect(() => {
    if (screen === 'home' && routeGroup.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (routeGroup.current as any).clearLayers();
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).setView([14.5850, 121.0100], 12, { animate: true });
      }
    }
  }, [screen]);

  /* ── The network itself, on the home screen ───────────────────────────────
   * The home map used to be an empty basemap: nothing on it belonged to
   * ParaPo, so the app's whole subject - the lines you can actually ride -
   * was invisible until you searched. Drawing the network gives the screen
   * something to be, and orients you before you type anything.
   * Dimmed while a route is selected so the chosen itinerary reads clearly. */
  useEffect(() => {
    if (!networkGroup.current) return;
    let cancelled = false;

    fetch('/api/v1/catalog/lines')
      .then(r => r.json())
      .then((json: { data?: Array<{ id: number; name: string; color: string; stops: CatalogStop[] }> }) => {
        if (cancelled || !networkGroup.current) return;
        return import('leaflet').then(mod => {
          if (cancelled || !networkGroup.current) return;
          const L = mod.default ?? mod;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const group = networkGroup.current as any;
          group.clearLayers();

          const faded = screen !== 'home';
          for (const line of json.data ?? []) {
            const coords = line.stops.map(st => [st.lat, st.lng] as [number, number]);
            if (coords.length < 2) continue;
            const color = line.color || '#8D8672';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (L as any).polyline(coords, {
              color, weight: faded ? 2 : 3.5,
              opacity: faded ? 0.18 : 0.55,
              lineCap: 'round', lineJoin: 'round',
            }).addTo(group);

            // Stations only at rest - during a search they'd compete with
            // the itinerary's own origin and destination markers.
            if (!faded) {
              for (const st of line.stops) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (L as any).circleMarker([st.lat, st.lng], {
                  radius: 2.6, fillColor: color, fillOpacity: 0.85,
                  color, weight: 0, interactive: false,
                }).addTo(group);
              }
            }
          }
        });
      })
      .catch(() => { /* the network overview is decoration; never block the map */ });

    return () => { cancelled = true; };
  }, [screen, mapReady]);

  /* ── Keep the basemap in step with the theme toggle ───────────────────── */
  useEffect(() => {
    if (!tileRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tileRef.current as any).setUrl(TILE_URL(theme === 'dark'));
    // Route/vehicle colours are baked into the drawn layers, so they need a
    // redraw too - otherwise cobalt-on-cream lines stay on a dark basemap.
    drawRoute();
  }, [theme, drawRoute]);

  /* ── Live vehicles - crowdsourced, never an official feed ─────────────── */
  useEffect(() => {
    let cancelled = false;

    const draw = (vehicles: LiveVehicle[]) => {
      if (!liveGroup.current) return;
      import('leaflet').then(mod => {
        if (cancelled) return;
        const L = mod.default ?? mod;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const group = liveGroup.current as any;
        group.clearLayers();

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const accent = isDark ? '#7A90FF' : '#2947DE';

        for (const v of vehicles) {
          // A single-rider estimate is drawn hollow and smaller - the map
          // should look less certain when the data is less certain.
          const solid = v.confidence !== 'low';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marker = (L as any).circleMarker([v.lat, v.lng], {
            radius: solid ? 8 : 6,
            fillColor: accent,
            fillOpacity: solid ? 0.95 : 0.35,
            color: isDark ? '#000' : '#fff',
            weight: 2.5,
          }).addTo(group);
          marker.bindTooltip(
            `${v.lineName} · near ${v.nearStopName}<br>` +
            `<span style="opacity:.7">Estimated from ${v.riderCount} rider${v.riderCount > 1 ? 's' : ''}, not an official position</span>`,
            { direction: 'top', offset: [0, -8] },
          );
        }
      });
    };

    const poll = async () => {
      try {
        const res = await fetch('/api/v1/live/vehicles');
        if (!res.ok) return;
        const json = await res.json() as { data?: LiveVehicle[] };
        if (cancelled) return;
        const vehicles = json.data ?? [];
        setLiveVehicles(vehicles);
        draw(vehicles);
      } catch { /* live hints are optional - never break the planner */ }
    };

    poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  /* ── Search ──────────────────────────────────────────────────────────── */
  async function search() {
    const origin = originCoords(from), dest = resolveStop(to);
    if (!origin || !dest) return;
    const excludeModes = MODE_GROUPS.filter(g => !enabledModes[g.key]).flatMap(g => g.engineModes);
    setError(null); setJeepneyFallback(null); setModeFilter('all'); setFormOpen(false); setScreen('loading');
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: origin[0], lng: origin[1] },
          destination: { lat: dest[0], lng: dest[1] },
          rush,
          ...(excludeModes.length > 0 ? { excludeModes } : {}),
        }),
      });
      const json = await res.json() as { data?: Itinerary[]; error?: { message: string } };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'No route found.');
        // No tracked itinerary exists at all - before giving up, check
        // whether the raw origin/destination sit near a known jeepney
        // thoroughfare (see lib/routing/jeepneySuggest.ts). This is the
        // same honest "not a routed leg" suggestion shown inline on walk
        // gaps, surfaced here too so a jeepney-only search doesn't just
        // dead-end with a bare error when a real (untracked) option exists.
        setJeepneyFallback(suggestJeepneyCorridor(origin[0], origin[1], dest[0], dest[1]));
        setFormOpen(true); setScreen('home'); return;
      }
      setItineraries(json.data ?? []);
      setScreen('results');
    } catch {
      setError('Network error - check your connection.'); setFormOpen(true); setScreen('home');
    }
  }

  /* ── Multi-stop chaining: plan a second leg from the current itinerary's
     destination, then splice both into one combined Itinerary. Reuses the
     same planning endpoint twice - no routing-engine changes. ────────────── */
  async function addAnotherStop() {
    if (!selected) return;
    const dest = stopCoords[nextStop];
    if (!dest) return;
    const lastLeg = selected.legs.at(-1);
    if (!lastLeg) return;
    const chainOrigin = lastLeg.type === 'walk'
      ? { lat: lastLeg.toLat, lng: lastLeg.toLng }
      : { lat: lastLeg.to.lat, lng: lastLeg.to.lng };

    setChainBusy(true); setChainError(null);
    try {
      const res = await fetch('/api/v1/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: chainOrigin, destination: { lat: dest[0], lng: dest[1] }, rush }),
      });
      const json = await res.json() as { data?: Itinerary[]; error?: { message: string } };
      if (!res.ok || json.error || !json.data || json.data.length === 0) {
        setChainError(json.error?.message ?? 'No route found to that stop.');
        return;
      }
      const nextLeg = json.data.find(it => it.objective === selected.objective) ?? json.data[0];

      const combined: Itinerary = {
        legs: [...selected.legs, ...nextLeg.legs],
        totalDurationMin: selected.totalDurationMin + nextLeg.totalDurationMin,
        totalFare: selected.totalFare + nextLeg.totalFare,
        transfers: selected.transfers + nextLeg.transfers,
        objective: selected.objective,
      };
      setSelected(combined);
      setTo(nextStop);
      setAddingStop(false);
      setNextStop('');
    } catch {
      setChainError('Network error - check your connection.');
    } finally {
      setChainBusy(false);
    }
  }

  const GLOBAL = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
    body{font-family:var(--font-sans);}
    select{-webkit-appearance:none;-moz-appearance:none;appearance:none;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .tnum{font-variant-numeric:tabular-nums;}
    .leaflet-container{font-family:'Inter',system-ui,sans-serif!important;}
    .leaflet-attribution-flag{display:none!important;}
    .leaflet-control-attribution{font-size:9px!important;opacity:0.4!important;background:transparent!important;color:inherit!important;}
  `;

  const canSearch = Boolean(from && to && from !== to && originCoords(from) && resolveStop(to) && Object.values(enabledModes).some(Boolean));

  /* Service status detail - shown as a banner under the top pill when there are alerts */
  const statusDetail = disruptions && disruptions.length > 0
    ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Micro color={C.ink} style={{ letterSpacing: '0.04em' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={11} strokeWidth={2.5} color="currentColor" />
              {disruptions.length} route update{disruptions.length > 1 ? 's' : ''}: {disruptions[0].description}
            </span>
          </Micro>
        </div>
      )
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: 'Inter,system-ui,sans-serif', background: C.bg }}>
      <style>{GLOBAL}</style>

      {/* Map layer */}
      <div ref={mapElRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ════════ HOME ════════ */}
      {screen === 'home' && (
        <>
          {/* ── App-shell top bar: logo+status pill (left), settings gear (right) ── */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 'var(--radius-pill)', padding: '10px 16px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
                RoutaPH<span style={{ color: C.ink }}>.</span>
              </span>
              <div style={{ width: 1, height: 14, background: C.border }} />
              {disruptions === null ? (
                <Micro>…</Micro>
              ) : disruptions.length === 0 ? (
                <Micro color={C.accent}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Circle size={11} strokeWidth={2.5} color="currentColor" fill="currentColor" /> No major disruptions
                  </span>
                </Micro>
              ) : (
                <Micro color={C.ink}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={11} strokeWidth={2.5} color="currentColor" /> {disruptions.length} notice{disruptions.length > 1 ? 's' : ''}
                  </span>
                </Micro>
              )}
              {/* Only appears when riders are actually contributing - an
                  empty live map shows nothing rather than a zero. */}
              {liveVehicles.length > 0 && (
                <>
                  <div style={{ width: 1, height: 14, background: C.border }} />
                  <Micro color={C.accent}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CircleDot size={11} strokeWidth={2.5} color="currentColor" /> {liveVehicles.length} on the map
                    </span>
                  </Micro>
                </>
              )}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: C.surface, border: `1px solid ${C.border}`,
                boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              }}
            >
              <Settings size={17} strokeWidth={2} color="currentColor" />
            </button>
          </div>

          {/* Service alert detail - floats under the top pill */}
          {statusDetail && (
            <div style={{ position: 'absolute', top: 110, left: 20, right: 20, zIndex: 9, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: C.surface, border: `1px solid ${C.border}`, boxShadow: 'var(--shadow-md)' }}>
              {statusDetail}
            </div>
          )}

          {/* Rain advisory - floats over the map regardless of form state.
              A card with a left accent border and inline icon, not a
              solid-fill full-width bar - this is the single most important
              message on the screen and needs to read as an alert, not as a
              dismissible banner blending into every other chip. */}
          {rainAdvisory && (
            <div style={{
              position: 'absolute', top: statusDetail ? 172 : 110, left: 20, right: 20, zIndex: 9,
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '13px 14px', borderRadius: 'var(--radius-sm)',
              background: C.card, borderLeft: `4px solid ${C.error}`,
              boxShadow: 'var(--shadow-md)',
            }}>
              <AlertTriangle size={16} strokeWidth={2.5} color={C.error} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.5, color: C.ink }}>{rainAdvisory.message}</p>
            </div>
          )}

          {!formOpen ? (
            /* ── Collapsed: map is the whole screen, one search bar at the bottom ── */
            <button
              onClick={() => setFormOpen(true)}
              style={{
                position: 'absolute', left: 20, right: 20, bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 10,
                display: 'flex', alignItems: 'center', gap: 12,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-pill)',
                padding: '16px 20px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {/* The one thing this screen is for, so it reads as an
                  invitation rather than a form label - "Choose a stop"
                  described a control, not what the app does for you. */}
              <span style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
                background: C.accent, color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800,
              }}>
                <ArrowUpRight size={16} strokeWidth={2} color="#FFFFFF" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {from && to ? (
                  <>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {from} → {to}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>
                      Tap to change
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>
                      {t(lang, 'where_to')}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>
                      {t(lang, 'plan_tagline')}
                    </span>
                  </>
                )}
              </span>
            </button>
          ) : (
            /* ── Expanded: the plan form ── */
            <Sheet height="auto" style={{ maxHeight: '62%' }}>
              <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '14px 24px 28px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <Micro>{t(lang, 'where_to')}</Micro>
                  <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <X size={13} strokeWidth={2.5} color="currentColor" /> Close
                  </button>
                </div>

                {error && (
                  <div style={{ margin: '0 0 16px' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.error }}>
                      {jeepneyFallback
                        ? "No tracked route covers this trip yet - but here's a real jeepney thoroughfare that does:"
                        : error}
                    </p>
                    {jeepneyFallback && (
                      <div style={{
                        marginTop: 10, padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                        border: `1.5px dashed ${C.border}`, background: C.surface,
                      }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>
                          Ask a jeepney toward {jeepneyFallback.towardLabel}
                        </p>
                        <p className="tnum" style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>
                          {jeepneyFallback.corridorName} · ~₱{jeepneyFallback.fareLow === jeepneyFallback.fareHigh ? jeepneyFallback.fareLow.toFixed(0) : `${jeepneyFallback.fareLow.toFixed(0)}–${jeepneyFallback.fareHigh.toFixed(0)}`} · not a tracked route, no schedule
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* From / To - typography only */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flexShrink: 0 }}>
                  <div>
                    <StopRow label="From" value={from} onChange={setFrom} placeholder={t(lang, 'choose_a_stop')} stops={[...stopNames, ...Object.keys(pinned)]} extraOption={myLoc ? MY_LOCATION : undefined}
                      onPickAddress={result => setPinned(prev => ({ ...prev, [result.label]: [result.lat, result.lng] }))} />
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <button onClick={useMyLocation} disabled={locBusy} style={{ background: 'none', border: 'none', padding: '8px 0 0', fontSize: 13, fontWeight: 700, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em' }}>
                        {locBusy ? 'Locating…' : from === MY_LOCATION ? `● ${t(lang, 'use_current_location')}` : `◉ ${t(lang, 'use_current_location')}`}
                      </button>
                      <button onClick={() => setPinningFor('from')} style={{ background: 'none', border: 'none', padding: '8px 0 0', fontSize: 13, fontWeight: 700, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={13} strokeWidth={2.5} color="currentColor" /> Drop a pin
                      </button>
                    </div>
                  </div>
                  <div>
                    <StopRow label="To" value={to} onChange={setTo} placeholder={t(lang, 'choose_a_destination')} stops={[...stopNames, ...Object.keys(pinned)]}
                      onPickAddress={result => setPinned(prev => ({ ...prev, [result.label]: [result.lat, result.lng] }))} />
                    <button onClick={() => setPinningFor('to')} style={{ background: 'none', border: 'none', padding: '8px 0 0', fontSize: 13, fontWeight: 700, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={13} strokeWidth={2.5} color="currentColor" /> Drop a pin on the map
                    </button>
                  </div>
                  <button onClick={() => { if (from !== MY_LOCATION) { const t = from; setFrom(to); setTo(t); } }} style={{ alignSelf: 'flex-end', background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: from === MY_LOCATION ? C.border : C.muted, cursor: 'pointer', fontFamily: 'inherit', marginTop: -8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ArrowUpDown size={13} strokeWidth={2.5} color="currentColor" /> Swap
                  </button>
                </div>

                {!Object.values(enabledModes).some(Boolean) && (
                  <p style={{ margin: '14px 0 0', fontSize: 12, fontWeight: 600, color: C.error }}>
                    All transport modes are off - enable at least one in Settings.
                  </p>
                )}

                {/* CTA */}
                <button
                  onClick={search}
                  disabled={!canSearch}
                  style={{
                    width: '100%', border: 'none', borderRadius: 'var(--radius-pill)', padding: '17px', margin: '22px 0 0',
                    fontSize: 15, fontWeight: 700, letterSpacing: '0.01em', flexShrink: 0,
                    cursor: canSearch ? 'pointer' : 'default',
                    background: canSearch ? 'var(--gradient-primary)' : C.cardEl,
                    color: canSearch ? C.onPrimary : C.muted,
                    fontFamily: 'inherit',
                    boxShadow: canSearch ? 'var(--shadow-accent)' : 'none',
                  }}
                >
                  {t(lang, 'find_routes')}
                </button>
              </div>
            </Sheet>
          )}

          {/* ── Settings overlay: transport modes, rush hour, Beep, language, fares ── */}
          {settingsOpen && (
            <Sheet height="auto" style={{ maxHeight: '78%' }}>
              <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '14px 24px 28px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <Micro>Settings</Micro>
                  <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <X size={13} strokeWidth={2.5} color="currentColor" /> Close
                  </button>
                </div>

                {/* Transport modes - text toggles */}
                <div style={{ flexShrink: 0 }}>
                  <Micro>{t(lang, 'transport_modes')}</Micro>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    {MODE_GROUPS.map(g => {
                      const on = enabledModes[g.key];
                      return (
                        <button key={g.key}
                          onClick={() => setEnabledModes(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                          style={{
                            cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 14, fontWeight: 700, padding: '9px 18px',
                            borderRadius: 'var(--radius-pill)', transition: 'all 0.15s',
                            background: on ? C.accent : 'transparent',
                            color: on ? '#FFFFFF' : C.body,
                            border: `1.5px solid ${on ? C.accent : C.border}`,
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <ModeIcon mode={g.icon} size={15} color="currentColor" bg={on ? C.accent : C.card} />
                          {g.label}{on && <Check size={14} strokeWidth={2} color="currentColor" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Rush hour - one text row */}
                <button onClick={() => setRush(!rush)} style={{ background: 'none', border: 'none', padding: 0, margin: '20px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexShrink: 0 }}>
                  <Micro color={rush ? C.ink : C.muted}>Rush hour {rush ? 'on' : 'off'} · 7–9 am · 5–7 pm</Micro>
                </button>

                {/* Beep card - adjusts fare display, doesn't change routing */}
                <button onClick={toggleHasBeep} style={{ background: 'none', border: 'none', padding: 0, margin: '14px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexShrink: 0 }}>
                  <Micro color={hasBeep ? C.ink : C.muted}>
                    {hasBeep
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={11} strokeWidth={2.5} color="currentColor" /> I have a Beep card</span>
                      : 'Paying cash / no Beep card'}
                  </Micro>
                </button>

                {/* Language - English / Taglish, key strings only */}
                <button onClick={toggleLang} style={{ background: 'none', border: 'none', padding: 0, margin: '14px 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexShrink: 0 }}>
                  <Micro color={C.muted}>{lang === 'tl' ? 'Wika: Taglish' : 'Language: English'} · {lang === 'tl' ? 'Switch to English' : 'Switch sa Taglish'}</Micro>
                </button>

                {/* Fare reference - plain text */}
                <div style={{ margin: '28px 0 0', flexShrink: 0 }}>
                  <Micro>2026 fare rates</Micro>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {FARE_REF.map(([mode, ref]) => (
                      <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ fontWeight: 700, color: C.ink }}>{mode}</span>
                        <span className="tnum" style={{ color: C.body }}>{ref}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                    LTFRB/DOTr-approved · per boarding, not per segment ·
                    MRT-3 &amp; LRT-2 include the 50% DOTr discount (since Mar 23, 2026; LRT-1 not covered)
                  </p>
                </div>
              </div>
            </Sheet>
          )}
        </>
      )}

      {/* ════════ LOADING ════════ */}
      {screen === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.ink, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <Micro>Calculating routes</Micro>
          </div>
        </div>
      )}

      {/* ════════ RESULTS ════════ */}
      {screen === 'results' && (() => {
        const filtered = itineraries.filter(itin => matchesFilter(itin, modeFilter));
        // No standalone "Jeepney" filter: the network has exactly one real
        // jeepney corridor (Katipunan, 4 stops), so filtering to it returns
        // empty almost every time - a chip that reads as broken by default
        // rather than occasionally. Jeepney legs still surface inside mixed
        // routes, and the untracked-corridor suggestion card still fires
        // when nothing else matches; only the always-empty filter is gone.
        const modeFilters: { key: ModeFilter; label: string }[] = [
          { key: 'all', label: 'All' },
          { key: 'train', label: 'Train' },
          { key: 'bus', label: 'Bus' },
        ];
        return (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0' }}>
              <button onClick={() => { setScreen('home'); setItineraries([]); setSelected(null); }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-pill)', padding: '9px 16px', cursor: 'pointer', color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={13} strokeWidth={2.5} color="currentColor" /> Back
              </button>
              <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                  {from} <span style={{ color: C.muted, fontWeight: 400 }}>→</span> {to}
                </p>
              </div>
            </div>

            <Sheet height="64%" collapsible>
              {/* filter row - text only */}
              <div style={{ display: 'flex', gap: 8, padding: '12px 24px', flexShrink: 0 }}>
                {modeFilters.map(f => {
                  const on = modeFilter === f.key;
                  return (
                    <button key={f.key} onClick={() => setModeFilter(f.key)} style={{
                      cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 700, padding: '7px 16px',
                      borderRadius: 'var(--radius-pill)', transition: 'all 0.15s',
                      background: on ? C.ink : 'transparent',
                      color: on ? C.bg : C.body,
                      border: `1.5px solid ${on ? C.ink : C.border}`,
                    }}>{f.label}</button>
                  );
                })}
              </div>

              {/* route list - typography rows, whitespace separation */}
              <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '10px 24px 32px' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>No {modeFilter === 'all' ? '' : modeFilter + ' '}routes</p>
                    <p style={{ fontSize: 13, color: C.muted }}>Try a different filter or stops farther apart.</p>
                  </div>
                ) : filtered.map((itin, idx) => {
                  const displayFare = beepAdjustedTotalFare(itin.legs.filter(l => l.type === 'ride') as RideLeg[], hasBeep);
                  // Don't claim "cheapest" when another shown route is cheaper
                  const minFare = Math.min(...filtered.map(x => beepAdjustedTotalFare(x.legs.filter(l => l.type === 'ride') as RideLeg[], hasBeep)));
                  // An alternative is a different way to make the trip, not the
                  // winner of an objective - labelling it "Fastest" would be a lie.
                  const objLabel = itin.alternative
                    ? 'Another way'
                    : itin.objective === 'cheapest' && displayFare > minFare
                      ? 'Alternative'
                      : OBJ_LABEL[itin.objective] ?? itin.objective;
                  const worstRail = worstLastTrainCheck(checkLastTrain(itin.legs));
                  return (
                  <button key={idx} onClick={() => { setSelected(itin); setScreen('detail'); }}
                    style={{ display: 'block', width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <Micro color={C.accent}>Route {idx + 1} ({objLabel})</Micro>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                      <span className="tnum" style={{ fontFamily: NUMERAL, fontSize: 'var(--text-4xl)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1 }}>
                        {itin.totalDurationMin}<span style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: C.muted }}> min</span>
                      </span>
                      <span className="tnum" style={{ fontFamily: NUMERAL, fontSize: 'var(--text-xl)', fontWeight: 800, color: C.accent, letterSpacing: '-0.01em' }}>
                        ₱{displayFare.toFixed(2)}
                      </span>
                    </div>
                    <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.body }}>
                      arrive ~{arriveAt(itin.totalDurationMin)} · {itin.transfers} transfer{itin.transfers !== 1 ? 's' : ''}
                    </p>
                    <p style={{ margin: '4px 0 10px', fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
                      {comboLabel(itin)}
                    </p>
                    <JourneyBar itin={itin} />
                    {worstRail && (
                      <p style={{
                        margin: '10px 0 0', fontSize: 12, fontWeight: 700,
                        color: worstRail.status === 'closed' ? C.error : C.accent,
                      }}>
                        {worstRail.status === 'closed'
                          ? `⚠ Last train has left - ${worstRail.lineName} closed at ${formatClockTime(worstRail.closesAt)}`
                          : `⏰ You'll just make the last train - ${worstRail.lineName} boards ~${formatClockTime(worstRail.boardsAt)}`}
                      </p>
                    )}
                  </button>
                  );
                })}
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6, marginTop: 16 }}>
                  Fares per person per boarding · LTFRB/DOTr 2026 · Walk legs free
                </p>
              </div>
            </Sheet>
          </>
        );
      })()}

      {/* ════════ DETAIL ════════ */}
      {screen === 'detail' && selected && (() => {
        const lastRide = [...selected.legs].reverse().find(l => l.type === 'ride') as RideLeg | undefined;
        const destName = lastRide?.to.name ?? to;
        const destCoords = lastRide ? [lastRide.to.lat, lastRide.to.lng] : stopCoords[destName];
        const wazeUrl = destCoords
          ? `https://waze.com/ul?ll=${destCoords[0]},${destCoords[1]}&navigate=yes&utm_source=parapo`
          : `https://waze.com/ul?q=${encodeURIComponent(destName + ' Metro Manila')}&navigate=yes&utm_source=parapo`;
        const worstRailCheck = worstLastTrainCheck(checkLastTrain(selected.legs));
        const selectedRideLegs = selected.legs.filter(l => l.type === 'ride') as RideLeg[];
        const selectedDisplayFare = beepAdjustedTotalFare(selectedRideLegs, hasBeep);

        return (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '52px 20px 0', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setScreen('results')} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-pill)', padding: '9px 16px', cursor: 'pointer', color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={13} strokeWidth={2.5} color="currentColor" /> Routes
              </button>
              {/* Was a plain <span> styled exactly like a button - same pill
                  shape and fill as every real control on this screen - so it
                  read as tappable and did nothing when tapped. It now cycles
                  to the next itinerary, which is what its own label promises:
                  tap "Another way" and you see another way. */}
              {itineraries.length > 1 ? (
                <button
                  onClick={() => {
                    const i = itineraries.indexOf(selected);
                    const next = itineraries[(i + 1) % itineraries.length];
                    setSelected(next);
                  }}
                  style={{
                    background: C.accent, border: 'none', borderRadius: 'var(--radius-pill)',
                    padding: '9px 16px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {selected.alternative ? 'Another way' : OBJ_LABEL[selected.objective] ?? selected.objective}
                  <span aria-hidden style={{ fontSize: 12, lineHeight: 1, display: 'inline-flex' }}><ArrowLeftRight size={12} strokeWidth={2.5} color="currentColor" /></span>
                </button>
              ) : (
                <span style={{ background: C.accent, borderRadius: 'var(--radius-pill)', padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FFFFFF' }}>
                  {OBJ_LABEL[selected.objective] ?? selected.objective}
                </span>
              )}
            </div>

            <Sheet height="70%" collapsible>
              <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '10px 24px 32px' }}>
                {/* Headline numbers */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 0 6px' }}>
                  <div>
                    <span className="tnum" style={{ fontFamily: NUMERAL, fontSize: 'var(--text-6xl)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1 }}>
                      {selected.totalDurationMin}<span style={{ fontSize: 17, fontWeight: 600, color: C.muted }}> min</span>
                    </span>
                    <p className="tnum" style={{ margin: '6px 0 0', fontSize: 14, color: C.body }}>
                      arrive ~{arriveAt(selected.totalDurationMin)} · {selected.transfers} transfer{selected.transfers !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="tnum" style={{ fontFamily: NUMERAL, fontSize: 'var(--text-3xl)', fontWeight: 800, color: C.accent, letterSpacing: '-0.01em' }}>₱{selectedDisplayFare.toFixed(2)}</span>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>per person{hasBeep ? ' · Beep' : ' · cash'}</p>
                  </div>
                </div>

                <div style={{ margin: '10px 0 26px' }}><JourneyBar itin={selected} /></div>

                {worstRailCheck && (
                  <div style={{
                    margin: '0 0 20px', padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                    background: worstRailCheck.status === 'closed' ? C.error : C.accent,
                    color: '#FFFFFF',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
                      {worstRailCheck.status === 'closed'
                        ? `⚠ Last train has left - ${worstRailCheck.lineName} closed at ${formatClockTime(worstRailCheck.closesAt)}. This route won't work right now.`
                        : `⏰ You'll just make the last train - ${worstRailCheck.lineName} boards ~${formatClockTime(worstRailCheck.boardsAt)} (closes ${formatClockTime(worstRailCheck.closesAt)}).`}
                    </p>
                  </div>
                )}

                {/* Step by step */}
                <Micro>{t(lang, 'step_by_step')}</Micro>
                <div style={{ margin: '14px 0 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {selected.legs.map((leg, i) => {
                    if (leg.type === 'walk') {
                      const jeep = suggestJeepneyCorridor(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng);
                      const isFinalLeg = i === selected.legs.length - 1;
                      const entrance = isFinalLeg ? nearestStationEntrance(leg.fromName, leg.toLat, leg.toLng) : null;
                      return (
                      <div key={i}>
                        <div style={{ display: 'flex', gap: 14 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: C.muted, width: 38, flexShrink: 0, paddingTop: 3 }}>WALK</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>{t(lang, 'walk_to', { stop: leg.toName })}</p>
                            <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{leg.durationMin} min · {leg.distKm.toFixed(2)} km</p>
                            {entrance && (
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: C.accent, fontWeight: 600 }}>
                                Exit via the {entrance.label} - closer to your destination
                              </p>
                            )}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Free</span>
                        </div>
                        {jeep && (
                          <div style={{
                            marginLeft: 52, marginTop: 8, padding: '10px 12px', borderRadius: 12,
                            border: `1.5px dashed ${C.border}`, background: C.surface,
                          }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.body }}>
                              Suggested - ask a jeepney toward {jeep.towardLabel}
                            </p>
                            <p className="tnum" style={{ margin: '3px 0 0', fontSize: 11, color: C.muted }}>
                              {jeep.corridorName} · ~₱{jeep.fareLow.toFixed(0)}–{jeep.fareHigh.toFixed(0)} · not a tracked route, no schedule
                            </p>
                          </div>
                        )}
                      </div>
                      );
                    }
                    const ride = leg as RideLeg;
                    const meta = MODE_META[ride.mode] ?? { label: ride.mode.toUpperCase(), shade: C.muted };
                    // Jeepneys have no fixed schedule, so a per-leg minute figure
                    // is misleading - show board/alight stops instead. The leg's
                    // travel time still rolls into the overall trip ETA above.
                    const noSchedule = ride.mode === 'jeepney';
                    const beepFare = beepAdjustedFare(ride, hasBeep);
                    const outages = ride.mode === 'mrt'
                      ? [...(accessibilityByStop[ride.from.id] ?? []), ...(accessibilityByStop[ride.to.id] ?? [])]
                          .filter(a => a.status === 'out_of_service')
                      : [];
                    return (
                      <div key={i} style={{ display: 'flex', gap: 14 }}>
                        <span style={{ flexShrink: 0, paddingTop: 3 }}><SignboardChip label={meta.label} shade={C.ink} /></span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{ride.line.name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: C.body }}>
                            {noSchedule ? t(lang, 'along_corridor') : ''} {ride.from.name} → {ride.to.name}
                          </p>
                          <p className="tnum" style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>
                            {ride.stops.length} stop{ride.stops.length !== 1 ? 's' : ''} · {ride.distKm.toFixed(1)} km
                            {!noSchedule && ` · ${ride.durationMin} min`}
                          </p>
                          {noSchedule && (
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
                              {t(lang, 'no_fixed_schedule')}
                            </p>
                          )}
                          {ride.stops.length > 2 && (
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                              {ride.stops.map(s => s.name).join(' → ')}
                            </p>
                          )}
                          {beepFare.note && (
                            <p style={{ margin: '6px 0 0', fontSize: 11, color: C.accent, fontWeight: 600 }}>{beepFare.note}</p>
                          )}
                          {outages.map((a, oi) => (
                            <p key={oi} style={{ margin: '4px 0 0', fontSize: 11, color: C.error, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} strokeWidth={2.5} color="currentColor" />
                              {a.feature === 'elevator' ? 'Elevator' : 'Escalator'} reported out of service
                              {a.note ? ` - ${a.note}` : ''}
                            </p>
                          ))}
                        </div>
                        <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>₱{beepFare.displayFare.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Fare breakdown - receipt typography */}
                <Micro>{t(lang, 'fare_breakdown')}{!hasBeep ? ' (cash / no Beep card)' : ''}</Micro>
                <div style={{ margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {selected.legs.map((leg, i) => {
                    if (leg.type === 'walk') return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: C.muted }}>Walk · {leg.distKm.toFixed(2)} km</span>
                        <span style={{ color: C.muted }}>Free</span>
                      </div>
                    );
                    const ride = leg as RideLeg;
                    const beepFare = beepAdjustedFare(ride, hasBeep);
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                          <span style={{ fontWeight: 700, color: C.ink }}>{ride.line.name} <span className="tnum" style={{ fontWeight: 400, color: C.muted }}>{ride.distKm.toFixed(1)} km</span></span>
                          <span className="tnum" style={{ fontWeight: 700, color: C.ink }}>₱{beepFare.displayFare.toFixed(2)}</span>
                        </div>
                        {beepFare.note && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.accent, fontWeight: 600 }}>{beepFare.note}</p>}
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{t(lang, 'total_per_person')}</span>
                    <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>₱{selectedDisplayFare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => {
                    try { sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(selected)); } catch { /* noop */ }
                    router.push('/trip');
                  }} style={{
                    width: '100%', border: 'none', borderRadius: 'var(--radius-pill)', padding: '17px',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--gradient-primary)', color: C.onPrimary, letterSpacing: '0.01em',
                    boxShadow: 'var(--shadow-accent)',
                  }}>
                    {t(lang, 'start_trip')}
                  </button>
                  <a href={wazeUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: 'block', textAlign: 'center', border: `1.5px solid ${C.accent}`, borderRadius: 'var(--radius-pill)',
                    padding: '15px', fontSize: 15, fontWeight: 700, color: C.accent,
                    textDecoration: 'none', fontFamily: 'inherit',
                  }}>
                    Open in Waze
                  </a>

                  {addingStop ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-md)', padding: 14 }}>
                      <StopRow label="Add another stop" value={nextStop} onChange={setNextStop} placeholder={t(lang, 'choose_a_stop')} stops={stopNames} />
                      {chainError && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.error }}>{chainError}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={addAnotherStop}
                          disabled={!nextStop || nextStop === to || chainBusy}
                          style={{
                            flex: 1, cursor: nextStop && nextStop !== to ? 'pointer' : 'default', fontFamily: 'inherit',
                            fontSize: 13, fontWeight: 700, padding: '10px', borderRadius: 'var(--radius-pill)', border: 'none',
                            background: nextStop && nextStop !== to ? C.accent : C.cardEl,
                            color: nextStop && nextStop !== to ? C.onPrimary : C.muted,
                          }}
                        >
                          {chainBusy ? 'Adding…' : 'Add to trip'}
                        </button>
                        <button
                          onClick={() => { setAddingStop(false); setNextStop(''); setChainError(null); }}
                          style={{ fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'none', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingStop(true)} style={{
                      width: '100%', background: 'transparent', color: C.ink,
                      border: `1.5px solid ${C.border}`, borderRadius: 'var(--radius-pill)',
                      padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      + Add another stop
                    </button>
                  )}

                  <button onClick={() => { setFrom(''); setTo(''); setSelected(null); setItineraries([]); setScreen('home'); }} style={{
                    width: '100%', background: 'none', border: 'none', padding: '12px',
                    fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t(lang, 'plan_another_trip')}
                  </button>
                  <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
                    <ReportIssueButton routeId={selectedRideLegs[0]?.line.id} contextLabel={comboLabel(selected)} />
                  </div>
                </div>
              </div>
            </Sheet>
          </>
        );
      })()}

      {/* Drop-a-pin picker. A confirmed pin is registered under its address
          so it behaves like any other stop from here on - searchable in the
          row, routable, swappable. */}
      {pinningFor && (
        <PinPickerSheet
          title={pinningFor === 'from' ? 'Set your starting point' : 'Set your destination'}
          initial={
            pinningFor === 'from'
              ? originCoords(from) ?? myLoc
              : resolveStop(to) ?? myLoc
          }
          onCancel={() => setPinningFor(null)}
          onConfirm={(loc: PickedLocation) => {
            // The note distinguishes two pins that reverse-geocode to the
            // same street, which is common along a long address.
            const name = loc.note ? `${loc.label} (${loc.note})` : loc.label;
            setPinned(prev => ({ ...prev, [name]: [loc.lat, loc.lng] }));
            if (pinningFor === 'from') setFrom(name); else setTo(name);
            setPinningFor(null);
          }}
        />
      )}
    </div>
  );
}
