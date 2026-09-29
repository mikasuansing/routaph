#!/usr/bin/env node
/**
 * Loads prepared Project NOAH flood polygons into public.flood_zones.
 *
 * Usage (see docs/flood-data.md for how the GeoJSON is prepared):
 *   node --env-file=.env.local scripts/import-flood-zones.mjs \
 *     <zones.geojson> --project <supabase-project-ref> [--return-period 25]
 *
 * Safety:
 *   - --project is required and must match the ref in
 *     NEXT_PUBLIC_SUPABASE_URL, so a stale or swapped .env.local can never
 *     write hazard data into the wrong database.
 *   - Refuses to run if rows for this return period already exist. It never
 *     deletes: clearing old rows is a deliberate manual step.
 *
 * Talks to PostgREST with plain fetch rather than supabase-js, which pulls
 * in a WebSocket client that Node 20 doesn't ship.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BATCH_SIZE = 200;
const SOURCE = 'Project NOAH (UP NOAH Center / DOST), ODC-ODbL';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const file = process.argv[2];
const expectedRef = arg('--project');
const returnPeriod = Number(arg('--return-period') ?? 25);

if (!file || file.startsWith('--')) fail('first argument must be the GeoJSON path');
if (!expectedRef) fail('--project <ref> is required');
if (![5, 25, 100].includes(returnPeriod)) fail('--return-period must be 5, 25 or 100');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

const actualRef = new URL(url).hostname.split('.')[0];
if (actualRef !== expectedRef) {
  fail(`env points at project "${actualRef}", expected "${expectedRef}". Nothing written.`);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

// ── Geometry: GeoJSON -> EWKT, which PostGIS parses on insert ────────────
const ring = r => `(${r.map(([x, y]) => `${x} ${y}`).join(',')})`;
const polygonWkt = rings => `SRID=4326;POLYGON(${rings.map(ring).join(',')})`;

function toRows(feature) {
  const hazard = Number(feature.properties?.hazard);
  if (![1, 2, 3].includes(hazard)) fail(`feature with invalid hazard: ${feature.properties?.hazard}`);
  // Simplification can split a polygon into a MultiPolygon, or (rarely) a
  // GeometryCollection with degenerate lines. The column is POLYGON, so each
  // polygon part becomes its own row and anything else is dropped.
  const polygonsOf = g =>
    g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates
    : g.type === 'GeometryCollection' ? g.geometries.flatMap(polygonsOf)
    : [];
  return polygonsOf(feature.geometry).map(p => ({
    hazard,
    return_period_yr: returnPeriod,
    source: SOURCE,
    geom: polygonWkt(p),
  }));
}

const geojson = JSON.parse(readFileSync(resolve(file), 'utf8'));
const rows = geojson.features.flatMap(toRows);
console.log(`Target project: ${actualRef}`);
console.log(`Prepared ${rows.length} polygons (return period ${returnPeriod}y)`);

// ── Refuse to double-load ─────────────────────────────────────────────────
const countRes = await fetch(
  `${url}/rest/v1/flood_zones?select=id&return_period_yr=eq.${returnPeriod}`,
  { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } },
);
if (!countRes.ok) fail(`count query failed: ${countRes.status} ${await countRes.text()}`);
const existing = Number(countRes.headers.get('content-range')?.split('/')[1] ?? 0);
if (existing > 0) {
  fail(`${existing} rows for ${returnPeriod}y already exist. Clear them manually first.`);
}

// ── Insert ────────────────────────────────────────────────────────────────
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const res = await fetch(`${url}/rest/v1/flood_zones`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(batch),
  });
  if (!res.ok) fail(`batch at ${i} failed: ${res.status} ${await res.text()}`);
  process.stdout.write(`\r  inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
}
console.log('\nDone.');
