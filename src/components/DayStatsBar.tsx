'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CarSettings } from '@/types';
import { useTripStore } from '@/store/useTripStore';

interface Props {
  dayId: string;
  totalDrivingMeters: number;
  carSettings: CarSettings | undefined;
  currency: string;
}

const DEFAULT_CONSUMPTION = 8.0; // L/100km

function defaultFuelPrice(currency: string): number {
  return currency === 'JPY' || currency === 'CNY' ? 170 : 1.85;
}

function currencySymbol(currency: string): string {
  if (currency === 'JPY' || currency === 'CNY') return '¥';
  if (currency === 'EUR') return '€';
  if (currency === 'GBP') return '£';
  return '$';
}

export function DayStatsBar({ dayId, totalDrivingMeters, carSettings, currency }: Props) {
  const updateDay  = useTripStore((s) => s.updateDay);
  const [isEditing, setIsEditing] = useState(false);

  if (totalDrivingMeters === 0) return null;

  const km          = totalDrivingMeters / 1000;
  const sym         = currencySymbol(currency);
  const consumption = carSettings?.consumption ?? DEFAULT_CONSUMPTION;
  const fuelPrice   = carSettings?.fuelPrice   ?? defaultFuelPrice(currency);
  const isShortTrip = km < 50;
  const needsRefuel = km > 450;
  const liters      = (km / 100) * consumption;
  const cost        = liters * fuelPrice;

  const save = (next: Partial<CarSettings>) =>
    updateDay(dayId, { carSettings: { consumption, fuelPrice, ...next } });

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-orange-100 overflow-hidden text-sm bg-orange-50/60">

      {/* ── Main row ── */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <span className="text-xs flex-none">🚗</span>

        <span className={`tabular-nums text-xs font-medium flex-none ${needsRefuel ? 'text-orange-600' : 'text-gray-700'}`}>
          {isShortTrip ? '< 50km' : `${km.toFixed(1)} km`}
        </span>

        {needsRefuel && (
          <span className="text-sm leading-none flex-none" title="当日里程较长，建议中途加油">
            ⛽
          </span>
        )}

        {!isShortTrip && (
          <>
            <span className="text-orange-200 text-xs">·</span>
            <span className="text-xs text-gray-500 tabular-nums flex-none">
              {liters.toFixed(1)} L
            </span>
            <span className="text-orange-200 text-xs">·</span>
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="text-xs text-gray-700 tabular-nums hover:text-orange-600 transition-colors font-medium flex-none"
              title="点击调整油耗参数"
            >
              {sym} {cost.toFixed(2)}
            </button>
          </>
        )}

        <span className="ml-auto text-[10px] text-orange-300 flex-none">油费估算</span>

        {!isShortTrip && (
          <button
            onClick={() => setIsEditing((v) => !v)}
            className="text-[11px] text-orange-300 hover:text-orange-600 transition-colors flex-none"
            title="调整参数"
          >
            {isEditing ? '▲' : '✎'}
          </button>
        )}
      </div>

      {/* ── Edit panel ── */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 bg-white border-t border-orange-100 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400 w-14 flex-none">油耗</span>
                <input
                  type="number" min="1" max="40" step="0.1"
                  value={consumption}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n) && n > 0) save({ consumption: n });
                  }}
                  className="w-16 text-xs text-right bg-gray-50 rounded-lg px-2 py-1.5 outline-none tabular-nums border border-gray-100 focus:border-orange-200"
                />
                <span className="text-[11px] text-gray-400">L/100km</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400 w-14 flex-none">油价</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-400">{sym}</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={fuelPrice}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (!isNaN(n) && n >= 0) save({ fuelPrice: n });
                    }}
                    className="w-16 text-xs text-right bg-gray-50 rounded-lg px-2 py-1.5 outline-none tabular-nums border border-gray-100 focus:border-orange-200"
                  />
                  <span className="text-[11px] text-gray-400">/升</span>
                </div>
                {carSettings && (
                  <button
                    onClick={() => { updateDay(dayId, { carSettings: undefined }); setIsEditing(false); }}
                    className="ml-auto text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    重置默认
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
