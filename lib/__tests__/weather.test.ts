import { describe, it, expect } from 'vitest';
import { interpretForecast, type OpenMeteoForecast } from '../weather';

function forecast(overrides: Partial<OpenMeteoForecast> = {}): OpenMeteoForecast {
  return {
    current: { precipitation: 0, rain: 0 },
    hourly: { precipitation_probability: [10, 20, 15, 10, 5, 5], rain: [0, 0, 0, 0, 0, 0] },
    ...overrides,
  };
}

describe('interpretForecast', () => {
  it('flags no advisory on a dry forecast', () => {
    const result = interpretForecast(forecast());
    expect(result.heavyRainExpected).toBe(false);
    expect(result.message).toMatch(/no heavy rain/i);
  });

  it('flags an advisory when it is raining right now', () => {
    const result = interpretForecast(forecast({ current: { precipitation: 2.0, rain: 2.0 } }));
    expect(result.heavyRainExpected).toBe(true);
    expect(result.message).toMatch(/right now/i);
  });

  it('does not flag a light drizzle currently falling', () => {
    const result = interpretForecast(forecast({ current: { precipitation: 0.1, rain: 0.1 } }));
    expect(result.heavyRainExpected).toBe(false);
  });

  it('flags an advisory when a high-probability, meaningful-rain hour is forecast', () => {
    const result = interpretForecast(forecast({
      hourly: { precipitation_probability: [10, 20, 75, 80, 30, 10], rain: [0, 0, 0.1, 1.2, 0, 0] },
    }));
    expect(result.heavyRainExpected).toBe(true);
    expect(result.message).toMatch(/expected soon/i);
  });

  it('does not flag a high probability if the forecast rain amount is negligible', () => {
    const result = interpretForecast(forecast({
      hourly: { precipitation_probability: [10, 20, 90, 90, 30, 10], rain: [0, 0, 0.05, 0.05, 0, 0] },
    }));
    expect(result.heavyRainExpected).toBe(false);
  });

  it('does not flag meaningful rain if the probability stays low', () => {
    const result = interpretForecast(forecast({
      hourly: { precipitation_probability: [10, 20, 30, 40, 30, 10], rain: [0, 0, 3.0, 3.0, 0, 0] },
    }));
    expect(result.heavyRainExpected).toBe(false);
  });

  it('reports the max probability across the forecast window', () => {
    const result = interpretForecast(forecast({
      hourly: { precipitation_probability: [10, 45, 82, 40, 5, 5], rain: [0, 0, 0, 0, 0, 0] },
    }));
    expect(result.maxProbabilityPercent).toBe(82);
  });
});
