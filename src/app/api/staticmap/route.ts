import { NextRequest, NextResponse } from 'next/server';

// Static Maps images are loaded via <img> tags, which do NOT reliably send
// Referer headers — meaning domain restrictions on the client key are bypassed.
// This server-side proxy keeps the API key completely hidden from the browser.

const MAP_SIZE  = '800x450';   // 16:9 for aspect-video containers
const MAP_SCALE = '2';         // Retina / HDPI

// Validate a marker string — only allow lat/lng coordinates (no injection).
function isValidMarker(m: string): boolean {
  return /^(label:[A-Za-z0-9]\|)?-?\d{1,3}\.?\d{0,8},-?\d{1,3}\.?\d{0,8}$/.test(m.split('|').pop() ?? '');
}

// ── Polyline codec (RFC-compliant, no external deps) ─────────────────────────
function decodePoly(enc: string): [number, number][] {
  const pts: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < enc.length) {
    let r = 0, s = 0, b: number;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    r = s = 0;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function encodePoly(pts: [number, number][]): string {
  let out = '', plat = 0, plng = 0;
  for (const [lat, lng] of pts) {
    const dlat = Math.round(lat * 1e5) - Math.round(plat * 1e5);
    const dlng = Math.round(lng * 1e5) - Math.round(plng * 1e5);
    plat = lat; plng = lng;
    for (const d of [dlat, dlng]) {
      let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 32) { out += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; }
      out += String.fromCharCode(v + 63);
    }
  }
  return out;
}

// Ramer-Douglas-Peucker simplification (in degree units — ~0.00001° ≈ 1m)
function ptLineDist([x, y]: [number, number], [x1, y1]: [number, number], [x2, y2]: [number, number]): number {
  const dx = x2 - x1, dy = y2 - y1;
  if (!dx && !dy) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const [p1, p2] = [pts[0], pts[pts.length - 1]];
  let mx = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], p1, p2);
    if (d > mx) { mx = d; mi = i; }
  }
  if (mx > eps) {
    return [...rdp(pts.slice(0, mi + 1), eps).slice(0, -1), ...rdp(pts.slice(mi), eps)];
  }
  return [p1, p2];
}

/**
 * Decode → simplify → re-encode a polyline so it has at most `maxPts` vertices.
 * Adaptive tolerance: doubles until the point count is under the limit.
 */
function simplifyPoly(enc: string, maxPts = 100): string {
  let pts = decodePoly(enc);
  if (pts.length <= maxPts) return enc;
  let eps = 0.00005;  // ~5m initial tolerance
  while (pts.length > maxPts && eps < 0.1) {
    pts = rdp(decodePoly(enc), eps);
    eps *= 2;
  }
  return encodePoly(pts);
}

export async function GET(req: NextRequest) {
  const key = process.env.SERVER_GOOGLE_MAPS_API_KEY
    ?? process.env.TRANSIT_API_KEY
    ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!key) {
    return new NextResponse('Map API key not configured', { status: 500 });
  }

  const sp = req.nextUrl.searchParams;

  // Validate map type — only allow known values
  const rawType = sp.get('t') ?? 'hybrid';
  const maptype = ['roadmap', 'satellite', 'terrain', 'hybrid'].includes(rawType)
    ? rawType
    : 'hybrid';

  const parts: string[] = [
    `size=${MAP_SIZE}`,
    `scale=${MAP_SCALE}`,
    `maptype=${maptype}`,
  ];

  // Markers — first and last get a distinct style; intermediates are small dots
  const rawMarkers = sp.getAll('m').filter(isValidMarker);
  rawMarkers.forEach((m, idx) => {
    if (rawMarkers.length === 1) {
      parts.push(`markers=size:mid|color:0x47BB8E|${m}`);
    } else if (idx === 0) {
      // Start: green mid marker
      parts.push(`markers=size:mid|color:0x47BB8E|label:S|${m}`);
    } else if (idx === rawMarkers.length - 1) {
      // End: red mid marker
      parts.push(`markers=size:mid|color:red|label:E|${m}`);
    } else {
      // Intermediate: small white dot
      parts.push(`markers=size:small|color:white|${m}`);
    }
  });

  // Paths — simplify to keep URL short, render as blue route line
  for (const poly of sp.getAll('p')) {
    const simplified = simplifyPoly(poly, 100);
    parts.push(`path=color:0x0077ffff|weight:5|enc:${encodeURIComponent(simplified)}`);
  }

  parts.push(`key=${key}`);
  const googleUrl = `https://maps.googleapis.com/maps/api/staticmap?${parts.join('&')}`;

  try {
    const res = await fetch(googleUrl, { cache: 'default' });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: {
        'Content-Type':  res.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('[StaticMap proxy]', err);
    return new NextResponse('Map fetch failed', { status: 502 });
  }
}
