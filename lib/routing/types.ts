export type Mode = 'walk' | 'jeepney' | 'bus' | 'mrt' | 'lrt';

export type Objective = 'fastest' | 'fewest_transfers' | 'cheapest';

export type Stop = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

export type Line = {
  id: number;
  name: string;
  mode: Mode;
  color: string;
};

export type FareRule = {
  lineId: number | null; // null = applies to all lines of this mode
  mode: Mode;
  baseFare: number;    // minimum fare (charged for the whole boarding)
  perKmRate: number;   // per-km rate applied beyond flagDistanceKm
  flagDistanceKm?: number; // free km included in baseFare; defaults to 4 in computeFare
  /**
   * Highest fare the operator will charge for a single journey.
   *
   * Rail fares here are published as a MATRIX with a ceiling, not as an
   * open-ended per-km rate - `base + rate x km` only approximates the middle
   * of that matrix and can overshoot at the ends. E.g. LRT-1's real ceiling
   * is P52 (beep); without this cap a long enough trip would price past it.
   * Omit when the operator genuinely publishes no ceiling.
   */
  maxFare?: number;
};

// Graph edges stored per stop
export type RideEdge = {
  type: 'ride';
  toStopId: number;
  lineId: number;
  distKm: number;
  timeMin: number;
};

export type TransferEdge = {
  type: 'transfer';
  toStopId: number;
  distKm: number;
  timeMin: number;
};

export type GraphEdge = RideEdge | TransferEdge;

export type GraphNode = {
  stop: Stop;
  edges: GraphEdge[];
};

export type LineData = {
  line: Line;
  stops: Stop[]; // ordered by stop_sequence
};

export type TransitGraph = {
  nodes: Map<number, GraphNode>;
  lines: Map<number, LineData>;
  fareRules: FareRule[];
};

// Itinerary output types
export type WalkLeg = {
  type: 'walk';
  fromName: string;
  toName: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  distKm: number;
  durationMin: number;
};

export type RideLeg = {
  type: 'ride';
  mode: Mode;
  line: Line;
  from: Stop;
  to: Stop;
  stops: Stop[];
  distKm: number;
  durationMin: number;
  fare: number;
  // Rule actually applied to this boarding, so the UI can show the
  // computation (base + per-km beyond the flag distance) honestly.
  fareRule?: { baseFare: number; perKmRate: number; flagDistanceKm: number };
};

export type Leg = WalkLeg | RideLeg;

export type Itinerary = {
  legs: Leg[];
  totalDurationMin: number;
  totalFare: number;
  transfers: number;
  objective: Objective;
  /**
   * True when this itinerary was surfaced as a different way to make the
   * trip rather than as the winner of an objective. A commuter picks a
   * route for reasons the cost function never sees - queue length at the
   * turnstile, wanting a seat, aircon, or just knowing the road - so the
   * planner offers the runner-up modes instead of insisting on one answer.
   */
  alternative?: true;
};

export type PlanQuery = {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  departAt?: Date;
  rush?: boolean;           // force rush-hour congestion; defaults from departAt hour
  preference?: Objective;
  excludeLines?: number[];  // line IDs whose ride edges are skipped (F13/F15 reroute)
  excludeModes?: Mode[];    // modes to exclude entirely (e.g. 'bus' during bus strike)
};
