import { NextRequest, NextResponse } from 'next/server';

// Static Maps images are loaded via <img> tags, which do NOT reliably send
// Referer headers — meaning domain restrictions on the client key are bypassed.
// This server-side proxy keeps the API key completely hidden from the browser.

const MAP_SIZE  = '800x400';
const MAP_SCALE = '2';

// Validate a marker string like "label:1|35.6762,139.6503" — only allow
// lat/lng coordinates, no arbitrary URLs or injection.
function isValidMarker(m: string): boolean {
  return /^(label:[A-Za-z0-9]\|)?-?\d{1,3}\.?\d{0,8},-?\d{1,3}\.?\d{0,8}$/.test(m.split('|').pop() ?? '');
}

export async function GET(req: NextRequest) {
  const key = process.env.SERVER_GOOGLE_MAPS_API_KEY
    ?? process.env.TRANSIT_API_KEY  // legacy fallback name
    ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!key) {
    return new NextResponse('Map API key not configured', { status: 500 });
  }

  const sp = req.nextUrl.searchParams;

  const parts: string[] = [
    `size=${MAP_SIZE}`,
    `scale=${MAP_SCALE}`,
    `style=feature:poi|visibility:off`,
    `style=feature:transit.station|visibility:off`,
    `style=feature:road.arterial|element:labels|visibility:off`,
    `style=feature:road.local|element:labels|visibility:off`,
    `style=feature:water|element:geometry|color:0xbfdbfe`,
    `style=feature:landscape|element:geometry|color:0xf1f5f9`,
  ];

  // Whitelist: only accept markers (m) and encoded polylines (p)
  for (const raw of sp.getAll('m')) {
    if (isValidMarker(raw)) {
      parts.push(`markers=size:small|color:0x47BB8E|${raw}`);
    }
  }
  for (const poly of sp.getAll('p')) {
    // Encoded polyline — just pass through, it's opaque binary-safe data
    parts.push(`path=color:0x3D556880|weight:4|enc:${encodeURIComponent(poly)}`);
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
