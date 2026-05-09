'use client';

import type { Activity, PlaceDetails } from '@/types';
import { haversineKm } from '@/lib/haversine';
import { useWeather } from '@/hooks/useWeather';
import {
  clothingAdvice, BAD_CODES, RAIN_CODES, SNOW_CODES,
  type WeatherData,
} from '@/lib/weather';

interface Props {
  date:        string;
  originPlace: PlaceDetails;
  activities:  Activity[];
}

// ── Weather difference alerts ─────────────────────────────────────────────────
function buildAlerts(origin: WeatherData, dest: WeatherData, destName: string): string[] {
  const alerts: string[] = [];
  const originBad = BAD_CODES.has(origin.weatherCode);
  const destRain  = RAIN_CODES.has(dest.weatherCode);
  const destSnow  = SNOW_CODES.has(dest.weatherCode);
  const diff      = dest.tempMax - origin.tempMax;

  if (!originBad && destRain)
    alerts.push(`${destName} 有${dest.emoji}${dest.description}，出发时记得带伞`);
  if (!originBad && destSnow)
    alerts.push(`${destName} ${dest.emoji}${dest.description}，备好保暖衣物和防滑鞋`);
  if (diff <= -8)
    alerts.push(`${destName} 比出发地冷 ${Math.abs(Math.round(diff))}°C，多带一件外套`);
  if (diff >= 8)
    alerts.push(`${destName} 比出发地高 ${Math.round(diff)}°C，可换轻薄衣物`);
  return alerts;
}

// ── Single location weather cell ──────────────────────────────────────────────
function WeatherCell({ w, label }: { w: WeatherData; label?: string }) {
  return (
    <div className="flex items-center gap-2 flex-none">
      <span className="text-2xl leading-none">{w.emoji}</span>
      <div>
        {label && (
          <p className="text-[9px] text-sky-400/80 truncate max-w-[72px] leading-none mb-0.5">
            {label}
          </p>
        )}
        <p className="text-xs font-semibold text-sky-900 tabular-nums leading-none">
          {w.tempMin}~{w.tempMax}°C
        </p>
        <p className="text-[10px] text-sky-500 leading-none mt-0.5">{w.description}</p>
      </div>
    </div>
  );
}

// ── DayWeatherBar ─────────────────────────────────────────────────────────────
export function DayWeatherBar({ date, originPlace, activities }: Props) {
  const primaryActivities = activities.filter((a) => !a.isBackup);
  const originLat = originPlace.lat;
  const originLng = originPlace.lng;

  // Straight-line distance to the furthest placed activity
  const furthestKm = primaryActivities.reduce((max, a) => {
    if (a.place?.lat == null || a.place?.lng == null || originLat == null || originLng == null)
      return max;
    return Math.max(max, haversineKm(originLat, originLng, a.place.lat, a.place.lng));
  }, 0);

  // Driving distance from persisted commute values
  const totalDrivingKm =
    primaryActivities.reduce((s, a) => s + (a.commuteDrivingMeters ?? 0), 0) / 1000;

  const longDistance = furthestKm >= 200 || totalDrivingKm >= 200;

  // Last placed activity = rough day destination
  const lastPlaced = [...primaryActivities]
    .reverse()
    .find((a) => a.place?.lat != null && a.place?.lng != null);
  const destPlace = longDistance ? lastPlaced?.place : undefined;

  // ── Always call hooks unconditionally ──
  const originWeather = useWeather(originLat, originLng, date);
  const destWeather   = useWeather(
    destPlace?.lat,
    destPlace?.lng,
    longDistance ? date : undefined,
  );

  // Guard: need coords (all hooks already called above)
  if (originLat == null || originLng == null) return null;

  if (originWeather === 'loading') {
    return (
      <div className="mb-1.5 px-4 py-2.5 rounded-2xl bg-sky-50 text-[11px] text-sky-300 animate-pulse">
        天气加载中…
      </div>
    );
  }

  if (!originWeather) return null;

  const hasDestWeather = longDistance && destWeather !== 'loading' && destWeather !== null;
  const alerts = hasDestWeather && destWeather
    ? buildAlerts(originWeather, destWeather as WeatherData, destPlace?.name ?? '目的地')
    : [];

  return (
    <div className="mb-1.5 flex flex-col gap-1">

      {/* ── Main row ── */}
      <div className="px-3.5 py-2.5 rounded-2xl bg-sky-50 flex items-center gap-3">

        {/* Origin weather */}
        <WeatherCell
          w={originWeather}
          label={longDistance ? originPlace.name : undefined}
        />

        {/* Arrow + destination */}
        {hasDestWeather && destWeather && (
          <>
            <span className="text-sky-300 text-xs flex-none">›</span>
            <WeatherCell
              w={destWeather as WeatherData}
              label={destPlace?.name ?? '目的地'}
            />
          </>
        )}

        {/* Clothing advice */}
        <p className="ml-auto text-[10px] text-sky-600 text-right leading-snug max-w-[110px]">
          {clothingAdvice(originWeather.tempMax, originWeather.weatherCode)}
        </p>
      </div>

      {/* ── Alerts ── */}
      {alerts.map((msg, i) => (
        <div
          key={i}
          className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-1.5 text-[11px] text-amber-700"
        >
          <span className="flex-none mt-px">⚠️</span>
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}
