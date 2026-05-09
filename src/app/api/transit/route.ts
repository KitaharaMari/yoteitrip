import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Get real UTC time from Google's Date header (corrects system clock skew). */
async function getRealTimeMs(): Promise<number> {
  try {
    const r = await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-store' });
    const d = r.headers.get('date');
    if (d) {
      const t = new Date(d).getTime();
      if (!isNaN(t)) return t;
    }
  } catch { /* fall through */ }
  return Date.now();
}

/**
 * Returns a Unix timestamp (seconds) for the next 09:00 JST.
 * Shinkansen runs 06:00–23:00 JST; 09:00 is safely mid-morning.
 * Uses real server time to avoid system clock issues.
 */
async function safeTransitTs(): Promise<number> {
  const nowMs = await getRealTimeMs();
  const jstHour = Math.floor((nowMs / 3_600_000 + 9) % 24); // current JST hour
  const hoursUntil9 = ((9 - jstHour + 24) % 24) || 24;      // hours until next 09:00 JST
  return Math.floor((nowMs + hoursUntil9 * 3_600_000) / 1000);
}

export async function GET(req: NextRequest) {
  const sp     = req.nextUrl.searchParams;
  const origin = sp.get('origin');
  const dest   = sp.get('destination');
  // Use server-only key — never falls back to NEXT_PUBLIC_ (which is browser-visible).
  // Set SERVER_GOOGLE_MAPS_API_KEY (or TRANSIT_API_KEY) in .env.local / Firebase Secret Manager.
  const key = process.env.SERVER_GOOGLE_MAPS_API_KEY ?? process.env.TRANSIT_API_KEY;

  if (!origin || !dest || !key) {
    return NextResponse.json({ status: 'INVALID_REQUEST' });
  }

  const clientDeptTs = sp.get('departureTime');
  const rawTs        = clientDeptTs ? parseInt(clientDeptTs, 10) : await safeTransitTs();

  // Google transit APIs require a future departure_time.
  // If the client sent a past timestamp (e.g. planned activity time already passed today),
  // advance by multiples of 7 days to keep the same weekday/time-of-day pattern.
  const nowTs  = Math.floor(Date.now() / 1000);
  let departureTs = rawTs;
  if (departureTs <= nowTs) {
    const secsPerWeek = 7 * 24 * 3600;
    const weeksNeeded = Math.ceil((nowTs - departureTs) / secsPerWeek) || 1;
    departureTs += weeksNeeded * secsPerWeek;
  }

  console.info('[Transit] departure_time =', departureTs, new Date(departureTs * 1000).toISOString());

  // Parse lat,lng string → number pair
  const toLatLng = (s: string) => {
    const [lat, lng] = s.split(',').map(Number);
    return isNaN(lat) || isNaN(lng) ? null : { latitude: lat, longitude: lng };
  };
  const originLL = toLatLng(origin);
  const destLL   = toLatLng(dest);

  // ── Routes API v2 (POST) ─────────────────────────────────────────────────
  if (originLL && destLL) {
    const body = {
      origin:      { location: { latLng: originLL } },
      destination: { location: { latLng: destLL   } },
      travelMode:  'TRANSIT',
      departureTime: new Date(departureTs * 1000).toISOString(),
      computeAlternativeRoutes: false,
    };
    try {
      const res  = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type':     'application/json',
          'X-Goog-Api-Key':   key,
          'X-Goog-FieldMask': [
            'routes.duration',
            'routes.distanceMeters',
            'routes.polyline.encodedPolyline',
            'routes.legs.duration',
            'routes.legs.distanceMeters',
            'routes.legs.steps.staticDuration',
            'routes.legs.steps.travelMode',
            'routes.legs.steps.transitDetails',
            'routes.travelAdvisory',
          ].join(','),
        },
        body:  JSON.stringify(body),
        cache: 'no-store',
      });
      const data = await res.json();
      console.info('[Transit/RoutesAPI]', res.status, '| routes:', data.routes?.length ?? 0);
      if (data.routes?.length) {
        return NextResponse.json({ _apiVersion: 'routes', ...data });
      }
    } catch (err) {
      console.warn('[Transit/RoutesAPI] error', err);
    }
  }

  // ── Directions API fallback (GET) ────────────────────────────────────────
  const encodeParam = (s: string) =>
    encodeURIComponent(s).replace(/%2C/gi, ',').replace(/%3A/gi, ':');

  const params = [
    `origin=${encodeParam(origin)}`,
    `destination=${encodeParam(dest)}`,
    `mode=transit`,
    `departure_time=${departureTs}`,
    `key=${key}`,
  ].join('&');

  const apiUrl = `https://maps.googleapis.com/maps/api/directions/json?${params}`;
  console.info('[Transit/DirectionsAPI] →', apiUrl.replace(key, 'KEY'));

  try {
    const res  = await fetch(apiUrl, { cache: 'no-store' });
    const data = await res.json();
    console.info('[Transit/DirectionsAPI]', data.status, '| routes:', data.routes?.length ?? 0);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Transit/DirectionsAPI] error', err);
    return NextResponse.json({ status: 'SERVER_ERROR' });
  }
}
