import { afterEach, describe, expect, it, vi } from 'vitest';

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
