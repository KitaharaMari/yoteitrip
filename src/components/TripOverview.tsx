'use client';

import type { Day, Trip } from '@/types';
import { useT } from '@/hooks/useT';

const DEFAULT_CONSUMPTION = 8.0;

function defaultFuelPrice(currency: string): number {
  return currency === 'JPY' || currency === 'CNY' ? 170 : 1.85;
}

export interface DayStats {
  drivingKm: number;
  transitCost: number;
  activityCost: number;
  fuelCost: number;
  totalCost: number;
  currency: string;
  places: string[];
}

export function computeDayStats(day: Day, tripCurrency: string): DayStats {
  const primary = day.activities.filter((a) => !a.isBackup);

  const activityCost = primary
    .filter((a) => (a.type === 'STAY' || a.type === 'MEAL') && a.estimatedCost != null)
    .reduce((sum, a) => sum + (a.estimatedCost ?? 0), 0);

  const transitCost = primary
    .filter((a) => a.transitFare != null)
    .reduce((sum, a) => sum + (a.transitFare ?? 0), 0);

  const currency =
    primary.find((a) => a.transitFareCurrency)?.transitFareCurrency ?? tripCurrency;

  const drivingMeters = primary.reduce((s, a) => s + (a.commuteDrivingMeters ?? 0), 0);
  const drivingKm = drivingMeters / 1000;

  let fuelCost = 0;
  if (drivingKm >= 50) {
    const consumption = day.carSettings?.consumption ?? DEFAULT_CONSUMPTION;
    const fuelPrice = day.carSettings?.fuelPrice ?? defaultFuelPrice(tripCurrency);
    fuelCost = (drivingKm / 100) * consumption * fuelPrice;
  }

  const places = primary
    .filter((a) => a.place?.name && a.type !== 'LONG_DISTANCE' && a.type !== 'TRANSPORT')
    .map((a) => a.place!.name);

  return { drivingKm, transitCost, activityCost, fuelCost, totalCost: activityCost + transitCost + fuelCost, currency, places };
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function TripOverview({ trip }: { trip: Trip }) {
  const t = useT();
  const tripCurrency = trip.currency ?? 'USD';
  const allStats = trip.days.map((d) => computeDayStats(d, tripCurrency));

  const totalDrivingKm = allStats.reduce((s, st) => s + st.drivingKm, 0);
  const totalBudget    = allStats.reduce((s, st) => s + st.totalCost, 0);
  const totalPlaces    = trip.days.flatMap((d) =>
    d.activities.filter((a) => !a.isBackup && a.place?.name)
  ).length;

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
      {totalBudget > 0 && (
        <div className="mx-4 mt-2 bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('overview.budget')}</span>
          <span className="text-base font-bold text-gray-900 tabular-nums">
            {tripCurrency} {totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}

      {/* ── Per-day cards ── */}
      <div className="flex flex-col gap-2 px-4 mt-3">
        {trip.days.map((day, i) => {
          const st = allStats[i];
          const hasStats = st.drivingKm >= 50 || st.transitCost > 0;
          return (
            <div key={day.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">

              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900">{day.label}</span>
                  {day.date && <span className="text-[11px] text-gray-400">{shortDate(day.date)}</span>}
                </div>
                {st.totalCost > 0 && (
                  <span className="text-xs font-semibold tabular-nums" style={{ color: '#3D5568' }}>
                    {st.currency} {st.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>

              {/* Origin */}
              {day.originPlace && (
                <p className="text-[11px] mt-1.5" style={{ color: '#47BB8E' }}>
                  📍 {t('overview.departure')} {day.originPlace.name}
                </p>
              )}

              {/* Places */}
              {st.places.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  {st.places.join(' · ')}
                </p>
              )}

              {/* Stats footer */}
              {hasStats && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50">
                  {st.drivingKm >= 50 && (
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      🚗 {st.drivingKm.toFixed(0)} km
                      {st.fuelCost > 0 && ` · ${st.currency} ${st.fuelCost.toFixed(0)}`}
                    </span>
                  )}
                  {st.transitCost > 0 && (
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      🚌 {st.currency} {st.transitCost.toFixed(0)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
