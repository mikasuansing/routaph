/**
 * Raster basemap for the Leaflet maps.
 *
 * CARTO now requires an API key on basemaps.cartocdn.com; a request without
 * one still returns an image, but with "API KEY REQUIRED" stamped across it.
 * With NEXT_PUBLIC_CARTO_API_KEY set we use CARTO's Voyager (light) and
 * Dark Matter (dark). Without it we fall back to OpenStreetMap's own tiles,
 * which need no key: the fallback is light-only and subject to OSM's tile
 * usage policy, so it is meant for local dev and as a safety net, not as the
 * production basemap.
 *
 * The key is a public, referrer-scoped client key by design (CARTO's docs
 * put it in the tile URL), so NEXT_PUBLIC_ is correct here.
 */

export type TileConfig = {
  url: string;
  /** Leaflet `subdomains` option; empty because neither URL uses {s}. */
  subdomains: string;
  attribution: string;
};

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;

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
