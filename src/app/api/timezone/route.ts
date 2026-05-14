import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(null, { status: 400 });
  }

  const key = process.env.SERVER_GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json(null, { status: 500 });

  const timestamp = Math.floor(Date.now() / 1000);
  const url =
    `https://maps.googleapis.com/maps/api/timezone/json` +
    `?location=${lat},${lng}&timestamp=${timestamp}&key=${key}`;

  try {
    const res  = await fetch(url, { next: { revalidate: 86400 } });
    const data = await res.json() as {
      status:    string;
      timeZoneId?:   string;
      rawOffset?:    number;
      dstOffset?:    number;
    };

    if (data.status !== 'OK') return NextResponse.json(null);

    const offsetSec   = (data.rawOffset ?? 0) + (data.dstOffset ?? 0);
    const offsetHours = offsetSec / 3600;

    return NextResponse.json(
      { timeZoneId: data.timeZoneId, offsetHours },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch {
    return NextResponse.json(null);
  }
}
