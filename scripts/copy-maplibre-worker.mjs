#!/usr/bin/env node
/**
 * Copies MapLibre's worker into public/maplibre/<version>/.
 *
 * MapLibre 6 is ESM-only and starts its worker from
 * `new URL('maplibre-gl-worker.mjs', import.meta.url)`. Turbopack rewrites
 * that into the PAGE's own URL, so the module worker loads HTML, fails
 * silently, and no tile is ever decoded: the style loads on the main thread
 * (so it looks alive) while the map stays blank. lib/mapTiles.ts therefore
 * calls setWorkerUrl() with the files this script puts under public/.
 *
 * The worker imports ./maplibre-gl-shared.mjs, so both must sit together.
 * The directory is versioned so a MapLibre upgrade can never pair a new
 * library with an old worker cached in a browser. Generated, not committed:
 * runs on postinstall, predev and prebuild.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'node_modules', 'maplibre-gl', 'dist');
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(dist)) {
  // First install of a fresh clone: nothing to copy yet, and failing here
  // would break `npm install` itself. predev/prebuild run this again.
  console.log('copy-maplibre-worker: maplibre-gl not installed yet, skipping');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'maplibre-gl', 'package.json'), 'utf8'));
const base = join(root, 'public', 'maplibre');
const out = join(base, version);

mkdirSync(out, { recursive: true });
for (const f of FILES) {
  if (!existsSync(join(dist, f))) {
    console.error(`copy-maplibre-worker: ${f} missing from maplibre-gl ${version}; the worker path in lib/mapTiles.ts needs updating`);
    process.exit(1);
  }
  copyFileSync(join(dist, f), join(out, f));
}

// Drop stale versions so public/ does not accumulate old copies.
for (const d of readdirSync(base)) if (d !== version) rmSync(join(base, d), { recursive: true, force: true });

console.log(`copy-maplibre-worker: maplibre-gl ${version} -> public/maplibre/${version}/`);
