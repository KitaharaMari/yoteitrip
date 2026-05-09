import { useState, useEffect } from 'react';
import type { PlaceDetails } from '@/types';

export type TravelMode = 'TRANSIT' | 'DRIVING' | 'WALKING';

export interface TransitStep {
  mode: 'WALKING' | 'TRANSIT';
  duration: string;
  distance?: string;
  lineName?: string;
  lineShort?: string;
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  numStops?: number;
}

export interface RouteResult {
  totalMinutes: number;
  totalText: string;
  steps: TransitStep[];
  fareText?: string;
  totalMeters?: number;        // driving distance in metres (only set when usedMode=DRIVING)
  overviewPolyline?: string;   // encoded polyline string for Static Maps rendering
  mapsUrl: string;
  usedMode: TravelMode;
}

const cache = new Map<string, RouteResult>();

export function parseFare(fareText?: string): number | undefined {
  if (!fareText) return undefined;
  const num = parseFloat(fareText.replace(/[^\d.]/g, ''));
  return isNaN(num) ? undefined : num;
}

// ── Directions REST API types ─────────────────────────────────────────────────
interface RestDuration { text: string; value: number; }
interface RestStep {
  travel_mode: string;
  duration: RestDuration;
  distance?: RestDuration;
  transit_details?: {
    line?: { name?: string; short_name?: string; vehicle?: { type?: string } };
    departure_stop?: { name?: string };
    arrival_stop?:   { name?: string };
    num_stops?: number;
  };
}
interface RestRoute {
  legs: { duration: RestDuration; distance?: RestDuration; steps: RestStep[] }[];
  fare?: { text: string };
  overview_polyline?: { points?: string };
}
interface RestResponse { status: string; routes?: RestRoute[]; error_message?: string; }

// ── Routes API v2 types ───────────────────────────────────────────────────────
interface RoutesV2Step {
  travelMode?: string;
  staticDuration?: string;          // e.g. "600s"
  transitDetails?: {
    transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string } };
    stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
    stopCount?: number;
  };
}
interface RoutesV2Route {
  duration?: string;                // e.g. "7200s"
  distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
  legs?: { duration?: string; distanceMeters?: number; steps?: RoutesV2Step[] }[];
  travelAdvisory?: { transitFare?: { currencyCode?: string; units?: string } };
}
interface RoutesV2Response { _apiVersion: 'routes'; routes?: RoutesV2Route[] }

// ── Parse REST API response → RouteResult ────────────────────────────────────
function parseRestRoute(
  route: RestRoute,
  fromId: string | undefined, toId: string | undefined,
  fromLat: number, fromLng: number, toLat: number, toLng: number,
): RouteResult {
  const leg      = route.legs[0];
  const totalMin = Math.ceil(leg.duration.value / 60);
  const steps: TransitStep[] = leg.steps.map(step => {
    if (step.travel_mode === 'WALKING') {
      return { mode: 'WALKING', duration: step.duration.text, distance: step.distance?.text };
    }
    const td = step.transit_details;
    return {
      mode:          'TRANSIT',
      duration:      step.duration.text,
      distance:      step.distance?.text,
      lineName:      td?.line?.name,
      lineShort:     td?.line?.short_name,
      vehicleType:   td?.line?.vehicle?.type,
      departureStop: td?.departure_stop?.name,
      arrivalStop:   td?.arrival_stop?.name,
      numStops:      td?.num_stops,
    };
  });
  const mapsUrl = fromId && toId
    ? `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&origin_place_id=${fromId}&destination_place_id=${toId}&travelmode=transit`
    : `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=transit`;
  return { totalMinutes: totalMin, totalText: leg.duration.text, steps, fareText: route.fare?.text, totalMeters: leg.distance?.value, overviewPolyline: route.overview_polyline?.points, mapsUrl, usedMode: 'TRANSIT' };
}

// ── Routes API v2 parser ──────────────────────────────────────────────────────
function parseRoutesV2(
  route: RoutesV2Route,
  fromId: string | undefined, toId: string | undefined,
  fromLat: number, fromLng: number, toLat: number, toLng: number,
): RouteResult {
  const parseSec = (s?: string) => s ? parseInt(s) : 0;
  const secToMin = (s?: string) => Math.ceil(parseSec(s) / 60);
  const secToText = (s?: string) => {
    const m = secToMin(s);
    return m >= 60 ? `${Math.floor(m/60)}小时${m%60 ? m%60+'分钟' : ''}` : `${m}分钟`;
  };

  const totalMin = secToMin(route.duration);
  const steps: TransitStep[] = (route.legs?.[0]?.steps ?? []).map(step => {
    const mode = step.travelMode === 'WALK' || step.travelMode === 'WALKING' ? 'WALKING' : 'TRANSIT';
    if (mode === 'WALKING') {
      return { mode: 'WALKING', duration: secToText(step.staticDuration) };
    }
    const td = step.transitDetails;
    return {
      mode:          'TRANSIT',
      duration:      secToText(step.staticDuration),
      lineName:      td?.transitLine?.name,
      lineShort:     td?.transitLine?.nameShort,
      vehicleType:   td?.transitLine?.vehicle?.type,
      departureStop: td?.stopDetails?.departureStop?.name,
      arrivalStop:   td?.stopDetails?.arrivalStop?.name,
      numStops:      td?.stopCount,
    };
  });

  const fare = route.travelAdvisory?.transitFare;
  const fareText = fare ? `${fare.currencyCode} ${fare.units}` : undefined;
  const mapsUrl = fromId && toId
    ? `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&origin_place_id=${fromId}&destination_place_id=${toId}&travelmode=transit`
    : `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=transit`;

  const totalMeters      = route.distanceMeters ?? route.legs?.[0]?.distanceMeters;
  const overviewPolyline = route.polyline?.encodedPolyline;
  return { totalMinutes: totalMin, totalText: secToText(route.duration), steps, fareText, totalMeters, overviewPolyline, mapsUrl, usedMode: 'TRANSIT' };
}

// ── Server-side proxy call → bypasses CORS ───────────────────────────────────
async function fetchServerTransit(
  origin: string, destination: string,
  departureTime?: Date,
): Promise<RestResponse | RoutesV2Response> {
  const params = new URLSearchParams({ origin, destination });
  if (departureTime) {
    params.set('departureTime', String(Math.floor(departureTime.getTime() / 1000)));
  }
  const res = await fetch(`/api/transit?${params}`);
  return res.json();
}

// ── JS SDK DRIVING fallback ───────────────────────────────────────────────────
function buildStepsFromSDK(leg: google.maps.DirectionsLeg): TransitStep[] {
  const steps: TransitStep[] = [];
  for (const step of leg.steps) {
    if (step.travel_mode === google.maps.TravelMode.WALKING) {
      steps.push({ mode: 'WALKING', duration: step.duration?.text ?? '', distance: step.distance?.text });
    } else if (step.travel_mode === google.maps.TravelMode.TRANSIT && step.transit) {
      const t = step.transit;
      steps.push({
        mode: 'TRANSIT', duration: step.duration?.text ?? '', distance: step.distance?.text,
        lineName: t.line?.name, lineShort: t.line?.short_name, vehicleType: t.line?.vehicle?.type,
        departureStop: t.departure_stop?.name, arrivalStop: t.arrival_stop?.name, numStops: t.num_stops,
      });
    }
  }
  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useTransitRoute(
  from:          PlaceDetails | undefined,
  to:            PlaceDetails | undefined,
  mode:          TravelMode,
  mapsLoaded:    boolean = false,
  departureTime: Date | undefined = undefined,
): RouteResult | null {
  // Stable numeric key so the effect re-runs only when the departure time changes,
  // not when the Date object reference changes (new Date each render).
  const deptTs  = departureTime?.getTime() ?? 0;

  const [result, setResult] = useState<RouteResult | null>(() => {
    if (!from?.placeId || !to?.placeId) return null;
    return cache.get(`${mode}:${from.placeId}:${to.placeId}`) ?? null;
  });

  const fromLat  = from?.lat;  const fromLng  = from?.lng;
  const toLat    = to?.lat;    const toLng    = to?.lng;
  const fromId   = from?.placeId;
  const toId     = to?.placeId;
  const fromAddr = from?.address;
  const toAddr   = to?.address;

  useEffect(() => {
    // Reconstruct Date from the stable timestamp so `departureTime` (a new Date each render)
    // is not needed in the deps array — only the numeric `deptTs` is.
    const dept = deptTs > 0 ? new Date(deptTs) : undefined;

    const hasCoords = fromLat != null && fromLng != null && toLat != null && toLng != null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasCoords) { setResult(null); return; }

    // Skip cache when a specific departure time is provided — results vary by hour.
    const cacheKey = (fromId && toId && deptTs === 0) ? `${mode}:${fromId}:${toId}` : null;
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit) { setResult(hit); return; }
    }

    // Clear stale result from a previous mode so didFallback doesn't re-fire immediately
    setResult(null);

    let cancelled = false;

    const run = async () => {
      // ── WALKING: SDK only, no server proxy, no departure time ──────────────
      if (mode === 'WALKING') {
        if (!mapsLoaded || typeof google === 'undefined' || !google.maps?.DirectionsService) return;
        const service     = new google.maps.DirectionsService();
        const origin      = fromId ? { placeId: fromId } : { lat: fromLat!, lng: fromLng! };
        const destination = toId   ? { placeId: toId }   : { lat: toLat!,   lng: toLng!   };
        service.route(
          { origin, destination, travelMode: google.maps.TravelMode.WALKING },
          (response, status) => {
            if (cancelled) return;
            if (status !== google.maps.DirectionsStatus.OK || !response?.routes[0]?.legs[0]) return;
            const leg      = response.routes[0].legs[0];
            const totalMin = Math.ceil((leg.duration?.value ?? 0) / 60);
            const mapsUrl  = fromId && toId
              ? `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&origin_place_id=${fromId}&destination_place_id=${toId}&travelmode=walking`
              : `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=walking`;
            const r: RouteResult = {
              totalMinutes: totalMin, totalText: leg.duration?.text ?? `${totalMin}分钟`,
              steps: buildStepsFromSDK(leg), totalMeters: leg.distance?.value,
              mapsUrl, usedMode: 'WALKING',
            };
            if (cacheKey) cache.set(cacheKey, r);
            setResult(r);
          },
        );
        return;
      }

      // ── TRANSIT: try server-side proxy first ───────────────────────────────
      if (mode === 'TRANSIT') {
        // Build best origin/destination string for the REST API
        // Coordinates give more reliable transit results than place_id via REST API
        const originStr = (fromLat != null && fromLng != null)
          ? `${fromLat},${fromLng}`
          : fromAddr ?? (fromId ? `place_id:${fromId}` : '');
        const destStr = (toLat != null && toLng != null)
          ? `${toLat},${toLng}`
          : toAddr ?? (toId ? `place_id:${toId}` : '');

        console.info('[Transit/server] →', originStr, '→', destStr);
        try {
          const data = await fetchServerTransit(originStr, destStr, dept);
          if (cancelled) return;

          // Routes API v2 response
          if ('_apiVersion' in data && data._apiVersion === 'routes' && (data as RoutesV2Response).routes?.[0]) {
            console.info('[Transit/server] ← Routes API v2 OK');
            const r = parseRoutesV2((data as RoutesV2Response).routes![0], fromId, toId, fromLat!, fromLng!, toLat!, toLng!);
            if (cacheKey) cache.set(cacheKey, r);
            setResult(r);
            return;
          }

          // Directions REST API response
          const directionsData = data as RestResponse;
          console.info('[Transit/server] ←', directionsData.status, directionsData.error_message ?? '');
          if (directionsData.status === 'OK' && directionsData.routes?.[0]) {
            const r = parseRestRoute(directionsData.routes[0], fromId, toId, fromLat!, fromLng!, toLat!, toLng!);
            if (cacheKey) cache.set(cacheKey, r);
            setResult(r);
            return;
          }
          if (directionsData.status === 'REQUEST_DENIED') {
            console.error('[Transit/server] REQUEST_DENIED — enable Directions API:\n  https://console.cloud.google.com/apis/library/directions-backend.googleapis.com');
          }
          // Fall through to DRIVING via JS SDK
        } catch (err) {
          if (cancelled) return;
          console.warn('[Transit/server] fetch error', err);
        }
      }

      if (!mapsLoaded || typeof google === 'undefined' || !google.maps?.DirectionsService) return;

      const service     = new google.maps.DirectionsService();
      const origin      = fromId ? { placeId: fromId } : { lat: fromLat!, lng: fromLng! };
      const destination = toId   ? { placeId: toId }   : { lat: toLat!,   lng: toLng!   };

      // ── JS SDK TRANSIT → on failure, fall back to DRIVING inline ────────────
      if (mode === 'TRANSIT') {
        const effectiveDeparture = dept ?? (() => {
          const jstHour = Math.floor((Date.now() / 3_600_000 + 9) % 24);
          const hoursUntil9 = ((9 - jstHour + 24) % 24) || 24;
          return new Date(Date.now() + hoursUntil9 * 3_600_000);
        })();

        const fallbackDriving = () => {
          if (cancelled) return;
          service.route({
            origin, destination, travelMode: google.maps.TravelMode.DRIVING,
            ...(dept ? { drivingOptions: { departureTime: dept } } : {}),
          }, (res2, st2) => {
            if (cancelled) return;
            if (st2 !== google.maps.DirectionsStatus.OK || !res2?.routes[0]?.legs[0]) return;
            const leg2     = res2.routes[0].legs[0];
            const totalMin = Math.ceil((leg2.duration?.value ?? 0) / 60);
            const mapsUrl  = fromId && toId
              ? `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&origin_place_id=${fromId}&destination_place_id=${toId}&travelmode=driving`
              : `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving`;
            const r: RouteResult = {
              totalMinutes: totalMin, totalText: leg2.duration?.text ?? `${totalMin}分钟`,
              steps: buildStepsFromSDK(leg2), totalMeters: leg2.distance?.value,
              // SDK doesn't expose encoded overview_polyline — polyline omitted here
              mapsUrl, usedMode: 'DRIVING',
            };
            const drivingKey = fromId && toId ? `DRIVING:${fromId}:${toId}` : null;
            if (drivingKey) cache.set(drivingKey, r);
            setResult(r);
          });
        };

        console.info('[Directions/SDK] → TRANSIT', effectiveDeparture.toISOString());
        service.route(
          { origin, destination, travelMode: google.maps.TravelMode.TRANSIT,
            transitOptions: { departureTime: effectiveDeparture } },
          (response, status) => {
            if (cancelled) return;
            console.info('[Directions/SDK] ←', status, 'TRANSIT');
            if (status === google.maps.DirectionsStatus.OK && response?.routes[0]?.legs[0]) {
              const leg      = response.routes[0].legs[0];
              const totalMin = Math.ceil((leg.duration?.value ?? 0) / 60);
              const mapsUrl  = fromId && toId
                ? `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&origin_place_id=${fromId}&destination_place_id=${toId}&travelmode=transit`
                : `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=transit`;
              const r: RouteResult = {
                totalMinutes: totalMin, totalText: leg.duration?.text ?? `${totalMin}分钟`,
                steps: buildStepsFromSDK(leg),
                fareText: (response.routes[0] as google.maps.DirectionsRoute & { fare?: { text: string } }).fare?.text,
                totalMeters: leg.distance?.value,
                mapsUrl, usedMode: 'TRANSIT',
              };
              if (cacheKey) cache.set(cacheKey, r);
              setResult(r);
            } else {
              // Transit failed — fall back to driving so result is never null
              fallbackDriving();
            }
          },
        );
        return;
      }

      // ── JS SDK DRIVING ─────────────────────────────────────────────────────
      console.info('[Directions/SDK] → DRIVING');
      service.route({
        origin, destination, travelMode: google.maps.TravelMode.DRIVING,
        ...(dept ? { drivingOptions: { departureTime: dept } } : {}),
      }, (response, status) => {
        if (cancelled) return;
        console.info('[Directions/SDK] ←', status, 'DRIVING');
        if (status !== google.maps.DirectionsStatus.OK || !response?.routes[0]?.legs[0]) return;

        const leg      = response.routes[0].legs[0];
        const totalMin = Math.ceil((leg.duration?.value ?? 0) / 60);
        const mapsUrl  = fromId && toId
          ? `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&origin_place_id=${fromId}&destination_place_id=${toId}&travelmode=driving`
          : `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving`;

        const r: RouteResult = {
          totalMinutes: totalMin,
          totalText:    leg.duration?.text ?? `${totalMin}分钟`,
          steps:        buildStepsFromSDK(leg),
          totalMeters:  leg.distance?.value,
          mapsUrl,
          usedMode:     'DRIVING',
        };
        // Store under DRIVING key so retrying TRANSIT doesn't hit this fallback
        const drivingKey = fromId && toId ? `DRIVING:${fromId}:${toId}` : null;
        if (drivingKey) cache.set(drivingKey, r);
        setResult(r);
      });
    };

    run();
    return () => { cancelled = true; };
  }, [fromLat, fromLng, toLat, toLng, fromId, toId, fromAddr, toAddr, mode, mapsLoaded, deptTs]);

  return result;
}
