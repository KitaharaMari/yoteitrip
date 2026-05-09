'use client';

import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Activity } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { ACTIVITY_META } from '@/lib/constants';
import { getOpenStatus } from '@/lib/openingHours';
import { TimeInput } from './TimeInput';
import { DurationPicker } from './DurationPicker';

interface Props {
  activity: Activity;
  dayId: string;
  onEdit: () => void;       // opens SearchOverlay
  isFirst?: boolean;
  isPreview?: boolean;
  dragHandleListeners?: DraggableSyntheticListeners;
  backupCount?: number;
  isBackupOpen?: boolean;
  onToggleBackup?: () => void;
}

function fmt(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="2.5"  r="1.5" /><circle cx="7.5" cy="2.5"  r="1.5" />
      <circle cx="2.5" cy="7"    r="1.5" /><circle cx="7.5" cy="7"    r="1.5" />
      <circle cx="2.5" cy="11.5" r="1.5" /><circle cx="7.5" cy="11.5" r="1.5" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <circle cx="5" cy="2" r="1.2" /><circle cx="2" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" />
      <line x1="5" y1="3.2" x2="5" y2="5.5" />
      <line x1="5" y1="5.5" x2="2" y2="6.8" />
      <line x1="5" y1="5.5" x2="8" y2="6.8" />
    </svg>
  );
}

export function ActivityCard({
  activity, dayId, onEdit, isFirst, isPreview,
  dragHandleListeners, backupCount, isBackupOpen, onToggleBackup,
}: Props) {
  const updateActivity = useTripStore((s) => s.updateActivity);
  const deleteActivity = useTripStore((s) => s.deleteActivity);
  const currency       = useTripStore((s) => s.trip.currency ?? 'CAD');
  // Read the day's date for day-of-week aware opening-hours checks
  const dayDate        = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.date);

  const meta           = ACTIVITY_META[activity.type];
  const isLongDistance = activity.type === 'LONG_DISTANCE';
  const hour           = parseInt(activity.startTime.split(':')[0], 10);
  const isLate         = hour >= 23;

  const isRegularPlace = activity.type === 'STAY' || activity.type === 'MEAL' || activity.type === 'ACCOMMODATION';

  const showTimeInput      = !isPreview && (isFirst || activity.type === 'TRANSPORT' || isLongDistance);
  const showDurationPicker = !isPreview && (isRegularPlace || isLongDistance);
  const showBudget         = !isPreview && (activity.type === 'STAY' || activity.type === 'MEAL');
  const showFork           = !isPreview && !!onToggleBackup;
  const showDescription    = !isPreview || !!activity.description;
  const showTypeSwitcher   = !isPreview && isRegularPlace;
  const showPlaceInfo      = isRegularPlace && !!activity.place &&
    (!!activity.place.editorialSummary || activity.place.rating != null);

  // Opening-hours status — only relevant for STAY / MEAL
  const hoursStatus = (activity.type === 'STAY' || activity.type === 'MEAL')
    ? getOpenStatus(activity.place?.openingHours, dayDate, activity.startTime)
    : 'UNKNOWN' as const;

  return (
    <div className={`relative rounded-2xl border shadow-sm flex flex-col transition-colors ${
      isLongDistance ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'
    }`}>

      {/* ── Opening-hours badge (top-right corner) ── */}
      {hoursStatus === 'CLOSED' && (
        <span className="absolute top-2 right-2 z-10 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 pointer-events-none">
          ⚠️ Closed at this time
        </span>
      )}
      {hoursStatus === 'CLOSES_SOON' && (
        <span className="absolute top-2 right-2 z-10 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 pointer-events-none">
          🕒 Closes soon
        </span>
      )}
      {/* ── Main row ────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">

        {dragHandleListeners && (
          <button
            {...(dragHandleListeners as Record<string, React.EventHandler<React.SyntheticEvent>>)}
            className="touch-none cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400 flex-none transition-colors"
            aria-label="拖拽排序"
          >
            <GripIcon />
          </button>
        )}

        {showTimeInput ? (
          <TimeInput
            value={activity.startTime}
            onChange={(t) => updateActivity(dayId, activity.id, { startTime: t, isManualTime: true })}
            isLate={isLate}
          />
        ) : (
          <span className={`font-mono text-xs w-10 flex-none tabular-nums ${isLate ? 'text-orange-400' : 'text-gray-400'}`}>
            {activity.startTime}
          </span>
        )}

        <span className="text-base leading-none flex-none w-5 text-center" aria-label={meta.label}>
          {meta.icon}
        </span>

        {/* ── Place name: clicking opens SearchOverlay ── */}
        {isPreview ? (
          <div className="flex-1 min-w-0">
            <p className={`text-sm truncate leading-tight ${
              activity.place?.name ? (isLongDistance ? 'text-blue-800' : 'text-gray-800') : 'text-gray-300'
            }`}>
              {activity.place?.name ?? '未设置地点'}
            </p>
            {activity.place?.address && (
              <p className="text-[10px] text-gray-400 truncate mt-0.5">{activity.place.address}</p>
            )}
          </div>
        ) : (
          <button onClick={onEdit} className="flex-1 min-w-0 text-left">
            <p className={`text-sm truncate leading-tight ${
              activity.place?.name
                ? (isLongDistance ? 'text-blue-800' : 'text-gray-800')
                : 'text-gray-300'
            }`}>
              {activity.place?.name ?? '点击搜索地点…'}
            </p>
            {activity.place?.address && (
              <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-none">
                {activity.place.address}
              </p>
            )}
          </button>
        )}

        {showBudget && (
          <div className="flex items-center gap-0.5 flex-none">
            <span className="text-[10px] text-gray-300">{currency}</span>
            <input
              type="number" min="0" step="1" placeholder="—"
              value={activity.estimatedCost ?? ''}
              onChange={(e) => {
                const c = e.target.value === '' ? undefined : parseFloat(e.target.value);
                updateActivity(dayId, activity.id, { estimatedCost: c == null || isNaN(c) ? undefined : c });
              }}
              className="w-10 text-xs text-right bg-transparent outline-none placeholder-gray-300 tabular-nums text-gray-400"
            />
          </div>
        )}
        {isPreview && activity.estimatedCost != null && (
          <span className="text-xs text-gray-400 flex-none tabular-nums">
            {currency} {activity.estimatedCost}
          </span>
        )}

        {showDurationPicker ? (
          <DurationPicker
            value={activity.duration}
            onChange={(d) => updateActivity(dayId, activity.id, { duration: d })}
          />
        ) : (
          <span className="text-xs text-gray-400 flex-none">{fmt(activity.duration)}</span>
        )}

        {!isPreview && (
          <button
            onClick={() => deleteActivity(dayId, activity.id)}
            aria-label="删除"
            className="flex-none text-gray-200 hover:text-red-400 transition-colors text-xl leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Place info: rating + editorial summary + Google Maps link ── */}
      {showPlaceInfo && (
        <div className="flex items-start gap-2.5 px-3 pb-1.5 -mt-0.5">
          <div className="w-10 flex-none" />
          <div className="w-5 flex-none" />
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {activity.place!.rating != null && (
              <span className="text-[10px] text-amber-500 font-medium tabular-nums">
                ★ {activity.place!.rating.toFixed(1)}
              </span>
            )}
            {activity.place!.editorialSummary && (
              <p
                className="text-[10px] text-gray-400 leading-snug"
                style={{
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                }}
              >
                {activity.place!.editorialSummary}
              </p>
            )}
          </div>
          {/* Google Maps link — uses Places API canonical URL if available,
              falls back to Maps search with name + place_id (both required) */}
          <a
            href={
              activity.place!.googleMapsUrl ??
              `https://www.google.com/maps/search/?api=1` +
              `&query=${encodeURIComponent(activity.place!.name)}` +
              `&query_place_id=${activity.place!.placeId}`
            }
            target="_blank"
            rel="noopener noreferrer"
            title="在谷歌地图中查看此地点"
            className="flex-none text-[11px] text-gray-300 hover:text-blue-500 transition-colors px-0.5 mt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        </div>
      )}

      {/* ── Type switcher: 景点 / 餐饮 / 住宿 ── */}
      {showTypeSwitcher && (
        <div className="flex items-center gap-2.5 px-3 pb-2 -mt-0.5">
          <div className="w-10 flex-none" />
          <div className="w-5 flex-none" />
          <div className="flex gap-1">
            {(['STAY', 'MEAL', 'ACCOMMODATION'] as const).map((t) => {
              const m      = ACTIVITY_META[t];
              const active = t === activity.type;
              return (
                <button
                  key={t}
                  onClick={() => { if (!active) updateActivity(dayId, activity.id, { type: t }); }}
                  className={`flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
                    active
                      ? 'bg-gray-100 text-gray-700'
                      : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Description row (aligned under icon column) ── */}
      {showDescription && (
        <div className="flex gap-2.5 px-3 pb-2 -mt-0.5">
          {/* spacers matching time + icon widths above */}
          <div className="w-10 flex-none" />
          <div className="w-5 flex-none" />
          {isPreview ? (
            activity.description && (
              <p className="text-xs text-gray-500 flex-1">{activity.description}</p>
            )
          ) : (
            <input
              type="text"
              placeholder="添加备注…"
              value={activity.description ?? ''}
              onChange={(e) => updateActivity(dayId, activity.id, { description: e.target.value })}
              className="flex-1 text-xs text-gray-400 bg-transparent outline-none placeholder-gray-200 min-w-0"
            />
          )}
        </div>
      )}

      {/* ── Plan B toggle ── */}
      {showFork && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleBackup!(); }}
          className={`flex items-center gap-1.5 px-3 pb-2 text-[9px] self-end transition-colors ${
            isBackupOpen ? 'text-gray-500' : backupCount ? 'text-blue-400 hover:text-blue-600' : 'text-gray-300 hover:text-gray-500'
          }`}
        >
          <ForkIcon />
          <span>{backupCount ? `方案 B · ${backupCount}` : '方案 B'}</span>
        </button>
      )}
    </div>
  );
}
