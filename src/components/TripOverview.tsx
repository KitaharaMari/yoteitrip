'use client';

import type { Day, Trip } from '@/types';
import { useT } from '@/hooks/useT';

const DEFAULT_CONSUMPTION = 8.0;

function defaultFuelPrice(currency: string): number {
  return currency === 'JPY' || currency === 'CNY' ? 170 : 1.85;
}

export interface DayStats {
  drivingKm:     number;
  activityCost:  number;   // user-entered costs in tripCurrency
  fuelCost:      number;   // in tripCurrency
  totalCost:     number;   // activityCost + fuelCost (no transit)
  transitGroups: { currency: string; amount: number }[];  // transit fares grouped by their own currency
  places:        string[];
}

export function computeDayStats(day: Day, tripCurrency: string): DayStats {
  const primary = day.activities.filter((a) => !a.isBackup);

  const activityCost = primary
    .filter((a) => (a.type === 'STAY' || a.type === 'MEAL' || a.type === 'LONG_DISTANCE') && a.estimatedCost != null)
    .reduce((sum, a) => sum + (a.estimatedCost ?? 0), 0);

  // Group transit fares by their own currency label (from API)
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

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function fmt(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function TripOverview({ trip }: { trip: Trip }) {
  const t            = useT();
  const tripCurrency = trip.currency ?? 'USD';
  const allStats     = trip.days.map((d) => computeDayStats(d, tripCurrency));

  const totalDrivingKm  = allStats.reduce((s, st) => s + st.drivingKm, 0);
  const totalUserCost   = allStats.reduce((s, st) => s + st.totalCost, 0);
  const totalPlaces     = trip.days.flatMap((d) =>
    d.activities.filter((a) => !a.isBackup && a.place?.name)
  ).length;

  // Aggregate transit groups across all days
  const transitTotals: Record<string, number> = {};
  for (const st of allStats) {
    for (const { currency, amount } of st.transitGroups) {
      transitTotals[currency] = (transitTotals[currency] ?? 0) + amount;
    }
  }
  const transitSummary = Object.entries(transitTotals).map(([currency, amount]) => ({ currency, amount }));
  const hasBudget = totalUserCost > 0 || transitSummary.length > 0;

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

      {/* ── Per-day cards ── */}
      <div className="flex flex-col gap-2 px-4 mt-3">
        {trip.days.map((day, i) => {
          const st = allStats[i];
          const hasStats = st.drivingKm >= 50 || st.transitGroups.length > 0;
          return (
            <div key={day.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm">

              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900">{day.label}</span>
                  {day.date && <span className="text-[11px] text-gray-400">{shortDate(day.date)}</span>}
                </div>
                {/* Show user cost + transit hint */}
                <div className="flex flex-col items-end gap-0.5">
                  {st.totalCost > 0 && (
                    <span className="text-xs font-semibold tabular-nums" style={{ color: '#3D5568' }}>
                      {fmt(tripCurrency, st.totalCost)}
                    </span>
                  )}
                  {st.transitGroups.filter(g => g.currency !== tripCurrency).map(({ currency, amount }) => (
                    <span key={currency} className="text-[10px] text-gray-400 tabular-nums">
                      +{fmt(currency, amount)}
                    </span>
                  ))}
                </div>
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
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50 flex-wrap">
                  {st.drivingKm >= 50 && (
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      🚗 {st.drivingKm.toFixed(0)} km
                      {st.fuelCost > 0 && ` · ${fmt(tripCurrency, st.fuelCost)}`}
                    </span>
                  )}
                  {st.transitGroups.map(({ currency, amount }) => (
                    <span key={currency} className="text-[10px] text-gray-400 tabular-nums">
                      🚌 {fmt(currency, amount)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
