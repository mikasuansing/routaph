/**
 * Reverse geocoding — coordinates to a street address, via OpenStreetMap's
 * Nominatim service.
 *
 * Server-only, like `lib/weather.ts`. That is not incidental: Nominatim's
 * usage policy requires a genuine identifying User-Agent and at most one
 * request per second, neither of which a browser-side call could honestly
 * provide, and calling it from the client would breach the single-API
 * boundary rule too.
 *
 * Address data is © OpenStreetMap contributors, licensed ODbL.
 */

export type ReverseGeocode = {
  label: string;
  fullLabel: string;
  lat: number;
  lng: number;
  source: 'osm' | 'coords';
};

/**
 * Cache grid, in decimal places. Five places is roughly 1.1 m — finer than
 * a dropped pin is meaningful — so rounding here collapses the many
 * near-identical lookups a dragging map produces into one cache entry.
 */
const GRID_DP = 5;

/** Street addresses effectively never change; the cache is what keeps us
 *  inside Nominatim's rate limit. */
export const GEOCODE_CACHE_TTL_SEC = 60 * 60 * 24 * 30;

export function geocodeCacheKey(lat: number, lng: number): string {
  return `geo:rev:v1:${lat.toFixed(GRID_DP)}:${lng.toFixed(GRID_DP)}`;
}

/** Coordinates as a last-resort label — never pretty, but never a lie. */
export function coordsLabel(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

type NominatimAddress = Record<string, string | undefined>;

/**
 * Build the short label a commuter actually reads. Nominatim's
 * `display_name` runs to the country and is far too long for a card, so
 * this keeps the specific part (house number + road, or the named place)
 * plus the city.
 */
export function shortLabel(address: NominatimAddress, displayName: string): string {
  const road = address.road ?? address.pedestrian ?? address.footway ?? address.residential;
  const house = address.house_number;
  const place =
    address.amenity ?? address.building ?? address.shop ?? address.mall ??
    address.office ?? address.tourism ?? address.leisure;
  const city =
    address.city ?? address.town ?? address.municipality ??
    address.village ?? address.suburb ?? address.county;

  const street = road ? (house ? `${house} ${road}` : road) : undefined;
  const head = place ?? street;

  if (head && city) return `${head}, ${city}`;
  if (head) return head;
  if (city) return city;
  // Nothing structured came back — fall back to the leading part of the
  // display name rather than showing the whole country-length string.
  return displayName.split(',').slice(0, 2).join(',').trim() || displayName;
}

export async function fetchReverseGeocode(lat: number, lng: number): Promise<ReverseGeocode> {
  const userAgent = process.env.GEOCODER_USER_AGENT;
  if (!userAgent) {
    // Nominatim blocks unidentified clients, and sending a fake agent would
    // be worse than degrading — fall back to coordinates.
    return { label: coordsLabel(lat, lng), fullLabel: coordsLabel(lat, lng), lat, lng, source: 'coords' };
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Nominatim request failed: ${res.status}`);

  const json = (await res.json()) as {
    display_name?: string;
    address?: NominatimAddress;
    error?: string;
  };

  if (json.error || !json.display_name) {
    // A point in the sea or an unmapped area — legitimate, not a failure.
    return { label: coordsLabel(lat, lng), fullLabel: coordsLabel(lat, lng), lat, lng, source: 'coords' };
  }

  return {
    label: shortLabel(json.address ?? {}, json.display_name),
    fullLabel: json.display_name,
    lat,
    lng,
    source: 'osm',
  };
}
