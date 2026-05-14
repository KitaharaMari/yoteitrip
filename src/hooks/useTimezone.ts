'use client';

import { useState, useEffect } from 'react';

export interface TzInfo {
  timeZoneId:  string;
  offsetHours: number;
}

const cache = new Map<string, TzInfo | null>();

function cacheKey(lat: number, lng: number) {
  // 0.1° precision (~11 km) is enough to share a timezone
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function useTimezone(
  lat: number | undefined,
  lng: number | undefined,
): TzInfo | null | 'loading' {
  const [result, setResult] = useState<TzInfo | null | 'loading'>(() => {
    if (lat == null || lng == null) return null;
    const k = cacheKey(lat, lng);
    return cache.has(k) ? (cache.get(k) ?? null) : 'loading';
  });

  useEffect(() => {
    if (lat == null || lng == null) { setResult(null); return; }
    const k = cacheKey(lat, lng);
    if (cache.has(k)) { setResult(cache.get(k) ?? null); return; }

    fetch(`/api/timezone?lat=${lat}&lng=${lng}`)
      .then((r) => r.json() as Promise<TzInfo | null>)
      .then((data) => { cache.set(k, data); setResult(data); })
      .catch(() => { cache.set(k, null); setResult(null); });
  }, [lat, lng]);

  return result;
}
