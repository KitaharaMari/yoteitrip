'use client';

import { useEffect, useRef, useState } from 'react';
import type { Activity } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { useTransitRoute, parseFare, type TravelMode, type TransitStep } from '@/hooks/useTransitRoute';
import { useTimezone } from '@/hooks/useTimezone';
import { useMapsLoaded } from '@/components/MapProvider';
import { buildDepartureDate } from '@/lib/departureTime';
import { haversineKm } from '@/lib/haversine';

interface Props {
  prevActivity: Activity;
  nextActivity: Activity;
  dayId: string;
  isLatest?: boolean;
}

// Build the Static Maps proxy URL for a route preview
function buildMapUrl(
  prevLat: number, prevLng: number,
  nextLat: number, nextLng: number,
  polyline?: string,
): string {
  const p = new URLSearchParams();
  p.append('m', `${prevLat.toFixed(6)},${prevLng.toFixed(6)}`);
  p.append('m', `${nextLat.toFixed(6)},${nextLng.toFixed(6)}`);
  if (polyline) p.append('p', polyline);
  return `/api/staticmap?${p.toString()}`;
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toTime(total: number): string {
  const c = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

function vehicleEmoji(type?: string): string {
  switch ((type ?? '').toUpperCase()) {
    case 'SUBWAY':          case 'METRO_RAIL':   return '🚇';
    case 'BUS':             case 'INTERCITY_BUS': return '🚌';
    case 'RAIL':            case 'COMMUTER_TRAIN':
    case 'HIGH_SPEED_TRAIN': case 'LONG_DISTANCE_TRAIN': return '🚆';
    case 'TRAM':            case 'MONORAIL':     return '🚋';
    case 'FERRY':                                return '⛴️';
    default:                                     return '🚐';
  }
}

/** Merge consecutive WALKING steps into one, summing distances (metres). */
function mergeSteps(steps: TransitStep[]): TransitStep[] {
  const out: TransitStep[] = [];
  let walkM = 0;

  const flushWalk = () => {
    if (walkM <= 0) return;
    out.push({ mode: 'WALKING', duration: '', distance: walkM >= 1000 ? `${(walkM / 1000).toFixed(1)} km` : `${Math.round(walkM)} m` });
    walkM = 0;
  };

  for (const s of steps) {
    if (s.mode === 'WALKING') {
      // Parse "200 m" / "1.2 km" → metres
      const d = s.distance ?? '';
      const km  = d.match(/^([\d.]+)\s*km/i);
      const m   = d.match(/^([\d.]+)\s*m/i);
      walkM += km ? parseFloat(km[1]) * 1000 : m ? parseFloat(m[1]) : 0;
    } else {
      flushWalk();
      out.push(s);
    }
  }
  flushWalk();
  return out;
}

function StepList({ steps, fareText }: { steps: TransitStep[]; fareText?: string }) {
  const merged = mergeSteps(steps);

  return (
    <div className="ml-[52px] mr-0 my-1 bg-gray-50 rounded-2xl px-3 py-2.5 flex flex-col gap-2 text-xs">
      {merged.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          {step.mode === 'WALKING' ? (
            <span className="text-gray-400 text-[10px]">🚶 {step.distance}</span>
          ) : (
            <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-gray-700 font-medium whitespace-nowrap">
                {step.departureStop ?? '—'}
                <span className="mx-1 font-normal text-gray-400">→</span>
                {step.arrivalStop ?? '—'}
              </span>
              {(step.lineShort ?? step.lineName) && (
                <span className="text-gray-400 whitespace-nowrap">
                  · {vehicleEmoji(step.vehicleType)} {step.lineShort ?? step.lineName}
                </span>
              )}
              <span className="text-gray-400 whitespace-nowrap">· {step.duration}</span>
            </span>
          )}
        </div>
      ))}

      {fareText && (
        <div className="flex justify-between text-gray-400 pt-1.5 border-t border-gray-200">
          <span>票价</span>
          <span className="font-medium">{fareText}</span>
        </div>
      )}
    </div>
  );
}

export function CommuteConnector({ prevActivity, nextActivity, dayId, isLatest = false }: Props) {
  const updateActivity = useTripStore((s) => s.updateActivity);
  const mapsLoaded     = useMapsLoaded();
  // Initialize from the day's stored travel mode; sync whenever it changes.
  const dayTravelMode  = useTripStore(
    (s) => (s.trip.days.find((d) => d.id === dayId)?.travelMode ?? 'TRANSIT') as TravelMode,
  );
  const dayDate = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.date);

  const [mode, setMode]         = useState<TravelMode>(dayTravelMode);
  const [expanded, setExpanded] = useState(false);

  // ── hasPlaces — needed early for effects ──────────────────────────────────
  const hasPlaces = !!(prevActivity.place?.lat && nextActivity.place?.lat);

  // ── Route preview map ──────────────────────────────────────────────────────
  const [showMap, setShowMap] = useState(false);
  const userClosedMap = useRef(false);

  // Sync when the user changes the day-level mode toggle
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(dayTravelMode);
  }, [dayTravelMode]);

  // Auto-open map when both places are filled and this is the latest route
  useEffect(() => {
    if (hasPlaces && isLatest && !userClosedMap.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowMap(true);
    }
  }, [hasPlaces, isLatest]);

  // Auto-collapse when a new activity is added (this is no longer the latest)
  useEffect(() => {
    if (!isLatest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowMap(false);
      userClosedMap.current = false;
    }
  }, [isLatest]);

  // Departure time = end of previous activity (start + duration)
  const prevEndHHMM  = toTime(toMin(prevActivity.startTime) + prevActivity.duration);
  const departureTime = buildDepartureDate(prevEndHHMM, dayDate);

  const route = useTransitRoute(prevActivity.place, nextActivity.place, mode, mapsLoaded, departureTime);

  // ── Timezone change detection ────────────────────────────────────────────────
  const prevTz = useTimezone(prevActivity.place?.lat, prevActivity.place?.lng);
  const nextTz = useTimezone(nextActivity.place?.lat, nextActivity.place?.lng);

  // ── Walking route (always computed when places are close enough) ───────────
  const straightLineKm = (
    prevActivity.place?.lat != null && prevActivity.place?.lng != null &&
    nextActivity.place?.lat  != null && nextActivity.place?.lng  != null
  ) ? haversineKm(
    prevActivity.place.lat, prevActivity.place.lng,
    nextActivity.place.lat, nextActivity.place.lng,
  ) : Infinity;

  const walkingRoute = useTransitRoute(
    prevActivity.place,
    nextActivity.place,
    'WALKING',
    mapsLoaded && straightLineKm < 5,  // only fetch when within 5 km straight-line
  );

  // Show walking option when: < 60 min, OR within 15 min of the main route
  const walkingMin  = walkingRoute?.totalMinutes ?? Infinity;
  const mainMin     = route?.totalMinutes ?? Infinity;
  const showWalking = walkingRoute !== null && (
    walkingMin < 60 || Math.abs(walkingMin - mainMin) <= 15
  );

  // ── Save transit fare (walking has no fare) ───────────────────────────────
  useEffect(() => {
    const fare = mode === 'WALKING' ? undefined : parseFare(route?.fareText);
    const fareCurrency = (mode !== 'WALKING' && route?.fareText)
      ? (route.fareText.match(/^[^\d]+/)?.[0].trim() || undefined)
      : undefined;
    if (nextActivity.transitFare === fare && nextActivity.transitFareCurrency === fareCurrency) return;
    updateActivity(dayId, nextActivity.id, { transitFare: fare, transitFareCurrency: fareCurrency });
  }, [mode, route?.fareText, dayId, nextActivity.id, nextActivity.transitFare, nextActivity.transitFareCurrency, updateActivity]);

  // ── Persist driving distance + polyline for daily fuel stats & static map ─
  useEffect(() => {
    const meters   = route?.usedMode === 'DRIVING' && route.totalMeters ? route.totalMeters : undefined;
    const polyline = route?.overviewPolyline ?? undefined;
    if (nextActivity.commuteDrivingMeters === meters && nextActivity.commutePolyline === polyline) return;
    updateActivity(dayId, nextActivity.id, { commuteDrivingMeters: meters, commutePolyline: polyline });
  }, [route?.totalMeters, route?.usedMode, route?.overviewPolyline, dayId, nextActivity.id, nextActivity.commuteDrivingMeters, nextActivity.commutePolyline, updateActivity]);

  // ── Cascade startTime ──────────────────────────────────────────────────
  useEffect(() => {
    if (nextActivity.isManualTime) return;
    const commuteMin = route?.totalMinutes ?? 0;
    const endMin  = toMin(prevActivity.startTime) + prevActivity.duration;
    const newTime = toTime(endMin + commuteMin);
    if (nextActivity.startTime === newTime) return;
    updateActivity(dayId, nextActivity.id, { startTime: newTime });
  }, [
    route?.totalMinutes,
    prevActivity.startTime,
    prevActivity.duration,
    dayId,
    nextActivity.id,
    nextActivity.startTime,
    nextActivity.isManualTime,
    updateActivity,
  ]);

  const hasRoute  = !!route;

  // Show timezone warning when both timezones are known and differ by ≥1h
  const tzWarning = (() => {
    if (prevTz === 'loading' || nextTz === 'loading' || !prevTz || !nextTz) return null;
    const diff = nextTz.offsetHours - prevTz.offsetHours;
    if (Math.abs(diff) < 1) return null;
    const fmt = (h: number) => {
      const sign = h >= 0 ? '+' : '−';
      const abs  = Math.abs(h);
      const hh   = Math.floor(abs);
      const mm   = Math.round((abs - hh) * 60);
      return mm > 0 ? `UTC${sign}${hh}:${String(mm).padStart(2, '0')}` : `UTC${sign}${hh}`;
    };
    const dir = diff > 0 ? `快 ${diff}h` : `慢 ${Math.abs(diff)}h`;
    return `${fmt(prevTz.offsetHours)} → ${fmt(nextTz.offsetHours)}，目的地${dir}，注意营业时间`;
  })();
  const hasSteps  = (route?.steps?.length ?? 0) > 0;
  const displayMode = route?.usedMode ?? mode;
  const transitNoData = mode === 'TRANSIT' && hasRoute && displayMode === 'DRIVING';

  // Available modes: always TRANSIT + DRIVING, plus WALKING when applicable
  const availableModes: TravelMode[] = showWalking
    ? ['TRANSIT', 'DRIVING', 'WALKING']
    : ['TRANSIT', 'DRIVING'];

  const handleModeToggle = () => {
    const idx = availableModes.indexOf(mode);
    setMode(availableModes[(idx + 1) % availableModes.length]);
    setExpanded(false);
  };

  return (
    <div className="py-0.5">
      {/* ── Compact connector row ── */}
      <div className="flex items-center gap-3 px-4 py-0.5">
        {/* Aligns with startTime column */}
        <div className="w-10 flex-none" />

        {/* Dashed vertical line */}
        <div className="w-5 flex-none flex justify-center">
          <div className="w-px h-5 border-l border-dashed border-gray-200" />
        </div>

        {/* Mode selector — shows all available modes; extra walking button appears when applicable */}
        {hasPlaces && (
          <div className="flex items-center gap-0.5 flex-none">
            {(['TRANSIT', 'DRIVING'] as TravelMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setExpanded(false); }}
                title={m === 'TRANSIT' ? (transitNoData ? '无公交数据 · 已显示驾车' : '公交') : '驾车'}
                className={`text-[11px] px-0.5 rounded transition-colors leading-none ${
                  mode === m ? 'opacity-100' : 'opacity-30 hover:opacity-60'
                }`}
              >
                {m === 'TRANSIT' ? '🚌' : '🚗'}
              </button>
            ))}
            {showWalking && (
              <button
                onClick={() => { setMode('WALKING'); setExpanded(false); }}
                title={`步行约 ${walkingRoute!.totalText}`}
                className={`flex items-center gap-0.5 text-[10px] px-0.5 rounded transition-colors leading-none ${
                  mode === 'WALKING' ? 'opacity-100' : 'opacity-30 hover:opacity-60'
                }`}
              >
                <span className="text-[11px]">🚶</span>
                <span className="text-gray-500 tabular-nums">{walkingRoute!.totalText}</span>
              </button>
            )}
          </div>
        )}

        {/* Commute summary — station info + time (time is flex-none, never truncated) */}
        {(() => {
          const keyStep = hasRoute && route!.usedMode === 'TRANSIT'
            ? route!.steps.find(s => s.mode === 'TRANSIT') ?? null
            : null;

          if (!hasRoute) {
            return (
              <span className="flex-1 text-[10px] text-gray-300">
                {hasPlaces ? '计算中…' : '— —'}
              </span>
            );
          }

          const stationInfo = keyStep
            ? [
                vehicleEmoji(keyStep.vehicleType),
                keyStep.lineShort ?? keyStep.lineName ?? '',
                keyStep.departureStop && keyStep.arrivalStop
                  ? `${keyStep.departureStop}→${keyStep.arrivalStop}`
                  : keyStep.departureStop ?? '',
              ].filter(Boolean).join(' ')
            : null;

          return (
            <a
              href={route!.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="在 Google Maps 中打开路线"
              className="flex-1 min-w-0 flex items-center gap-1 hover:text-blue-500 transition-colors"
            >
              {stationInfo && (
                <span className="truncate text-[10px] text-gray-500">{stationInfo}</span>
              )}
              <span className="flex-none text-[10px] text-gray-500 tabular-nums">
                {stationInfo ? '· ' : ''}{route!.totalText}
              </span>
              {route!.fareText && (
                <span className="flex-none text-[10px] text-gray-400 ml-0.5">
                  · {route!.fareText}
                </span>
              )}
            </a>
          );
        })()}

        {/* Map toggle button */}
        {hasPlaces && (
          <button
            onClick={() => {
              const next = !showMap;
              userClosedMap.current = !next;
              setShowMap(next);
            }}
            className={`text-[11px] flex-none transition-colors leading-none ${
              showMap ? 'opacity-90' : 'opacity-25 hover:opacity-60'
            }`}
            title={showMap ? '收起路线图' : '查看路线图'}
          >
            🗺️
          </button>
        )}

        {/* Expand/collapse transit steps */}
        {hasSteps && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-gray-300 hover:text-gray-600 transition-colors flex-none"
            aria-label={expanded ? '收起路线' : '展开路线'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}

        {/* Navigate — always visible */}
        {hasRoute && (
          <a
            href={route!.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-none text-[12px] text-gray-400 hover:text-blue-500 transition-colors px-0.5"
            title="在 Google Maps 中打开路线"
          >
            ↗
          </a>
        )}
      </div>

      {/* ── Route preview map ── */}
      {showMap && hasPlaces && prevActivity.place?.lat != null && nextActivity.place?.lat != null && (
        <div className="mx-4 mt-1.5 mb-0.5 rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
          style={{ height: 160 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildMapUrl(
              prevActivity.place.lat,
              prevActivity.place.lng!,
              nextActivity.place.lat,
              nextActivity.place.lng!,
              route?.overviewPolyline ?? nextActivity.commutePolyline,
            )}
            alt="路线预览"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* ── Timezone change alert ── */}
      {tzWarning && (
        <div className="ml-[52px] mr-4 mb-0.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-1.5 text-[10px] text-amber-700">
          <span className="flex-none">🕐</span>
          <span>{tzWarning}</span>
        </div>
      )}

      {/* ── Expanded transit step list ── */}
      {expanded && route?.steps && (
        <StepList steps={route.steps} fareText={route.fareText} />
      )}
    </div>
  );
}
