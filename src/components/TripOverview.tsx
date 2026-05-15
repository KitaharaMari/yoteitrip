'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Day, Trip } from '@/types';
import type { WeatherData } from '@/lib/weather';
import { RAIN_CODES, SNOW_CODES } from '@/lib/weather';
import { useT } from '@/hooks/useT';
import { useWeatherMap, type WeatherMapItem } from '@/hooks/useWeather';
import { useLangStore } from '@/store/useLangStore';
import { ACTIVITY_META } from '@/lib/constants';

// ── Keep these exports — used by ExportModal ──────────────────────────────────
const DEFAULT_CONSUMPTION = 8.0;

function defaultFuelPrice(currency: string): number {
  return currency === 'JPY' || currency === 'CNY' ? 170 : 1.85;
}

export interface DayStats {
  drivingKm:     number;
  activityCost:  number;
  fuelCost:      number;
  totalCost:     number;
  transitGroups: { currency: string; amount: number }[];
  places:        string[];
}

export function computeDayStats(day: Day, tripCurrency: string): DayStats {
  const primary = day.activities.filter((a) => !a.isBackup);

  const activityCost = primary
    .filter((a) => (a.type === 'STAY' || a.type === 'MEAL' || a.type === 'LONG_DISTANCE') && a.estimatedCost != null)
    .reduce((sum, a) => sum + (a.estimatedCost ?? 0), 0);

  const transitMap: Record<string, number> = {};
  for (const a of primary) {
    if (!a.transitFare || a.transitFare <= 0) continue;
    const c = (a.transitFareCurrency && a.transitFareCurrency !== 'undefined' && a.transitFareCurrency.trim())
      ? a.transitFareCurrency
      : tripCurrency;
    transitMap[c] = (transitMap[c] ?? 0) + a.transitFare;
  }
  const transitGroups = Object.entries(transitMap).map(([currency, amount]) => ({ currency, amount }));

  const drivingMeters = primary.reduce((s, a) => s + (a.commuteDrivingMeters ?? 0), 0);
  const drivingKm = drivingMeters / 1000;

  let fuelCost = 0;
  if (drivingKm >= 50) {
    const consumption = day.carSettings?.consumption ?? DEFAULT_CONSUMPTION;
    const fuelPrice   = day.carSettings?.fuelPrice   ?? defaultFuelPrice(tripCurrency);
    fuelCost = (drivingKm / 100) * consumption * fuelPrice;
  }

  const places = primary
    .filter((a) => a.place?.name && a.type !== 'TRANSPORT')
    .map((a) => a.place!.name);

  return { drivingKm, activityCost, fuelCost, totalCost: activityCost + fuelCost, transitGroups, places };
}

// ── Static Maps URL for a full day ────────────────────────────────────────────
function buildDayMapUrl(day: Day): string | null {
  const primary = day.activities.filter((a) => !a.isBackup);
  const markers: string[] = [];
  const polylines: string[] = [];

  if (day.originPlace?.lat != null) {
    markers.push(`${day.originPlace.lat.toFixed(6)},${day.originPlace.lng!.toFixed(6)}`);
  }
  for (const act of primary) {
    if (act.place?.lat != null) {
      markers.push(`${act.place.lat.toFixed(6)},${act.place.lng!.toFixed(6)}`);
    }
    if (act.commutePolyline) polylines.push(act.commutePolyline);
  }

  if (markers.length === 0) return null;
  const p = new URLSearchParams();
  for (const m of markers.slice(0, 15)) p.append('m', m);
  for (const poly of polylines.slice(0, 8)) p.append('p', poly);
  return `/api/staticmap?${p.toString()}`;
}

// ── Collapsed route summary ───────────────────────────────────────────────────
function buildRouteSummary(day: Day): {
  origin: string | null;
  waypoints: string[];
  end: string | null;
} {
  const nonTransport = day.activities.filter((a) => !a.isBackup && a.place?.name && a.type !== 'TRANSPORT');
  if (nonTransport.length === 0) return { origin: day.originPlace?.name ?? null, waypoints: [], end: null };

  // Prefer ACCOMMODATION as the day's end
  const accommodation = [...nonTransport].reverse().find((a) => a.type === 'ACCOMMODATION');
  const endAct = accommodation ?? nonTransport[nonTransport.length - 1];
  const endName = endAct.place!.name;

  const origin = day.originPlace?.name ?? null;
  const contentNames = nonTransport.filter((a) => a.id !== endAct.id).map((a) => a.place!.name);

  let displayOrigin = origin;
  let midNames = contentNames;

  // If no explicit origin, promote first content place as origin
  if (!displayOrigin && contentNames.length > 0) {
    displayOrigin = contentNames[0];
    midNames = contentNames.slice(1);
  }

  return {
    origin: displayOrigin,
    waypoints: midNames.slice(0, 3),
    end: displayOrigin !== endName ? endName : null,
  };
}

// ── Trip-wide gear advice ─────────────────────────────────────────────────────
function tripGearAdvice(days: Day[], weatherMap: Record<string, WeatherData | null>): string {
  const weathers = days.map((d) => weatherMap[d.id]).filter((w): w is WeatherData => w != null);
  if (weathers.length === 0) return '';

  const minTemp = Math.min(...weathers.map((w) => w.tempMin));
  const maxTemp = Math.max(...weathers.map((w) => w.tempMax));
  const hasRain = weathers.some((w) => RAIN_CODES.has(w.weatherCode));
  const hasSnow = weathers.some((w) => SNOW_CODES.has(w.weatherCode));

  const parts: string[] = [];
  if      (minTemp < 0)  parts.push('全程严寒，羽绒服+帽子手套必备');
  else if (minTemp < 5)  parts.push('气温偏低，请备好厚外套与羽绒背心');
  else if (minTemp < 10) parts.push('早晚寒冷，建议中厚外套');
  else if (minTemp < 15) parts.push('天气凉爽，轻薄外套备用');
  else if (minTemp < 20) parts.push('气候宜人，可带薄外套备用');
  else                   parts.push(`气温 ${minTemp}~${maxTemp}°C，夏日轻便穿搭`);

  if (maxTemp - minTemp > 15) parts.push('昼夜温差大，可叠穿');
  if (hasSnow)  parts.push('有降雪，防水鞋必备');
  else if (hasRain) parts.push('多日有雨，携带雨具');

  return parts.join(' · ');
}

function fmt(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ── Weather & Gear Card ───────────────────────────────────────────────────────
function WeatherGearCard({ days, weatherMap }: {
  days: Day[];
  weatherMap: Record<string, WeatherData | null>;
}) {
  const lang = useLangStore((s) => s.lang);
  const daysWithWeather = days.filter((d) => d.date && weatherMap[d.id] != null);
  if (daysWithWeather.length === 0) return null;

  const advice = tripGearAdvice(days, weatherMap);

  return (
    <div className="mx-4 mt-2 bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-gray-500 mb-2.5">天气 &amp; 穿搭建议</p>

      {/* Daily weather dots */}
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-0.5">
        {days.map((day) => {
          const w = weatherMap[day.id];
          if (!w || !day.date) return null;
          const label = new Date(day.date + 'T00:00:00').toLocaleDateString(lang, { month: 'short', day: 'numeric' });
          return (
            <div key={day.id} className="flex flex-col items-center gap-0.5 flex-none">
              <span className="text-[10px] text-gray-400 leading-none">{label}</span>
              <span className="text-xl leading-none my-0.5">{w.emoji}</span>
              <span className="text-[11px] font-semibold tabular-nums text-gray-800 leading-none">{w.tempMax}°</span>
              <span className="text-[10px] tabular-nums text-gray-400 leading-none">{w.tempMin}°</span>
            </div>
          );
        })}
      </div>

      {/* AI gear suggestion */}
      {advice && (
        <p className="text-[11px] text-gray-500 mt-2.5 pt-2.5 border-t border-gray-50 leading-relaxed">
          👕 {advice}
        </p>
      )}
    </div>
  );
}

// ── Collapsible Day Card ──────────────────────────────────────────────────────
function DayCard({ day, stats, tripCurrency, weather, isExpanded, onToggle }: {
  day: Day;
  stats: DayStats;
  tripCurrency: string;
  weather: WeatherData | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const lang         = useLangStore((s) => s.lang);
  const summary      = buildRouteSummary(day);
  const mapUrl       = buildDayMapUrl(day);
  const placeActs    = day.activities.filter((a) => !a.isBackup && a.place?.name);
  const dateLabel    = day.date
    ? new Date(day.date + 'T00:00:00').toLocaleDateString(lang, { month: 'short', day: 'numeric' })
    : null;

  const totalCostStr = stats.totalCost > 0 ? fmt(tripCurrency, stats.totalCost) : null;
  const hasFooter    = stats.drivingKm >= 10 || stats.transitGroups.length > 0;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden select-none"
      onClick={onToggle}
      style={{ cursor: 'pointer' }}
    >
      {/* ── Collapsed header (always visible) ── */}
      <div className="px-4 pt-3 pb-3">

        {/* Row 1: Day + date + weather + cost + chevron */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 flex-none">{day.label}</span>
          {dateLabel && (
            <span className="text-[11px] text-gray-400 flex-none">{dateLabel}</span>
          )}
          {weather && (
            <span className="text-[11px] text-gray-500 flex-none leading-none">
              {weather.emoji} {weather.tempMax}°/{weather.tempMin}°
            </span>
          )}
          <span className="flex-1" />
          {totalCostStr && (
            <span className="text-xs font-semibold tabular-nums flex-none" style={{ color: '#3D5568' }}>
              {totalCostStr}
            </span>
          )}
          <span
            className="text-[10px] text-gray-300 flex-none transition-transform duration-200"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </div>

        {/* Row 2: Route summary — origin → waypoints → end */}
        {(summary.origin || summary.waypoints.length > 0 || summary.end) && (
          <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
            {summary.origin && (
              <span
                className="text-[11px] font-semibold truncate flex-none max-w-[6rem]"
                style={{ color: '#47BB8E' }}
              >
                {summary.origin}
              </span>
            )}
            {summary.origin && (summary.waypoints.length > 0 || summary.end) && (
              <span className="text-[10px] text-gray-300 flex-none">→</span>
            )}
            {summary.waypoints.length > 0 && (
              <span className="text-[11px] text-gray-500 truncate flex-1 min-w-0">
                {summary.waypoints.join(' · ')}
              </span>
            )}
            {summary.waypoints.length > 0 && summary.end && (
              <span className="text-[10px] text-gray-300 flex-none">→</span>
            )}
            {summary.end && (
              <span className="text-[11px] font-semibold text-gray-700 truncate flex-none max-w-[6rem]">
                {summary.end}
              </span>
            )}
          </div>
        )}

        {/* Row 3: Stats (km + transit) — compact, only if relevant */}
        {hasFooter && (
          <div className="flex items-center gap-2.5 mt-1.5">
            {stats.drivingKm >= 10 && (
              <span className="text-[10px] text-gray-400 tabular-nums">
                🚗 {stats.drivingKm.toFixed(0)} km
                {stats.fuelCost > 0 && ` · ${fmt(tripCurrency, stats.fuelCost)}`}
              </span>
            )}
            {stats.transitGroups.map(({ currency, amount }) => (
              <span key={currency} className="text-[10px] text-gray-400 tabular-nums">
                🚌 {fmt(currency, amount)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Expanded content (accordion) ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Static Map — aspect-video */}
            {mapUrl && (
              <div className="relative w-full aspect-video border-t border-gray-50 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapUrl}
                  alt={`${day.label} 路线预览`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}

            {/* Place list */}
            {placeActs.length > 0 && (
              <div className="px-4 pt-3 pb-4 border-t border-gray-50 flex flex-col gap-3">
                {placeActs.map((act) => {
                  const meta = ACTIVITY_META[act.type];
                  const durH = Math.floor(act.duration / 60);
                  const durM = act.duration % 60;
                  const durStr = act.duration > 0
                    ? (durH > 0 ? `${durH}h${durM > 0 ? durM + 'm' : ''}` : `${durM}m`)
                    : '';
                  return (
                    <div key={act.id} className="flex items-start gap-3">
                      <span className="text-[10px] font-mono text-gray-400 tabular-nums w-10 flex-none pt-0.5">
                        {act.startTime}
                      </span>
                      <span className="text-base leading-none flex-none">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium leading-snug truncate">
                          {act.place!.name}
                        </p>
                        {act.place?.address && (
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">{act.place.address}</p>
                        )}
                      </div>
                      {durStr && (
                        <span className="text-[10px] text-gray-400 flex-none tabular-nums pt-0.5">
                          {durStr}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── TripOverview ──────────────────────────────────────────────────────────────
export function TripOverview({ trip }: { trip: Trip }) {
  const t            = useT();
  const tripCurrency = trip.currency ?? 'CAD';
  const allStats     = trip.days.map((d) => computeDayStats(d, tripCurrency));

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Summary totals
  const totalDrivingKm = allStats.reduce((s, st) => s + st.drivingKm, 0);
  const totalUserCost  = allStats.reduce((s, st) => s + st.totalCost, 0);
  const totalPlaces    = trip.days.flatMap((d) =>
    d.activities.filter((a) => !a.isBackup && a.place?.name),
  ).length;

  const transitTotals: Record<string, number> = {};
  for (const st of allStats) {
    for (const { currency, amount } of st.transitGroups) {
      transitTotals[currency] = (transitTotals[currency] ?? 0) + amount;
    }
  }
  const transitSummary = Object.entries(transitTotals).map(([currency, amount]) => ({ currency, amount }));
  const hasBudget = totalUserCost > 0 || transitSummary.length > 0;

  // Weather — fetch once per day using the first place with coordinates
  const weatherItems: WeatherMapItem[] = trip.days.flatMap((d) => {
    if (!d.date) return [];
    const firstPlace = d.activities.find((a) => !a.isBackup && a.place?.lat != null)?.place;
    const lat = firstPlace?.lat ?? trip.baseLocation?.lat;
    const lng = firstPlace?.lng ?? trip.baseLocation?.lng;
    if (lat == null || lng == null) return [];
    return [{ key: d.id, lat, lng, date: d.date }];
  });
  const weatherMap = useWeatherMap(weatherItems);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex-1 overflow-y-auto pb-10">

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-2 mx-4 mt-4">
        {[
          { label: t('overview.totalDays'),  value: `${trip.days.length} 天` },
          { label: t('overview.totalKm'),    value: totalDrivingKm > 0 ? `${totalDrivingKm.toFixed(0)} km` : '—' },
          { label: t('overview.places'),     value: `${totalPlaces} 处` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 px-2 py-3 flex flex-col items-center gap-1 shadow-sm">
            <span className="text-lg font-bold text-gray-900 leading-none">{value}</span>
            <span className="text-[10px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Budget summary ── */}
      {hasBudget && (
        <div className="mx-4 mt-2 bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">
          <span className="text-xs text-gray-500 block mb-2">{t('overview.budget')}</span>
          {totalUserCost > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">活动 · 餐饮 · 油费</span>
              <span className="text-base font-bold text-gray-900 tabular-nums">
                {fmt(tripCurrency, totalUserCost)}
              </span>
            </div>
          )}
          {transitSummary.map(({ currency, amount }) => (
            <div key={currency} className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-gray-400">
                当地交通{currency !== tripCurrency ? ` (${currency})` : ''}
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: '#3D5568' }}>
                {fmt(currency, amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Weather & Gear Card ── */}
      <WeatherGearCard days={trip.days} weatherMap={weatherMap} />

      {/* ── Per-day collapsible cards ── */}
      <div className="flex flex-col gap-2 px-4 mt-3">
        {trip.days.map((day, i) => (
          <DayCard
            key={day.id}
            day={day}
            stats={allStats[i]}
            tripCurrency={tripCurrency}
            weather={weatherMap[day.id] ?? null}
            isExpanded={expandedId === day.id}
            onToggle={() => handleToggle(day.id)}
          />
        ))}
      </div>
    </div>
  );
}
