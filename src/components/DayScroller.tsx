'use client';

import type { Day } from '@/types';
import { useT } from '@/hooks/useT';
import { useLangStore } from '@/store/useLangStore';

interface Props {
  days:             Day[];
  activeDayId:      string | null;
  onSelect:         (id: string) => void;
  onAddDay:         () => void;
  showOverview:     boolean;
  onSelectOverview: () => void;
}

export function DayScroller({ days, activeDayId, onSelect, onAddDay, showOverview, onSelectOverview }: Props) {
  const t    = useT();
  const lang = useLangStore((s) => s.lang);

  const shortDate = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar">

        {/* 总览 tab */}
        <button
          onClick={onSelectOverview}
          className={`flex-none px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            showOverview
              ? 'text-white'
              : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
          }`}
          style={showOverview ? { backgroundColor: '#47BB8E' } : undefined}
        >
          {t('trip.overview')}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 flex-none" />

        {/* Day tabs */}
        {days.map((day) => {
          const isActive = !showOverview && activeDayId === day.id;
          return (
            <button
              key={day.id}
              onClick={() => { onSelect(day.id); }}
              className={`flex-none flex flex-col items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
              }`}
            >
              <span>{day.label}</span>
              {day.date && (
                <span className={`text-[9px] mt-0.5 font-normal ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                  {shortDate(day.date)}
                </span>
              )}
            </button>
          );
        })}

        <button
          onClick={onAddDay}
          aria-label="添加天数"
          className="flex-none ml-1 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 text-lg leading-none hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}
