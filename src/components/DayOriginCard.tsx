'use client';

import type { PlaceDetails } from '@/types';
import { TimeInput } from './TimeInput';

interface Props {
  originPlace?: PlaceDetails;
  originTime?: string;
  onEditPlace: () => void;
  onUpdateTime: (time: string) => void;
}

export function DayOriginCard({ originPlace, originTime, onEditPlace, onUpdateTime }: Props) {
  const time = originTime ?? '08:00';

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm px-3 py-3 flex items-center gap-2.5">
      <TimeInput value={time} onChange={onUpdateTime} />
      <span className="text-base w-5 text-center leading-none flex-none">🏠</span>
      <button onClick={onEditPlace} className="flex-1 min-w-0 text-left">
        <p className={`text-sm truncate leading-tight ${originPlace ? 'text-emerald-800' : 'text-gray-300'}`}>
          {originPlace?.name ?? '点击设置出发地...'}
        </p>
        {originPlace?.address && (
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{originPlace.address}</p>
        )}
      </button>
      <span className="flex-none text-[9px] uppercase tracking-wider text-emerald-500">出发</span>
    </div>
  );
}
