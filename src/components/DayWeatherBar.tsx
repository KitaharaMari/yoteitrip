'use client';

import type { Activity, PlaceDetails } from '@/types';
import { haversineKm } from '@/lib/haversine';
import { useWeather, useWeatherMap, type WeatherMapItem } from '@/hooks/useWeather';
import { useT } from '@/hooks/useT';
import {
  clothingAdvice, wmoDescT,
  BAD_CODES, RAIN_CODES, SNOW_CODES,
  TEMP_HOT, TEMP_WARM, TEMP_MILD, UNIFORM_SPREAD,
  type WeatherData,
} from '@/lib/weather';

interface Props {
  date:        string;
  originPlace: PlaceDetails;
  activities:  Activity[];
}

type TFunc = (key: string, params?: Record<string, string | number>) => string;

// ── Long-distance destination alerts ─────────────────────────────────────────
// Rules use BOTH relative diff AND absolute temperature to avoid nonsense like
// "watch the heat" at 14°C.
function buildDestAlerts(origin: WeatherData, dest: WeatherData, destName: string, t: TFunc): string[] {
  const alerts: string[] = [];
  const originBad = BAD_CODES.has(origin.weatherCode);
  const destRain  = RAIN_CODES.has(dest.weatherCode);
  const destSnow  = SNOW_CODES.has(dest.weatherCode);
  const diff      = dest.tempMax - origin.tempMax;

  // Precipitation (absolute condition — always relevant)
  if (!originBad && destRain)
    alerts.push(t('weather.alertDestRain', { dest: destName, desc: `${dest.emoji} ${wmoDescT(dest.weatherCode, t)}` }));
  if (!originBad && destSnow)
    alerts.push(t('weather.alertDestSnow', { dest: destName, desc: `${dest.emoji} ${wmoDescT(dest.weatherCode, t)}` }));

  // Cold alert: relative AND absolute (stop must actually be cold, not just "cooler")
  if (diff <= -8 && dest.tempMax < TEMP_MILD)
    alerts.push(t('weather.alertDestColder', { dest: destName, n: Math.abs(Math.round(diff)) }));

  // Warm/hot alerts: relative AND absolute
  // Only "watch the heat" when destination is genuinely hot (≥ TEMP_HOT)
  if (diff >= 8 && dest.tempMax >= TEMP_HOT)
    alerts.push(t('weather.alertDestWarmer', { dest: destName, n: Math.round(diff) }));
  // Neutral "lighter clothes" nudge for warm-but-not-hot destinations
  else if (diff >= 8 && dest.tempMax >= TEMP_WARM)
    alerts.push(t('weather.alertDestMilder', { dest: destName }));

  return alerts;
}

// ── Intermediate stop alert ───────────────────────────────────────────────────
// Same dual-check: relative diff + absolute temperature guards.
function buildStopAlert(origin: WeatherData, stop: WeatherData, stopName: string, t: TFunc): string | null {
  const originBad = BAD_CODES.has(origin.weatherCode);
  const stopRain  = RAIN_CODES.has(stop.weatherCode);
  const stopSnow  = SNOW_CODES.has(stop.weatherCode);
  const diff      = stop.tempMax - origin.tempMax;

  // Precipitation (absolute condition)
  if (!originBad && stopSnow)
    return t('weather.alertStopSnow', { stop: stopName, desc: `${stop.emoji} ${wmoDescT(stop.weatherCode, t)}` });
  if (!originBad && stopRain)
    return t('weather.alertStopRain', { stop: stopName, desc: `${stop.emoji} ${wmoDescT(stop.weatherCode, t)}` });

  // Cold: relative diff AND absolute cold (<TEMP_MILD = 15°C)
  // Avoids "4°C colder" alerts when both stops are already mild
  if (diff <= -5 && stop.tempMax < TEMP_MILD)
    return t('weather.alertStopColder', { stop: stopName, n: Math.abs(Math.round(diff)) });

  // Hot: relative diff AND absolute hot (≥ TEMP_HOT = 25°C)
  // Fixes: "watch the heat" will NEVER appear at 14°C
  if (diff >= 5 && stop.tempMax >= TEMP_HOT)
    return t('weather.alertStopWarmer', { stop: stopName, n: Math.round(diff) });

  // Warm (not hot): lighter clothes nudge — only when stop is warm enough to matter
  if (diff >= 5 && stop.tempMax >= TEMP_WARM)
    return t('weather.alertStopMilder', { stop: stopName });

  // Below TEMP_WARM (20°C): even if relatively warmer, it's still cool — no alert
  return null;
}

// ── Single location weather cell ──────────────────────────────────────────────
function WeatherCell({ w, label, t }: { w: WeatherData; label?: string; t: TFunc }) {
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
        <p className="text-[10px] text-sky-500 leading-none mt-0.5">{wmoDescT(w.weatherCode, t)}</p>
      </div>
    </div>
  );
}

// ── DayWeatherBar ─────────────────────────────────────────────────────────────
export function DayWeatherBar({ date, originPlace, activities }: Props) {
  const t = useT();
  const primaryActivities = activities.filter((a) => !a.isBackup);
  const originLat = originPlace.lat;
  const originLng = originPlace.lng;

  // Straight-line distance to the furthest placed activity
  const furthestKm = primaryActivities.reduce((max, a) => {
    if (a.place?.lat == null || a.place?.lng == null || originLat == null || originLng == null)
      return max;
    return Math.max(max, haversineKm(originLat, originLng, a.place.lat, a.place.lng));
  }, 0);

  const totalDrivingKm =
    primaryActivities.reduce((s, a) => s + (a.commuteDrivingMeters ?? 0), 0) / 1000;

  const longDistance = furthestKm >= 200 || totalDrivingKm >= 200;

  // Last placed activity = rough day destination (used for long-distance only)
  const lastPlaced = [...primaryActivities]
    .reverse()
    .find((a) => a.place?.lat != null && a.place?.lng != null);
  const destPlace = longDistance ? lastPlaced?.place : undefined;

  // ── Qualifying intermediate stops ────────────────────────────────────────────
  // STAY activities with duration > 30min and valid coordinates.
  // Exclude the long-distance dest activity to avoid duplicate alerts.
  const stopItems: (WeatherMapItem & { name: string })[] = primaryActivities
    .filter((a) =>
      a.type === 'STAY' &&
      a.duration > 30 &&
      a.place?.lat != null &&
      a.place?.lng != null &&
      !!a.place?.name &&
      !(longDistance && a.id === lastPlaced?.id),
    )
    .map((a) => ({
      key:  a.id,
      lat:  a.place!.lat!,
      lng:  a.place!.lng!,
      date,
      name: a.place!.name,
    }));

  // ── Always call all hooks unconditionally ────────────────────────────────────
  const originWeather = useWeather(originLat, originLng, date);
  const destWeather   = useWeather(
    destPlace?.lat,
    destPlace?.lng,
    longDistance ? date : undefined,
  );
  // useWeatherMap handles empty array gracefully
  const stopWeathers  = useWeatherMap(stopItems);

  // Guard: need origin coords (hooks already called above)
  if (originLat == null || originLng == null) return null;

  if (originWeather === 'loading') {
    return (
      <div className="mb-1.5 px-4 py-2.5 rounded-2xl bg-sky-50 text-[11px] text-sky-300 animate-pulse">
        {t('weather.loading')}
      </div>
    );
  }

  if (!originWeather) {
    return (
      <div className="mb-1.5 px-4 py-2.5 rounded-2xl bg-sky-50 text-[11px] text-sky-400">
        {t('weather.noData')}
      </div>
    );
  }

  // Long-distance destination alerts
  const hasDestWeather = longDistance && destWeather !== 'loading' && destWeather !== null;
  const destAlerts = hasDestWeather && destWeather
    ? buildDestAlerts(originWeather, destWeather as WeatherData, destPlace?.name ?? t('weather.destination'), t)
    : [];

  // Intermediate stop alerts
  const stopAlerts: string[] = [];
  for (const stop of stopItems) {
    const sw = stopWeathers[stop.key];
    if (sw == null || sw === undefined) continue;
    const alert = buildStopAlert(originWeather, sw, stop.name, t);
    if (alert) stopAlerts.push(alert);
  }

  // ── Uniform-spread aggregation ────────────────────────────────────────────
  // If all readings within the day fall within UNIFORM_SPREAD°C of each other,
  // suppress individual stop/dest alerts and use one consolidated clothing line.
  const allReadings: WeatherData[] = [
    originWeather,
    hasDestWeather && destWeather ? (destWeather as WeatherData) : null,
    ...stopItems.map(s => stopWeathers[s.key]).filter((w): w is WeatherData => !!w),
  ].filter((w): w is WeatherData => w != null);

  const tempSpread = allReadings.length > 1
    ? Math.max(...allReadings.map(w => w.tempMax)) - Math.min(...allReadings.map(w => w.tempMax))
    : 0;
  const isUniform = tempSpread <= UNIFORM_SPREAD;

  // Conservative: use coldest tempMax + worst weather code (rain/snow beats clear)
  const adviceTempMax = isUniform && allReadings.length > 1
    ? Math.min(...allReadings.map(w => w.tempMax))
    : originWeather.tempMax;
  const adviceCode = allReadings.find(w => BAD_CODES.has(w.weatherCode))?.weatherCode
    ?? originWeather.weatherCode;

  return (
    <div className="mb-1.5 flex flex-col gap-1">

      {/* ── Main weather row ── */}
      <div className="px-3.5 py-2.5 rounded-2xl bg-sky-50 flex items-center gap-3">
        <WeatherCell
          w={originWeather}
          label={longDistance ? originPlace.name : undefined}
          t={t}
        />
        {hasDestWeather && destWeather && (
          <>
            <span className="text-sky-300 text-xs flex-none">›</span>
            <WeatherCell
              w={destWeather as WeatherData}
              label={destPlace?.name ?? t('weather.destination')}
              t={t}
            />
          </>
        )}
        <p className="ml-auto text-[10px] text-sky-600 text-right leading-snug max-w-[110px]">
          {clothingAdvice(adviceTempMax, adviceCode, t)}
        </p>
      </div>

      {/* ── Long-distance alerts (amber) — suppressed when all stops uniform ── */}
      {!isUniform && destAlerts.map((msg, i) => (
        <div
          key={i}
          className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-1.5 text-[11px] text-amber-700"
        >
          <span className="flex-none mt-px">⚠️</span>
          <span>{msg}</span>
        </div>
      ))}

      {/* ── Intermediate stop alerts (sky blue) — suppressed when all stops uniform ── */}
      {!isUniform && stopAlerts.map((msg, i) => (
        <div
          key={`stop-${i}`}
          className="px-3 py-2 rounded-xl bg-sky-50/80 border border-sky-100 flex items-start gap-1.5 text-[11px] text-sky-700"
        >
          <span className="flex-none mt-px">📍</span>
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}
