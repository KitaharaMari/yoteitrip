import type { Trip } from '@/types';

/**
 * Builds a URL for the server-side /api/staticmap proxy.
 * The API key is NEVER included here — the proxy adds it server-side.
 * This prevents the key from appearing in the browser DOM or DevTools.
 */
export function buildStaticMapUrl(trip: Trip): string | null {
  const placed = trip.days
    .flatMap((d) => d.activities)
    .filter((a) => !a.isBackup && a.place?.lat != null && a.place?.lng != null);

  if (placed.length === 0) return null;

  const params = new URLSearchParams();

  placed.forEach((a, i) => {
    const label = String(i + 1).slice(-1);
    params.append('m', `label:${label}|${a.place!.lat},${a.place!.lng}`);
  });

  placed.forEach((a) => {
    if (a.commutePolyline) {
      params.append('p', a.commutePolyline);
    }
  });

  return `/api/staticmap?${params.toString()}`;
}
