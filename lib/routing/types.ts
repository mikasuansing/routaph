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
};

export type PlanQuery = {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  departAt?: Date;
  preference?: Objective;
  excludeLines?: number[];  // line IDs whose ride edges are skipped (F13/F15 reroute)
  excludeModes?: Mode[];    // modes to exclude entirely (e.g. 'bus' during bus strike)
};
