import { haversineKm, walkMinutes } from './utils';
import { DEFAULT_FARE_RULES } from './fares';
import type { FareRule, GraphEdge, GraphNode, Line, LineData, Stop, TransitGraph } from './types';

const TRANSFER_WALK_MAX_KM = 0.5;
const RIDE_SPEED_KMH: Record<string, number> = {
  jeepney: 18, bus: 24, mrt: 45, lrt: 40,
};

// ---------------------------------------------------------------------------
// Seed data — real Metro Manila transit network subset
// Replace this with DB queries in Phase 1+.
// ---------------------------------------------------------------------------

const SEED_LINES: Line[] = [
  { id: 1, name: 'MRT-3 (EDSA Line)', mode: 'mrt',     color: '#E63946' },
  { id: 2, name: 'LRT-2 (Meralco Ave)', mode: 'lrt',   color: '#2A9D8F' },
  { id: 3, name: 'EDSA Bus Carousel',  mode: 'bus',     color: '#D05A28' },
  { id: 4, name: 'Katipunan Jeepney',  mode: 'jeepney', color: '#B8962E' },
];

const SEED_STOPS: Stop[] = [
  // MRT-3 stations (south ↔ north along EDSA)
  { id:  1, name: 'Taft Avenue (MRT)',   lat: 14.5395, lng: 120.9985 },
  { id:  2, name: 'Magallanes',          lat: 14.5401, lng: 121.0038 },
  { id:  3, name: 'Ayala',               lat: 14.5487, lng: 121.0279 },
  { id:  4, name: 'Buendia',             lat: 14.5536, lng: 121.0347 },
  { id:  5, name: 'Guadalupe',           lat: 14.5658, lng: 121.0469 },
  { id:  6, name: 'Ortigas (MRT)',       lat: 14.5876, lng: 121.0583 },
  { id:  7, name: 'Shaw Blvd',           lat: 14.5811, lng: 121.0543 },
  { id:  8, name: 'Boni',                lat: 14.5762, lng: 121.0477 },
  { id:  9, name: 'Cubao (MRT)',         lat: 14.6228, lng: 121.0526 },
  { id: 10, name: 'GMA-Kamuning',        lat: 14.6378, lng: 121.0484 },
  { id: 11, name: 'Quezon Ave (MRT)',    lat: 14.6449, lng: 121.0403 },
  { id: 12, name: 'North Avenue',        lat: 14.6521, lng: 121.0322 },

  // LRT-2 stations (west ↔ east)
  { id: 20, name: 'Recto',              lat: 14.5987, lng: 120.9844 },
  { id: 21, name: 'Legarda',            lat: 14.5979, lng: 121.0024 },
  { id: 22, name: 'Pureza',             lat: 14.6015, lng: 121.0202 },
  { id: 23, name: 'V. Mapa',            lat: 14.5922, lng: 121.0406 },
  { id: 24, name: 'J. Ruiz',            lat: 14.6009, lng: 121.0479 },
  { id: 25, name: 'Gilmore',            lat: 14.6083, lng: 121.0528 },
  { id: 26, name: 'Betty Go-Belmonte',  lat: 14.6145, lng: 121.0530 },
  { id: 27, name: 'Cubao (LRT-2)',      lat: 14.6224, lng: 121.0524 },
  { id: 28, name: 'Anonas',             lat: 14.6282, lng: 121.0700 },
  { id: 29, name: 'Katipunan (LRT-2)', lat: 14.6284, lng: 121.0731 },
  { id: 30, name: 'Santolan (LRT-2)',  lat: 14.6280, lng: 121.0826 },
  { id: 31, name: 'Marikina-Pasig',    lat: 14.6362, lng: 121.1068 },
  { id: 32, name: 'Antipolo',          lat: 14.6249, lng: 121.1240 },

  // EDSA Bus Carousel key stops
  { id: 40, name: 'Monumento (Bus)',    lat: 14.6543, lng: 120.9840 },
  { id: 41, name: 'Trinoma',           lat: 14.6520, lng: 121.0320 },
  { id: 42, name: 'Cubao (Bus)',       lat: 14.6197, lng: 121.0510 },
  { id: 43, name: 'Ortigas (Bus)',     lat: 14.5870, lng: 121.0576 },
  { id: 44, name: 'Magallanes (Bus)', lat: 14.5410, lng: 121.0030 },
  { id: 45, name: 'Taft Ave (Bus)',   lat: 14.5545, lng: 120.9942 },

  // Katipunan Jeepney route
  { id: 50, name: 'Katipunan LRT2 (Jeep)', lat: 14.6284, lng: 121.0730 },
  { id: 51, name: 'Ateneo Gate',            lat: 14.6395, lng: 121.0775 },
  { id: 52, name: 'UP Diliman',             lat: 14.6540, lng: 121.0685 },
  { id: 53, name: 'Balara',                 lat: 14.6700, lng: 121.0720 },
  { id: 54, name: 'Tandang Sora',           lat: 14.6820, lng: 121.0440 },
];

// Stop sequences per line  [lineId, [stopId, stopId, ...]]
const SEED_LINE_STOPS: Array<[number, number[]]> = [
  [1, [1, 2, 3, 4, 5, 8, 7, 6, 9, 10, 11, 12]],
  [2, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]],
  [3, [40, 41, 42, 43, 44, 45]],
  [4, [50, 51, 52, 53, 54]],
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
