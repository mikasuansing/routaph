/**
 * Basemap for the Leaflet maps (planner and trip).
 *
 * PRIMARY: OpenFreeMap vector tiles (Positron light, Dark dark), drawn by
 * MapLibre inside a Leaflet layer via @maplibre/maplibre-gl-leaflet. Keyless,
 * no signup, ODbL data. Leaflet keeps owning the map, so every route line,
 * marker and live-vehicle layer is untouched; only the ground beneath it is
 * swapped. See docs/adr/0005-openfreemap-basemap-in-leaflet.md.
 *
 * FALLBACK: raster tiles, when the device has no WebGL (MapLibre needs it) or
 * the vector layer fails to start. CARTO Voyager/Dark Matter when
 * NEXT_PUBLIC_CARTO_API_KEY is set, else OpenStreetMap's own tiles (light
 * only, and subject to OSM's tile usage policy). CARTO stamps "API KEY
 * REQUIRED" over keyless tiles, which is why the key matters there.
 *
 * The CARTO key is a public client key by design (it sits in the tile URL),
 * so NEXT_PUBLIC_ is correct.
 */

export type TileConfig = {
  url: string;
  /** Leaflet `subdomains` option; empty because neither URL uses {s}. */
  subdomains: string;
  attribution: string;
};

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;

/** Raster tiles for the no-WebGL fallback. */
export function tileConfig(isDark: boolean): TileConfig {
  if (CARTO_KEY) {
    const style = isDark ? 'dark_all' : 'voyager';
    return {
      url: `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`,
      subdomains: '',
      attribution: '© OpenStreetMap contributors © CARTO',
    };
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: '',
    attribution: '© OpenStreetMap contributors',
  };
}

/** OpenFreeMap style per theme. Change these two lines to change the look. */
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export function vectorStyleUrl(isDark: boolean): string {
  return isDark ? STYLE_DARK : STYLE_LIGHT;
}

/** Required by OpenFreeMap and its data sources. */
export const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Where scripts/copy-maplibre-worker.mjs puts the worker for a MapLibre version. */
export function mapLibreWorkerUrl(version: string): string {
  return `/maplibre/${version}/maplibre-gl-worker.mjs`;
}

/**
 * MapLibre 6 starts its worker from `new URL(..., import.meta.url)`, which
 * Turbopack rewrites to the page's own URL: the module worker then loads
 * HTML and dies silently, so tiles are never decoded and the map stays blank
 * even though the style itself loads. Give it a real file instead. Must run
 * before the first `new Map()`; safe to call repeatedly.
 */
export function configureMapLibreWorker(maplibre: {
  getVersion: () => string;
  setWorkerUrl: (url: string) => void;
}): void {
  maplibre.setWorkerUrl(mapLibreWorkerUrl(maplibre.getVersion()));
}

/** Handle returned to the page so a theme toggle can restyle the ground. */
export type Basemap = {
  setTheme: (isDark: boolean) => void;
  kind: 'vector' | 'raster';
};

// The Leaflet namespace is passed in by the caller (each page already loads
// it dynamically), so this module stays free of a static Leaflet import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletNamespace = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any;

function addRaster(L: LeafletNamespace, map: LeafletMap, isDark: boolean): Basemap {
  const cfg = tileConfig(isDark);
  const layer = L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    subdomains: cfg.subdomains,
    maxZoom: 19,
  }).addTo(map);
  return {
    kind: 'raster',
    setTheme: dark => layer.setUrl(tileConfig(dark).url),
  };
}

/** How long the vector style gets to load before we give up on it. */
const STYLE_LOAD_TIMEOUT_MS = 10_000;

/**
 * Put a basemap under `map`. Never throws and never leaves the map blank:
 * no WebGL, a plugin failure, a style that errors before it loads, or one
 * that simply never arrives (blocked network, provider outage) all fall
 * back to raster tiles.
 */
export async function addBasemap(
  L: LeafletNamespace,
  map: LeafletMap,
  isDark: boolean,
): Promise<Basemap> {
  if (!hasWebGL()) return addRaster(L, map, isDark);
  try {
    configureMapLibreWorker(await import('maplibre-gl'));
    const { maplibreGL } = await import('@maplibre/maplibre-gl-leaflet');
    const layer = maplibreGL({
      style: vectorStyleUrl(isDark),
      // MapLibre's own attribution control would sit inside the tile pane;
      // Leaflet's control is the one users see.
      attributionControl: false,
    });
    // The plugin derives attribution from the style AFTER it loads, and only
    // if `map.attributionControl` exists, which a hand-built control never
    // sets - so by default nothing shows. OpenFreeMap's terms require the
    // credit, so state it up front. Must precede addTo: Leaflet's control
    // reads getAttribution() at the moment the layer is added.
    layer.getAttribution = () => VECTOR_ATTRIBUTION;
    layer.addTo(map);

    const gl = layer.getMaplibreMap();
    let dark = isDark;
    let raster: Basemap | null = null;
    let settled = false;

    const fallBack = (reason: string): void => {
      if (settled) return;
      settled = true;
      // One line, so "why is my map plain OSM?" is answerable from a console.
      console.warn(`[basemap] vector style abandoned, using raster tiles: ${reason}`);
      clearTimeout(timer);
      try { map.removeLayer(layer); } catch { /* map already torn down */ }
      raster = addRaster(L, map, dark);
    };

    // Settled means the STYLE arrived, not that the first frame finished
    // drawing: MapLibre's `load` also waits on every visible tile, which on a
    // slow connection or a backgrounded tab can take far longer than a
    // sensible give-up time and says nothing about the style being blocked.
    const settle = (): void => {
      settled = true;
      clearTimeout(timer);
    };
    const timer = setTimeout(() => fallBack(`style not loaded within ${STYLE_LOAD_TIMEOUT_MS} ms`), STYLE_LOAD_TIMEOUT_MS);
    gl.once('styledata', settle);
    gl.once('load', settle);
    // Tile errors after the style is up are ordinary; only a style that
    // never arrived means the map would stay blank.
    gl.on('error', (e: { error?: { message?: string } }) => {
      if (!gl.isStyleLoaded()) fallBack(`error before style loaded: ${e?.error?.message ?? 'unknown'}`);
    });

    return {
      get kind() { return raster ? 'raster' : 'vector'; },
      setTheme: d => {
        dark = d;
        if (raster) raster.setTheme(d);
        else gl.setStyle(vectorStyleUrl(d));
      },
    };
  } catch {
    return addRaster(L, map, isDark);
  }
}
