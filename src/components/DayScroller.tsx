'use client';

import type { Day } from '@/types';

interface Props {
  days: Day[];
  activeDayId: string | null;
  onSelect: (id: string) => void;
  onAddDay: () => void;
  isPreview: boolean;
}

function shortDate(iso: string): string {
  // Parse as local date to avoid UTC-shift (e.g. "2024-12-25" → "12月25日")
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function DayScroller({ days, activeDayId, onSelect, onAddDay, isPreview }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar">
        {days.map((day) => {
          const isActive = activeDayId === day.id;
          return (
            <button
              key={day.id}
              onClick={() => onSelect(day.id)}
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

        {!isPreview && (
          <button
            onClick={onAddDay}
            aria-label="添加天数"
            className="flex-none ml-1 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 text-lg leading-none hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
