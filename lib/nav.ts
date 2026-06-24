// Waze deep-link helpers for navigation handoff (MAP-2).
// These open the Waze app if installed, or waze.com as fallback.
// Only destination data leaves the app — no secrets or account info.

export function wazeNavUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes&utm_source=parapo`;
}

export function wazeSearchUrl(query: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes&utm_source=parapo`;
}
