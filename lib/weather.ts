/**
 * Rain/flood advisory — Open-Meteo (no API key), Metro Manila.
 * Server-only: the fetch happens in the API route, never from the
 * browser, so this stays inside the single-API-boundary rule and lets us
 * cache the result briefly instead of hitting Open-Meteo on every planner
 * load.
 */

// Roughly central across the routable network (QC/Cubao area) — a single
// citywide advisory, not per-station, so exact placement isn't critical.
const METRO_MANILA_LAT = 14.6091;
const METRO_MANILA_LNG = 121.0223;

export type OpenMeteoForecast = {
  current: { precipitation: number; rain: number };
  hourly: { precipitation_probability: number[]; rain: number[] };
};

export async function fetchOpenMeteoForecast(): Promise<OpenMeteoForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${METRO_MANILA_LAT}&longitude=${METRO_MANILA_LNG}` +
    `&current=precipitation,rain&hourly=precipitation_probability,rain` +
    `&forecast_hours=6&timezone=Asia%2FManila`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
  return res.json();
}

export type RainAdvisory = {
  heavyRainExpected: boolean;
  currentPrecipitationMm: number;
  maxProbabilityPercent: number;
  message: string;
};

// Currently raining at a noticeable rate, or a good chance of meaningful
// rain in the next 6 hours — thresholds picked to flag "bring an umbrella
// and expect road delays", not every trace of drizzle.
const CURRENT_RAIN_THRESHOLD_MM = 0.5;
const FORECAST_PROBABILITY_THRESHOLD = 70;
const FORECAST_RAIN_THRESHOLD_MM = 0.5;

export function interpretForecast(forecast: OpenMeteoForecast): RainAdvisory {
  const currentMm = forecast.current?.precipitation ?? 0;
  const probabilities = forecast.hourly?.precipitation_probability ?? [];
  const rains = forecast.hourly?.rain ?? [];

  const maxProbability = probabilities.length > 0 ? Math.max(...probabilities) : 0;
  const forecastHeavyIndex = probabilities.findIndex(
    (p, i) => p >= FORECAST_PROBABILITY_THRESHOLD && (rains[i] ?? 0) >= FORECAST_RAIN_THRESHOLD_MM,
  );

  const isRainingNow = currentMm >= CURRENT_RAIN_THRESHOLD_MM;
  const heavyRainExpected = isRainingNow || forecastHeavyIndex !== -1;

  const message = isRainingNow
    ? 'Heavy rain right now — jeepney/bus delays likely, consider rail'
    : forecastHeavyIndex !== -1
      ? 'Heavy rain expected soon — jeepney/bus delays likely, consider rail'
      : 'No heavy rain expected';

  return {
    heavyRainExpected,
    currentPrecipitationMm: currentMm,
    maxProbabilityPercent: maxProbability,
    message,
  };
}
