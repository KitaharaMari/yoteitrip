import { useState, useEffect } from 'react';
import type { PlaceDetails } from '@/types';

// Session cache — keyed by "placeId1:placeId2" for stability.
const cache = new Map<string, number>();

/**
 * Calls the Distance Matrix JS SDK using LatLng coordinates (not placeId objects).
 * The JS SDK's getDistanceMatrix() does NOT support { placeId } as
 * origins/destinations — it throws "not a LatLng or LatLngLiteral".
 * LatLng coords from place.geometry.location are the reliable alternative.
 */
export function useCommuteTime(
  from:       PlaceDetails | undefined,
  to:         PlaceDetails | undefined,
  mapsLoaded: boolean = false,
): number | null {
  const hasCoords =
    from?.lat != null && from?.lng != null &&
    to?.lat   != null && to?.lng   != null;

  const cacheKey =
    from?.placeId && to?.placeId ? `${from.placeId}:${to.placeId}` : null;

  const [minutes, setMinutes] = useState<number | null>(() => {
    if (!cacheKey) return null;
    return cache.get(cacheKey) ?? null;
  });

  // Stable primitive deps — avoids re-firing when object references change
  const fromLat = from?.lat;
  const fromLng = from?.lng;
  const toLat   = to?.lat;
  const toLng   = to?.lng;
  const fromId  = from?.placeId;
  const toId    = to?.placeId;

  useEffect(() => {
    if (!hasCoords) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMinutes(null);
      return;
    }

    // Cache hit
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit !== undefined) { setMinutes(hit); return; }
    }

    if (!mapsLoaded || typeof google === 'undefined' || !google.maps?.DistanceMatrixService) return;

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        // Use LatLngLiteral — the only form the JS SDK reliably accepts
        origins:      [{ lat: fromLat!, lng: fromLng! }],
        destinations: [{ lat: toLat!,   lng: toLng!   }],
        travelMode:   google.maps.TravelMode.DRIVING,
        unitSystem:   google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        if (status !== 'OK' || !response) {
          console.warn('[Distance Matrix]', status);
          return;
        }
        const seconds = response.rows[0]?.elements[0]?.duration?.value;
        if (seconds !== undefined) {
          const mins = Math.ceil(seconds / 60);
          if (cacheKey) cache.set(cacheKey, mins);
          setMinutes(mins);
        }
      }
    );
  }, [fromLat, fromLng, toLat, toLng, fromId, toId, hasCoords, cacheKey, mapsLoaded]);

  return minutes;
}
