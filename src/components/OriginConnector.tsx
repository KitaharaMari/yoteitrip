'use client';

import { useEffect, useRef, useState } from 'react';
import type { Activity, PlaceDetails } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { useTransitRoute, parseFare, type TravelMode, type TransitStep } from '@/hooks/useTransitRoute';
import { useMapsLoaded } from '@/components/MapProvider';
import { buildDepartureDate } from '@/lib/departureTime';
import { useT } from '@/hooks/useT';

// Build the Static Maps proxy URL for the origin → first activity segment
function buildMapUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  polyline?: string,
): string {
  const p = new URLSearchParams();
  p.set('t', 'hybrid');
  p.append('m', `${fromLat.toFixed(6)},${fromLng.toFixed(6)}`);
  p.append('m', `${toLat.toFixed(6)},${toLng.toFixed(6)}`);
  if (polyline) p.append('p', polyline);
  return `/api/staticmap?${p.toString()}`;
}

interface Props {
  originPlace: PlaceDetails;
  originTime: string;
  firstActivity: Activity;
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

function roundUp5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

function vehicleEmoji(type?: string): string {
  switch ((type ?? '').toUpperCase()) {
    case 'SUBWAY': case 'METRO_RAIL':    return '🚇';
    case 'BUS':    case 'INTERCITY_BUS': return '🚌';
    case 'RAIL':   case 'COMMUTER_TRAIN':
    case 'HIGH_SPEED_TRAIN': case 'LONG_DISTANCE_TRAIN': return '🚆';
    case 'TRAM':   case 'MONORAIL':      return '🚋';
    case 'FERRY':                         return '⛴️';
    default:                              return '🚐';
  }
}

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
      const d  = s.distance ?? '';
      const km = d.match(/^([\d.]+)\s*km/i);
      const m  = d.match(/^([\d.]+)\s*m/i);
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
  const t      = useT();
  return (
    <div className="ml-[52px] mr-0 my-1 bg-emerald-50 rounded-2xl px-3 py-2.5 flex flex-col gap-2 text-xs">
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
        <div className="flex justify-between text-gray-400 pt-1.5 border-t border-emerald-200">
          <span>{t('commute.fare')}</span>
          <span className="font-medium">{fareText}</span>
        </div>
      )}
    </div>
  );
}

export function OriginConnector({ originPlace, originTime, firstActivity, dayId }: Props) {
  const updateActivity = useTripStore((s) => s.updateActivity);
  const mapsLoaded     = useMapsLoaded();
  const t              = useT();
  const dayTravelMode  = useTripStore(
    (s) => (s.trip.days.find((d) => d.id === dayId)?.travelMode ?? 'TRANSIT') as TravelMode,
  );
  const dayDate = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.date);

  const [mode, setMode]         = useState<TravelMode>(dayTravelMode);
  const [expanded, setExpanded] = useState(false);

  // ── Route preview map ──────────────────────────────────────────────────────
  const hasPlaces     = !!(originPlace.lat != null && firstActivity.place?.lat != null);
  const [showMap, setShowMap] = useState(false);
  const userClosedMap = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(dayTravelMode);
  }, [dayTravelMode]);

  // Auto-open when both places have coordinates
  useEffect(() => {
    if (hasPlaces && !userClosedMap.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowMap(true);
    }
  }, [hasPlaces]);

  // Departure time = the day's origin departure time
  const departureTime = buildDepartureDate(originTime, dayDate);

  const route = useTransitRoute(originPlace, firstActivity.place, mode, mapsLoaded, departureTime);

  useEffect(() => {
    const fare = parseFare(route?.fareText);
    const fareCurrency = route?.fareText
      ? (route.fareText.match(/^[^\d]+/)?.[0].trim() || undefined)
      : undefined;
    if (firstActivity.transitFare === fare && firstActivity.transitFareCurrency === fareCurrency) return;
    updateActivity(dayId, firstActivity.id, { transitFare: fare, transitFareCurrency: fareCurrency });
  }, [route?.fareText, dayId, firstActivity.id, firstActivity.transitFare, firstActivity.transitFareCurrency, updateActivity]);

  useEffect(() => {
    if (firstActivity.isManualTime) return;
    const commuteMin = route?.totalMinutes ?? 0;
    const newStart   = toTime(roundUp5(toMin(originTime) + commuteMin));
    if (firstActivity.startTime === newStart) return;
    updateActivity(dayId, firstActivity.id, { startTime: newStart });
  }, [route?.totalMinutes, originTime, firstActivity.id, firstActivity.startTime, firstActivity.isManualTime, dayId, updateActivity]);

  // ── Persist driving distance + polyline for daily fuel stats & static map ─
  useEffect(() => {
    const meters   = route?.usedMode === 'DRIVING' && route.totalMeters ? route.totalMeters : undefined;
    const polyline = route?.overviewPolyline ?? undefined;
    if (firstActivity.commuteDrivingMeters === meters && firstActivity.commutePolyline === polyline) return;
    updateActivity(dayId, firstActivity.id, { commuteDrivingMeters: meters, commutePolyline: polyline });
  }, [route?.totalMeters, route?.usedMode, route?.overviewPolyline, dayId, firstActivity.id, firstActivity.commuteDrivingMeters, firstActivity.commutePolyline, updateActivity]);

  const hasRoute    = !!route;
  const hasSteps    = (route?.steps?.length ?? 0) > 0;
  const displayMode = route?.usedMode ?? mode;
  const transitNoData = mode === 'TRANSIT' && hasRoute && displayMode === 'DRIVING';

  const handleModeToggle = () => {
    setMode(prev => prev === 'TRANSIT' ? 'DRIVING' : 'TRANSIT');
    setExpanded(false);
  };

  const keyStep = hasRoute && route!.usedMode === 'TRANSIT'
    ? route!.steps.find(s => s.mode === 'TRANSIT') ?? null
    : null;

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
    <div className="py-0.5">
      <div className="flex items-center gap-3 px-4 py-0.5">
        <div className="w-10 flex-none" />
        <div className="w-5 flex-none flex justify-center">
          <div className="w-px h-5 border-l border-dashed border-emerald-300" />
        </div>

        {/* Mode toggle */}
        {firstActivity.place && (
          <button
            onClick={handleModeToggle}
            title={
              transitNoData
                ? t('commute.noTransitSwitch')
                : displayMode === 'TRANSIT' ? t('commute.switchToDriving') : t('commute.switchToTransit')
            }
            className="text-[11px] text-emerald-400 hover:text-emerald-700 transition-colors flex-none"
          >
            {displayMode === 'TRANSIT' ? '🚌' : '🚗'}
            {transitNoData && (
              <span className="text-[8px] text-gray-400 ml-0.5">{t('commute.noTransit')}</span>
            )}
          </button>
        )}

        {/* Summary */}
        {!hasRoute ? (
          <span className="flex-1 text-[10px] text-gray-300">
            {firstActivity.place ? t('commute.calculating') : '— —'}
          </span>
        ) : (
          <a
            href={route!.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t('commute.openInMaps')}
            className="flex-1 min-w-0 flex items-center gap-1 hover:text-blue-500 transition-colors"
          >
            {stationInfo && (
              <span className="truncate text-[10px] text-emerald-700">{stationInfo}</span>
            )}
            <span className="flex-none text-[10px] text-emerald-600 tabular-nums">
              {stationInfo ? '· ' : ''}{route!.totalText}
            </span>
            {route!.fareText && (
              <span className="flex-none text-[10px] text-gray-400 ml-0.5">
                · {route!.fareText}
              </span>
            )}
          </a>
        )}

        {hasSteps && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-emerald-300 hover:text-emerald-600 transition-colors flex-none"
            aria-label={expanded ? t('commute.collapseRoute') : t('commute.expandRoute')}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}

        {/* Map toggle */}
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
            title={showMap ? t('commute.collapseMap') : t('commute.viewMap')}
          >
            🗺️
          </button>
        )}

        {hasRoute && (
          <a
            href={route!.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-none text-[12px] text-gray-400 hover:text-blue-500 transition-colors px-0.5"
            title={t('commute.openInMaps')}
          >
            ↗
          </a>
        )}
      </div>

      {/* ── Route preview map ── */}
      {showMap && hasPlaces && originPlace.lat != null && firstActivity.place?.lat != null && (
        <div
          className="mx-4 mt-1.5 mb-0.5 rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
          style={{ aspectRatio: '640/260' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildMapUrl(
              originPlace.lat,
              originPlace.lng!,
              firstActivity.place.lat,
              firstActivity.place.lng!,
              route?.overviewPolyline ?? firstActivity.commutePolyline,
            )}
            alt={t('commute.originMapAlt')}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {expanded && route?.steps && (
        <StepList steps={route.steps} fareText={route.fareText} />
      )}
    </div>
  );
}
