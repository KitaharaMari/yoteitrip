'use client';

import { useEffect, useState } from 'react';
import type { Activity } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { useTransitRoute, parseFare, type TravelMode, type TransitStep } from '@/hooks/useTransitRoute';
import { useMapsLoaded } from '@/components/MapProvider';
import { buildDepartureDate } from '@/lib/departureTime';

interface Props {
  prevActivity: Activity;
  nextActivity: Activity;
  dayId: string;
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

export function CommuteConnector({ prevActivity, nextActivity, dayId }: Props) {
  const updateActivity = useTripStore((s) => s.updateActivity);
  const mapsLoaded     = useMapsLoaded();
  // Initialize from the day's stored travel mode; sync whenever it changes.
  const dayTravelMode  = useTripStore(
    (s) => (s.trip.days.find((d) => d.id === dayId)?.travelMode ?? 'TRANSIT') as TravelMode,
  );
  const dayDate = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.date);

  const [mode, setMode]         = useState<TravelMode>(dayTravelMode);
  const [expanded, setExpanded] = useState(false);

  // Sync when the user changes the day-level mode toggle
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(dayTravelMode);
  }, [dayTravelMode]);

  // Departure time = end of previous activity (start + duration)
  const prevEndHHMM  = toTime(toMin(prevActivity.startTime) + prevActivity.duration);
  const departureTime = buildDepartureDate(prevEndHHMM, dayDate);

  const route = useTransitRoute(prevActivity.place, nextActivity.place, mode, mapsLoaded, departureTime);

  // ── Save transit fare to store so ActivityList can include it in budget ─
  useEffect(() => {
    const fare = parseFare(route?.fareText);
    if (nextActivity.transitFare === fare) return;
    updateActivity(dayId, nextActivity.id, { transitFare: fare });
  }, [route?.fareText, dayId, nextActivity.id, nextActivity.transitFare, updateActivity]);

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

  const hasPlaces = !!(prevActivity.place?.lat && nextActivity.place?.lat);
  const hasRoute  = !!route;
  const hasSteps  = (route?.steps?.length ?? 0) > 0;
  // What the route actually used (may differ from `mode` when transit falls back to driving)
  const displayMode = route?.usedMode ?? mode;
  // Transit was requested but the hook could only return a driving route
  const transitNoData = mode === 'TRANSIT' && hasRoute && displayMode === 'DRIVING';

  const handleModeToggle = () => {
    setMode(prev => prev === 'TRANSIT' ? 'DRIVING' : 'TRANSIT');
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

        {/* Mode toggle */}
        {hasPlaces && (
          <button
            onClick={handleModeToggle}
            title={
              transitNoData
                ? '此路段无公交数据 · 点击切换驾车'
                : displayMode === 'TRANSIT' ? '切换为驾车' : '切换为公交'
            }
            className="text-[11px] transition-colors flex-none text-gray-300 hover:text-gray-600"
          >
            {displayMode === 'TRANSIT' ? '🚌' : '🚗'}
            {transitNoData && (
              <span className="text-[8px] text-gray-400 ml-0.5">无公交</span>
            )}
          </button>
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

        {/* Expand/collapse */}
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

      {/* ── Expanded transit step list ── */}
      {expanded && route?.steps && (
        <StepList steps={route.steps} fareText={route.fareText} />
      )}
    </div>
  );
}
