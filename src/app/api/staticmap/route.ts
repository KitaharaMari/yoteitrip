import { NextRequest, NextResponse } from 'next/server';

// Static Maps images are loaded via <img> tags, which do NOT reliably send
// Referer headers — meaning domain restrictions on the client key are bypassed.
// This server-side proxy keeps the API key completely hidden from the browser.

const MAP_SIZE  = '600x300';   // 2:1 ratio — balanced for both horizontal and vertical routes
const MAP_SCALE = '2';         // Retina / HDPI — fixes blurriness

// Validate a bare lat,lng coordinate string
function isValidCoord(s: string): boolean {
  return /^-?\d{1,3}\.?\d{0,8},-?\d{1,3}\.?\d{0,8}$/.test(s);
}

// Validate a marker param (may have label/color prefix before the coordinate)
function isValidMarker(m: string): boolean {
  return isValidCoord(m.split('|').pop() ?? '');
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

// Ramer–Douglas–Peucker (in degree units; 0.00001° ≈ 1m)
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
 * Decode → simplify (RDP) → re-encode so the polyline has at most maxPts vertices.
 * Adaptive tolerance: doubles until point count is under the limit.
 * maxPts=100 keeps route detail while limiting each encoded segment to ~500 chars;
 * the URL safety net at 7800 chars handles extreme cases with many segments.
 */
function simplifyPoly(enc: string, maxPts = 60): string {
  const raw = decodePoly(enc);
  if (raw.length <= maxPts) return enc;
  let eps = 0.00005;
  let pts = raw;
  while (pts.length > maxPts && eps < 0.1) {
    pts = rdp(raw, eps);
    eps *= 2;
  }
  return encodePoly(pts);
}

/**
 * Encode a polyline for the Static Maps `enc:` prefix.
 * Only | and \ conflict with Google's path option syntax — everything else
 * in the base-63 charset can be passed through raw.
 */
function safePolyEncode(enc: string): string {
  return enc.replace(/\|/g, '%7C').replace(/\\/g, '%5C');
}

export async function GET(req: NextRequest) {
  const key = process.env.SERVER_GOOGLE_MAPS_API_KEY
    ?? process.env.TRANSIT_API_KEY
    ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!key) {
    return new NextResponse('Map API key not configured', { status: 500 });
  }

  const sp = req.nextUrl.searchParams;

  // Validate map type
  const rawType = sp.get('t') ?? 'hybrid';
  const maptype = ['roadmap', 'satellite', 'terrain', 'hybrid'].includes(rawType)
    ? rawType
    : 'hybrid';

  const parts: string[] = [
    `size=${MAP_SIZE}`,
    `scale=${MAP_SCALE}`,
    `maptype=${maptype}`,
    // NO zoom= parameter: let Google auto-fit all markers + paths
  ];

  // ── Markers ────────────────────────────────────────────────────────────────
  const rawMarkers = sp.getAll('m').filter(isValidMarker);
  rawMarkers.forEach((m, idx) => {
    if (rawMarkers.length === 1) {
      parts.push(`markers=size:mid|color:0x47BB8E|${m}`);
    } else if (idx === 0) {
      parts.push(`markers=size:mid|color:0x47BB8E|label:S|${m}`);
    } else if (idx === rawMarkers.length - 1) {
      parts.push(`markers=size:mid|color:red|label:E|${m}`);
    } else {
      parts.push(`markers=size:small|color:white|${m}`);
    }
  });

  // ── Force viewport to include start & end (visible= parameter) ─────────────
  // Even without an explicit zoom, this ensures Google never crops the
  // origin or destination out of frame — critical for long-distance routes.
  if (rawMarkers.length >= 2) {
    const firstCoord = rawMarkers[0].split('|').pop() ?? rawMarkers[0];
    const lastCoord  = rawMarkers[rawMarkers.length - 1].split('|').pop() ?? rawMarkers[rawMarkers.length - 1];
    if (isValidCoord(firstCoord) && isValidCoord(lastCoord) && firstCoord !== lastCoord) {
      // Two separate visible= params (cleaner than pipe-joining for lat,lng values)
      parts.push(`visible=${firstCoord}`);
      parts.push(`visible=${lastCoord}`);
    }
  }

  // ── Encoded polyline paths ─────────────────────────────────────────────────
  const rawPolylines = sp.getAll('p');
  for (const poly of rawPolylines) {
    // Simplify to ≤100 points — less aggressive than 60, still safe for long routes
    const simplified = simplifyPoly(poly, 100);
    parts.push(`path=color:0x4285F4ff|weight:5|enc:${safePolyEncode(simplified)}`);
  }

  // ── Straight-line fallback (no polylines available) ────────────────────────
  if (rawPolylines.length === 0 && rawMarkers.length >= 2) {
    const coords = rawMarkers.map(m => m.split('|').pop() ?? m).filter(isValidCoord);
    if (coords.length >= 2) {
      parts.push(`path=color:0x4285F4aa|weight:4|${coords.join('|')}`);
    }
  }

  parts.push(`key=${key}`);
  let googleUrl = `https://maps.googleapis.com/maps/api/staticmap?${parts.join('&')}`;

  // ── URL safety net: if still too long, drop polylines and use straight line ─
  // Google Static Maps enforces an ~8192-char URL limit. Exceeding it returns
  // a 400 error or silently drops trailing parameters (losing the endpoint).
  const URL_LIMIT = 7800;
  if (googleUrl.length > URL_LIMIT) {
    console.warn(`[StaticMap] URL too long (${googleUrl.length} chars) — falling back to straight-line`);
    const safeBase = parts.filter(p => !p.startsWith('path='));
    const coords   = rawMarkers.map(m => m.split('|').pop() ?? m).filter(isValidCoord);
    if (coords.length >= 2) {
      safeBase.splice(safeBase.length - 1, 0, `path=color:0x4285F4aa|weight:4|${coords.join('|')}`);
    }
    googleUrl = `https://maps.googleapis.com/maps/api/staticmap?${safeBase.join('&')}`;
  }

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
