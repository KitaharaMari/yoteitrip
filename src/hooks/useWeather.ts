import { useState, useEffect } from 'react';
import { fetchWeather, type WeatherData } from '@/lib/weather';

// 'loading' = fetch in flight; null = no data available / not applicable
export type WeatherState = WeatherData | null | 'loading';

const cache = new Map<string, WeatherData | null>();

function cacheKey(lat: number, lng: number, isoDate: string) {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${isoDate}`;
}

export function useWeather(
  lat:     number | undefined,
  lng:     number | undefined,
  isoDate: string | undefined,
): WeatherState {
  const [result, setResult] = useState<WeatherState>(() => {
    if (lat == null || lng == null || !isoDate) return null;
    const k = cacheKey(lat, lng, isoDate);
    return cache.has(k) ? (cache.get(k) ?? null) : 'loading';
  });

  useEffect(() => {
    if (lat == null || lng == null || !isoDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      return;
    }
    const k = cacheKey(lat, lng, isoDate);
    if (cache.has(k)) {
      setResult(cache.get(k) ?? null);
      return;
    }
    fetchWeather(lat, lng, isoDate).then((data) => {
      cache.set(k, data);
      setResult(data);
    });
  }, [lat, lng, isoDate]);

  return result;
}

export interface WeatherMapItem {
  key:  string;
  lat:  number;
  lng:  number;
  date: string;
}

/**
 * Fetches weather for a variable-length list of locations.
 * Safe to call with an empty array — returns {} immediately.
 * Uses the same module-level cache as useWeather.
 */
export function useWeatherMap(
  items: WeatherMapItem[],
): Record<string, WeatherData | null> {
  const [results, setResults] = useState<Record<string, WeatherData | null>>(() => {
    const init: Record<string, WeatherData | null> = {};
    for (const item of items) {
      const k = cacheKey(item.lat, item.lng, item.date);
      if (cache.has(k)) init[item.key] = cache.get(k) ?? null;
    }
    return init;
  });

  // Serialize into a stable string so useEffect only fires when items truly change
  const depsKey = items
    .map((i) => `${i.key}:${i.lat.toFixed(3)},${i.lng.toFixed(3)},${i.date}`)
    .join('|');

  useEffect(() => {
    if (items.length === 0) return;
    for (const item of items) {
      const k = cacheKey(item.lat, item.lng, item.date);
      if (cache.has(k)) {
        const cached = cache.get(k) ?? null;
        setResults((prev) => ({ ...prev, [item.key]: cached }));
        continue;
      }
      fetchWeather(item.lat, item.lng, item.date).then((data) => {
        cache.set(k, data);
        setResults((prev) => ({ ...prev, [item.key]: data }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  return results;
}
