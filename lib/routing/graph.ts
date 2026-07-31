import { haversineKm, walkMinutes } from './utils';
import { DEFAULT_FARE_RULES } from './fares';
import type { FareRule, GraphEdge, GraphNode, Line, LineData, Stop, TransitGraph } from './types';

const TRANSFER_WALK_MAX_KM = 0.5;
const RIDE_SPEED_KMH: Record<string, number> = {
  jeepney: 18, bus: 24, mrt: 45, lrt: 40,
};

// ---------------------------------------------------------------------------
// Seed data — the offline fallback used when Supabase is unavailable.
//
// Ids, names and coordinates deliberately MIRROR the live database (see
// supabase/seed/*.sql) so the fallback answers the same questions the same
// way instead of quietly disagreeing with production. Rail coordinates come
// from OpenStreetMap relations 109159 / 8000264 / 110418 — © OpenStreetMap
// contributors, ODbL. Keep this in step with
// supabase/seed/007_rail_completion.sql when either changes.
// ---------------------------------------------------------------------------

const SEED_LINES: Line[] = [
  { id: 1, name: 'EDSA Carousel',     mode: 'bus',     color: '#D05A28' },
  { id: 2, name: 'Katipunan Jeepney', mode: 'jeepney', color: '#B8962E' },
  { id: 3, name: 'MRT-3',             mode: 'mrt',     color: '#6366F1' },
  { id: 4, name: 'LRT-2',             mode: 'lrt',     color: '#06B6D4' },
  { id: 5, name: 'LRT-1',             mode: 'lrt',     color: '#0B7A45' },
];

const SEED_STOPS: Stop[] = [
  // ── EDSA Carousel (bus), Monumento → PITX ─────────────────────────────────
  { id:   1, name: 'Monumento',              lat: 14.6549, lng: 120.9842 },
  { id: 421, name: 'Bagong Barrio',          lat: 14.6573, lng: 120.9976 },
  { id:   2, name: 'Balintawak',             lat: 14.6573, lng: 121.0028 },
  { id: 422, name: 'Kaingin Road',           lat: 14.6569, lng: 121.0111 },
  { id: 423, name: 'Roosevelt',              lat: 14.6560, lng: 121.0200 },
  { id: 424, name: 'SM North EDSA',          lat: 14.6560, lng: 121.0300 },
  { id: 425, name: 'North Avenue (Bus)',     lat: 14.6520, lng: 121.0330 },
  { id: 426, name: 'Philam',                 lat: 14.6480, lng: 121.0360 },
  { id: 427, name: 'Quezon Avenue',          lat: 14.6420, lng: 121.0390 },
  { id:   3, name: 'Kamuning',               lat: 14.6360, lng: 121.0430 },
  { id: 428, name: 'Nepa Q-Mart',            lat: 14.6300, lng: 121.0470 },
  { id:   4, name: 'Main Avenue (Cubao)',    lat: 14.6197, lng: 121.0510 },
  { id: 429, name: 'Santolan (EDSA)',        lat: 14.6108, lng: 121.0542 },
  { id:   5, name: 'Ortigas',                lat: 14.5870, lng: 121.0576 },
  { id:   6, name: 'Guadalupe',              lat: 14.5667, lng: 121.0454 },
  { id: 430, name: 'Buendia (Bus)',          lat: 14.5540, lng: 121.0337 },
  { id:   7, name: 'Ayala',                  lat: 14.5488, lng: 121.0275 },
  { id: 431, name: 'Tramo',                  lat: 14.5430, lng: 121.0150 },
  { id:   8, name: 'Taft Ave',               lat: 14.5376, lng: 121.0019 },
  { id: 432, name: 'Roxas Boulevard',        lat: 14.5330, lng: 120.9980 },
  { id: 433, name: 'SM Mall of Asia',        lat: 14.5350, lng: 120.9820 },
  { id: 434, name: 'DFA (Aseana)',           lat: 14.5290, lng: 120.9930 },
  { id: 435, name: 'Ayala Malls Manila Bay', lat: 14.5230, lng: 120.9900 },
  { id: 436, name: 'PITX',                   lat: 14.5083, lng: 120.9912 },

  // ── Katipunan Jeepney ─────────────────────────────────────────────────────
  { id:   9, name: 'Katipunan LRT',   lat: 14.6299, lng: 121.0731 },
  { id:  10, name: 'Ateneo Gate',     lat: 14.6395, lng: 121.0776 },
  { id:  11, name: 'Miriam',          lat: 14.6437, lng: 121.0788 },
  { id:  12, name: 'UP Town Center',  lat: 14.6517, lng: 121.0686 },

  // ── MRT-3, North Avenue → Taft Avenue ─────────────────────────────────────
  { id: 201, name: 'North Avenue',               lat: 14.651694, lng: 121.032633 },
  { id: 202, name: 'Quezon Ave (MRT)',           lat: 14.642449, lng: 121.038645 },
  { id: 203, name: 'GMA-Kamuning',               lat: 14.635333, lng: 121.043275 },
  { id: 204, name: 'Cubao (MRT)',                lat: 14.619478, lng: 121.051057 },
  { id: 213, name: 'Santolan-Annapolis (MRT-3)', lat: 14.607541, lng: 121.056574 },
  { id: 205, name: 'Ortigas (MRT)',              lat: 14.587341, lng: 121.056519 },
  { id: 206, name: 'Shaw Blvd',                  lat: 14.581102, lng: 121.053408 },
  { id: 207, name: 'Boni',                       lat: 14.573093, lng: 121.047644 },
  { id: 208, name: 'Guadalupe (MRT)',            lat: 14.566719, lng: 121.045438 },
  { id: 209, name: 'Buendia',                    lat: 14.553952, lng: 121.033684 },
  { id: 210, name: 'Ayala (MRT)',                lat: 14.548755, lng: 121.027540 },
  { id: 211, name: 'Magallanes',                 lat: 14.541743, lng: 121.019050 },
  { id: 212, name: 'Taft Avenue (MRT)',          lat: 14.537597, lng: 121.001890 },

  // ── LRT-2, Recto → Antipolo ───────────────────────────────────────────────
  { id: 301, name: 'Recto',             lat: 14.603467, lng: 120.983984 },
  { id: 307, name: 'Legarda',           lat: 14.600830, lng: 120.992486 },
  { id: 308, name: 'Pureza',            lat: 14.601679, lng: 121.005040 },
  { id: 309, name: 'V. Mapa',           lat: 14.604003, lng: 121.017048 },
  { id: 310, name: 'J. Ruiz',           lat: 14.610536, lng: 121.026068 },
  { id: 311, name: 'Gilmore',           lat: 14.613477, lng: 121.034082 },
  { id: 312, name: 'Betty Go-Belmonte', lat: 14.618579, lng: 121.042754 },
  { id: 302, name: 'Cubao (LRT-2)',     lat: 14.622891, lng: 121.053041 },
  { id: 313, name: 'Anonas',            lat: 14.628075, lng: 121.065197 },
  { id: 303, name: 'Katipunan (LRT-2)', lat: 14.631260, lng: 121.073293 },
  { id: 304, name: 'Santolan (LRT-2)',  lat: 14.621693, lng: 121.086314 },
  { id: 305, name: 'Marikina (LRT-2)',  lat: 14.620444, lng: 121.100632 },
  { id: 306, name: 'Antipolo',          lat: 14.624771, lng: 121.121380 },

  // ── LRT-1, Dr. Santos → Fernando Poe Jr. (incl. Cavite Extension) ─────────
  { id: 441, name: 'Dr. Santos',          lat: 14.485249, lng: 120.989397 },
  { id: 440, name: 'Ninoy Aquino Avenue', lat: 14.498939, lng: 120.994355 },
  { id: 439, name: 'PITX (LRT-1)',        lat: 14.508304, lng: 120.991240 },
  { id: 438, name: 'MIA Road',            lat: 14.517992, lng: 120.992917 },
  { id: 437, name: 'Redemptorist-Aseana', lat: 14.529737, lng: 120.992985 },
  { id: 401, name: 'Baclaran',            lat: 14.533913, lng: 120.998050 },
  { id: 402, name: 'EDSA (LRT-1)',        lat: 14.538952, lng: 121.000588 },
  { id: 403, name: 'Libertad',            lat: 14.547684, lng: 120.998613 },
  { id: 404, name: 'Gil Puyat',           lat: 14.554054, lng: 120.997144 },
  { id: 405, name: 'Vito Cruz',           lat: 14.563460, lng: 120.994737 },
  { id: 406, name: 'Quirino',             lat: 14.570215, lng: 120.991561 },
  { id: 407, name: 'Pedro Gil',           lat: 14.576579, lng: 120.987999 },
  { id: 408, name: 'UN Avenue',           lat: 14.582623, lng: 120.984546 },
  { id: 409, name: 'Central Terminal',    lat: 14.592447, lng: 120.981705 },
  { id: 410, name: 'Carriedo',            lat: 14.599028, lng: 120.981322 },
  { id: 411, name: 'Doroteo Jose',        lat: 14.605346, lng: 120.981998 },
  { id: 412, name: 'Bambang',             lat: 14.611120, lng: 120.982438 },
  { id: 413, name: 'Tayuman',             lat: 14.616666, lng: 120.982711 },
  { id: 414, name: 'Blumentritt',         lat: 14.622826, lng: 120.982872 },
  { id: 415, name: 'Abad Santos',         lat: 14.630607, lng: 120.981420 },
  { id: 416, name: 'R. Papa',             lat: 14.636026, lng: 120.982264 },
  { id: 417, name: '5th Avenue',          lat: 14.644425, lng: 120.983535 },
  { id: 418, name: 'Monumento (LRT-1)',   lat: 14.653834, lng: 120.983848 },
  { id: 419, name: 'Balintawak (LRT-1)',  lat: 14.657422, lng: 121.003517 },
  { id: 420, name: 'Fernando Poe Jr.',    lat: 14.657622, lng: 121.020688 },
];

// Stop sequences per line  [lineId, [stopId, stopId, ...]]
const SEED_LINE_STOPS: Array<[number, number[]]> = [
  [1, [1, 421, 2, 422, 423, 424, 425, 426, 427, 3, 428, 4, 429, 5, 6, 430, 7, 431, 8, 432, 433, 434, 435, 436]],
  [2, [9, 10, 11, 12]],
  [3, [201, 202, 203, 204, 213, 205, 206, 207, 208, 209, 210, 211, 212]],
  [4, [301, 307, 308, 309, 310, 311, 312, 302, 313, 303, 304, 305, 306]],
  [5, [441, 440, 439, 438, 437, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420]],
];

// ---------------------------------------------------------------------------
// Pure graph builder — no Next.js / Supabase / Redis imports.
// Accepts data from any source (seed constants or a DB loader).
// ---------------------------------------------------------------------------
export function buildGraphFromData(
  lines: Line[],
  stops: Stop[],
  lineStops: Array<[number, number[]]>,
  fareRules: FareRule[],
): TransitGraph {
  const stopMap = new Map<number, Stop>(stops.map(s => [s.id, s]));
  const nodes = new Map<number, GraphNode>();
  for (const stop of stops) {
    nodes.set(stop.id, { stop, edges: [] });
  }

  const linesMap = new Map<number, LineData>();

  for (const [lineId, stopIds] of lineStops) {
    const line = lines.find(l => l.id === lineId);
    if (!line) continue;
    const sequence = stopIds.map(id => stopMap.get(id)).filter((s): s is Stop => s != null);
    linesMap.set(lineId, { line, stops: sequence });

    const speedKmh = RIDE_SPEED_KMH[line.mode] ?? 20;
    for (let i = 0; i < sequence.length - 1; i++) {
      const a = sequence[i];
      const b = sequence[i + 1];
      const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
      const timeMin = (distKm / speedKmh) * 60;
      const edgeAB: GraphEdge = { type: 'ride', toStopId: b.id, lineId, distKm, timeMin };
      const edgeBA: GraphEdge = { type: 'ride', toStopId: a.id, lineId, distKm, timeMin };
      nodes.get(a.id)!.edges.push(edgeAB);
      nodes.get(b.id)!.edges.push(edgeBA);
    }
  }

  // Transfer edges: stops on different lines within TRANSFER_WALK_MAX_KM
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i];
      const b = stops[j];
      const aLines = new Set(lineStops.filter(([, ids]) => ids.includes(a.id)).map(([lid]) => lid));
      const bLines = new Set(lineStops.filter(([, ids]) => ids.includes(b.id)).map(([lid]) => lid));
      if ([...aLines].some(lid => bLines.has(lid))) continue;
      const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
      if (distKm > TRANSFER_WALK_MAX_KM) continue;
      const timeMin = walkMinutes(distKm);
      nodes.get(a.id)!.edges.push({ type: 'transfer', toStopId: b.id, distKm, timeMin });
      nodes.get(b.id)!.edges.push({ type: 'transfer', toStopId: a.id, distKm, timeMin });
    }
  }

  return { nodes, lines: linesMap, fareRules };
}

// ---------------------------------------------------------------------------
// Seed-backed singleton (used by tests and as fallback when DB is unavailable)
// ---------------------------------------------------------------------------
let _graph: TransitGraph | null = null;

export function getGraph(): TransitGraph {
  if (!_graph) _graph = buildGraphFromData(SEED_LINES, SEED_STOPS, SEED_LINE_STOPS, DEFAULT_FARE_RULES);
  return _graph;
}

export function invalidateGraph(): void { _graph = null; }

// Exposed for catalog API seed fallback
export { SEED_LINES as seedLines, SEED_STOPS as seedStops, SEED_LINE_STOPS as seedLineStops };
