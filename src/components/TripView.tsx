'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTripStore } from '@/store/useTripStore';
import { DayScroller } from './DayScroller';
import { ActivityList } from './ActivityList';
import { ExportModal } from './ExportModal';
import { WishlistDrawer } from './WishlistDrawer';

export function TripView() {
  const trip      = useTripStore((s) => s.trip);
  const addDay    = useTripStore((s) => s.addDay);
  const updateDay = useTripStore((s) => s.updateDay);

  const [activeDayId, setActiveDayId]   = useState<string | null>(null);
  const [isPreview, setIsPreview]       = useState(false);
  const [showExport, setShowExport]     = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);

  const activeDay = trip.days.find((d) => d.id === activeDayId) ?? trip.days[0] ?? null;

  // Keep each day's origin in sync with the previous day's last accommodation.
  // Runs whenever the active day changes OR whenever the previous day's activities change.
  const prevDayIndex = trip.days.findIndex((d) => d.id === activeDay?.id) - 1;
  const prevDayLastAccomPlaceId = trip.days[prevDayIndex]
    ?.activities.filter((a) => !a.isBackup && a.type === 'ACCOMMODATION').at(-1)?.place?.placeId;

  useEffect(() => {
    if (!activeDay) return;
    const dayIndex = trip.days.findIndex((d) => d.id === activeDay.id);
    if (dayIndex <= 0) return;

    const prevDay   = trip.days[dayIndex - 1];
    const withPlace = prevDay.activities.filter((a) => !a.isBackup && a.place);
    if (!withPlace.length) return;

    const lastAccom = [...withPlace].reverse().find((a) => a.type === 'ACCOMMODATION');
    const autoPlace = lastAccom?.place ?? withPlace[withPlace.length - 1].place;
    if (!autoPlace) return;

    if (activeDay.originPlace?.placeId === autoPlace.placeId) return;
    updateDay(activeDay.id, { originPlace: autoPlace });
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    activeDay?.id,
    prevDayLastAccomPlaceId,
  ]);

  const handleAddDay = () => {
    addDay();
    const newDay = useTripStore.getState().trip.days.at(-1);
    if (newDay) setActiveDayId(newDay.id);
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${isPreview ? 'bg-white' : 'bg-gray-50'}`}>
      <div className="w-full max-w-[480px] mx-auto flex-1 flex flex-col">

        {/* Header */}
        <header className="px-4 pt-12 pb-3 flex items-start justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors mb-1 -ml-0.5"
            >
              <span>←</span>
              <span>返回大厅</span>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">{trip.name}</h1>
          </div>
          <div className="flex items-center gap-1 pt-1">
            <button
              onClick={() => setIsPreview((v) => !v)}
              title={isPreview ? '切换编辑模式' : '切换预览模式'}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors ${
                isPreview
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {isPreview ? '✏️' : '👁️'}
            </button>
            <button
              onClick={() => setShowWishlist(true)}
              title="灵感清单"
              className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-base text-gray-500 hover:border-gray-400 transition-colors"
            >
              ✨
            </button>
            <button
              onClick={() => setShowExport(true)}
              title="数据 & 分享"
              className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-base text-gray-500 hover:border-gray-400 transition-colors"
            >
              📤
            </button>
          </div>
        </header>

        <DayScroller
          days={trip.days}
          activeDayId={activeDay?.id ?? null}
          onSelect={setActiveDayId}
          onAddDay={handleAddDay}
          isPreview={isPreview}
        />

        {/* Date + day travel mode row */}
        {activeDay && !isPreview && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white/60">
            <span className="text-xs text-gray-400">📅</span>
            <input
              type="date"
              value={activeDay.date ?? ''}
              onChange={(e) => updateDay(activeDay.id, { date: e.target.value || undefined })}
              className="flex-1 text-xs text-gray-600 bg-transparent outline-none cursor-pointer min-w-0"
            />
            {activeDay.date && (
              <button
                onClick={() => updateDay(activeDay.id, { date: undefined })}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors flex-none"
              >
                ×
              </button>
            )}
            {/* Day-level travel mode toggle — sets the default for all connectors */}
            <div className="flex items-center gap-0.5 flex-none ml-1 bg-gray-100 rounded-full p-0.5">
              {(['TRANSIT', 'DRIVING'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => updateDay(activeDay.id, { travelMode: m })}
                  title={m === 'TRANSIT' ? '当日公共交通' : '当日自驾'}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                    (activeDay.travelMode ?? 'TRANSIT') === m
                      ? 'bg-white text-gray-700 shadow-sm font-medium'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {m === 'TRANSIT' ? '🚌' : '🚗'}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeDay ? (
          <ActivityList
            dayId={activeDay.id}
            activities={activeDay.activities}
            isPreview={isPreview}
            originPlace={activeDay.originPlace}
            originTime={activeDay.originTime}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">点击 + 开始规划第一天</p>
          </div>
        )}
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}

      <WishlistDrawer
        isOpen={showWishlist}
        onClose={() => setShowWishlist(false)}
        activeDayId={activeDay?.id ?? null}
        baseLocation={trip.baseLocation}
      />
    </div>
  );
}
