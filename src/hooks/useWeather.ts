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
