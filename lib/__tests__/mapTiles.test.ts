import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function load(key?: string) {
  vi.resetModules();
  if (key === undefined) vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', '');
  else vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', key);
  return (await import('../mapTiles')).tileConfig;
}

afterEach(() => vi.unstubAllEnvs());

describe('tileConfig', () => {
  it('falls back to keyless OSM tiles when no CARTO key is set', async () => {
    const tileConfig = await load();
    const light = tileConfig(false);
    expect(light.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(light.url).not.toContain('cartocdn');
    expect(light.attribution).not.toContain('CARTO');
  });

  it('never requests keyless CARTO tiles, which come back watermarked', async () => {
    const tileConfig = await load();
    expect(tileConfig(true).url).not.toContain('cartocdn');
    expect(tileConfig(false).url).not.toContain('cartocdn');
  });

  it('uses Voyager for light and Dark Matter for dark when a key is set', async () => {
    const tileConfig = await load('abc123');
    expect(tileConfig(false).url).toBe(
      'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=abc123',
    );
    expect(tileConfig(true).url).toContain('/rastertiles/dark_all/');
    expect(tileConfig(true).url).toContain('?key=abc123');
    expect(tileConfig(false).attribution).toContain('CARTO');
  });

  it('URL-encodes the key so it cannot break out of the query string', async () => {
    const tileConfig = await load('a&b=c');
    expect(tileConfig(false).url).toContain('?key=a%26b%3Dc');
  });

  it('has no {s} placeholder, so Leaflet needs no subdomains', async () => {
    const withKey = await load('k');
    expect(withKey(false).url).not.toContain('{s}');
    expect(withKey(false).subdomains).toBe('');
  });
});

describe('vectorStyleUrl', () => {
  it('uses OpenFreeMap Positron for light and Dark for dark', async () => {
    vi.resetModules();
    const { vectorStyleUrl } = await import('../mapTiles');
    expect(vectorStyleUrl(false)).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(vectorStyleUrl(true)).toBe('https://tiles.openfreemap.org/styles/dark');
  });
});


// A stand-in for the plugin's layer and its MapLibre map.
function fakeGlLayer(over: Record<string, unknown> = {}) {
  const handlers: Record<string, () => void> = {};
  const gl = {
    setStyle: vi.fn(),
    isStyleLoaded: vi.fn().mockReturnValue(false),
    once: (ev: string, fn: () => void) => { handlers[ev] = fn; },
    on: (ev: string, fn: () => void) => { handlers[ev] = fn; },
    ...over,
  };
  const layer = {
    addTo: vi.fn().mockReturnThis(),
    getMaplibreMap: () => gl,
    getAttribution: () => 'plugin default',
  };
  return Object.assign(layer, { handlers, gl });
}

describe('MapLibre worker URL', () => {
  it('builds a versioned path under public/maplibre', async () => {
    vi.resetModules();
    const { mapLibreWorkerUrl } = await import('../mapTiles');
    expect(mapLibreWorkerUrl('6.10.0')).toBe('/maplibre/6.10.0/maplibre-gl-worker.mjs');
  });

  it('points MapLibre at the versioned worker, never its default', async () => {
    vi.resetModules();
    const { configureMapLibreWorker } = await import('../mapTiles');
    const setWorkerUrl = vi.fn();
    configureMapLibreWorker({ getVersion: () => '9.9.9', setWorkerUrl });
    expect(setWorkerUrl).toHaveBeenCalledWith('/maplibre/9.9.9/maplibre-gl-worker.mjs');
  });
});

describe('addBasemap', () => {
  const setWorkerUrl = vi.fn();
  beforeEach(() => {
    setWorkerUrl.mockClear();
    vi.doMock('maplibre-gl', () => ({ getVersion: () => '6.0.0', setWorkerUrl }));
  });
  afterEach(() => vi.doUnmock('maplibre-gl'));

  function fakeLeaflet() {
    const layer = { addTo: vi.fn().mockReturnThis(), setUrl: vi.fn() };
    const L = { tileLayer: vi.fn().mockReturnValue(layer) };
    return { L, layer };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('falls back to raster tiles when the device has no WebGL', async () => {
    vi.resetModules();
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const { addBasemap } = await import('../mapTiles');
    const { L, layer } = fakeLeaflet();
    const basemap = await addBasemap(L, {}, false);
    expect(basemap.kind).toBe('raster');
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
    expect(layer.addTo).toHaveBeenCalled();
    basemap.setTheme(true);
    expect(layer.setUrl).toHaveBeenCalled();
  });

  it('uses the vector layer when WebGL exists and restyles on theme change', async () => {
    vi.resetModules();
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    const setStyle = vi.fn();
    const glLayer = fakeGlLayer({ setStyle });
    const maplibreGL = vi.fn().mockReturnValue(glLayer);
    vi.doMock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL }));
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const basemap = await addBasemap(L, {}, false);
    expect(basemap.kind).toBe('vector');
    // Without this the map loads its style but never decodes a tile.
    expect(setWorkerUrl).toHaveBeenCalledWith('/maplibre/6.0.0/maplibre-gl-worker.mjs');
    expect(maplibreGL.mock.calls[0][0].style).toContain('/styles/positron');
    expect(maplibreGL.mock.calls[0][0].attributionControl).toBe(false);
    expect(glLayer.getAttribution()).toContain('OpenFreeMap');
    expect(glLayer.getAttribution()).toContain('OpenStreetMap');
    expect(L.tileLayer).not.toHaveBeenCalled();
    basemap.setTheme(true);
    expect(setStyle).toHaveBeenCalledWith('https://tiles.openfreemap.org/styles/dark');
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });

  it('falls back to raster, not a blank map, if the vector layer throws', async () => {
    vi.resetModules();
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    vi.doMock('@maplibre/maplibre-gl-leaflet', () => ({
      maplibreGL: () => { throw new Error('style failed'); },
    }));
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const basemap = await addBasemap(L, {}, false);
    expect(basemap.kind).toBe('raster');
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });

  function withVector(glLayer: ReturnType<typeof fakeGlLayer>) {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    vi.doMock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: () => glLayer }));
  }

  it('falls back to raster when the style errors before it loads', async () => {
    vi.resetModules();
    const glLayer = fakeGlLayer();
    withVector(glLayer);
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const map = { removeLayer: vi.fn() };
    const basemap = await addBasemap(L, map, false);
    expect(basemap.kind).toBe('vector');
    glLayer.handlers.error();
    expect(map.removeLayer).toHaveBeenCalledWith(glLayer);
    expect(basemap.kind).toBe('raster');
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });

  it('ignores tile errors once the style has loaded', async () => {
    vi.resetModules();
    const glLayer = fakeGlLayer({ isStyleLoaded: vi.fn().mockReturnValue(true) });
    withVector(glLayer);
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const basemap = await addBasemap(L, { removeLayer: vi.fn() }, false);
    glLayer.handlers.error();
    expect(basemap.kind).toBe('vector');
    expect(L.tileLayer).not.toHaveBeenCalled();
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });

  it('falls back to raster if the style never loads within the timeout', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const glLayer = fakeGlLayer();
    withVector(glLayer);
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const basemap = await addBasemap(L, { removeLayer: vi.fn() }, false);
    expect(basemap.kind).toBe('vector');
    vi.advanceTimersByTime(10_000);
    expect(basemap.kind).toBe('raster');
    vi.useRealTimers();
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });

  it('does not fall back once the style has arrived, even if the first frame never finishes', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const glLayer = fakeGlLayer();
    withVector(glLayer);
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const basemap = await addBasemap(L, { removeLayer: vi.fn() }, false);
    glLayer.handlers.styledata(); // style arrived; `load` (all tiles) never fires
    vi.advanceTimersByTime(60_000);
    expect(basemap.kind).toBe('vector');
    vi.useRealTimers();
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });

  it('keeps the latest theme when it falls back after a toggle', async () => {
    vi.resetModules();
    const glLayer = fakeGlLayer();
    withVector(glLayer);
    const { addBasemap } = await import('../mapTiles');
    const { L } = fakeLeaflet();
    const basemap = await addBasemap(L, { removeLayer: vi.fn() }, false);
    basemap.setTheme(true);
    glLayer.handlers.error();
    expect(L.tileLayer.mock.calls[0][0]).toContain('openstreetmap'); // no CARTO key in tests
    vi.doUnmock('@maplibre/maplibre-gl-leaflet');
  });
});
