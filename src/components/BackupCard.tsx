'use client';

import type { Activity, SceneTag } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { ACTIVITY_META } from '@/lib/constants';
import { ALL_SCENE_TAGS, SCENE_TAG_META } from '@/lib/sceneTags';

interface Props {
  backup: Activity;
  primaryId: string;
  dayId: string;
  isHighlighted: boolean;
  onEdit: () => void;
  onSetPreferred: () => void;
}

export function BackupCard({ backup, dayId, isHighlighted, onEdit, onSetPreferred }: Props) {
  const updateActivity  = useTripStore((s) => s.updateActivity);
  const removeBackupActivity = useTripStore((s) => s.removeBackupActivity);

  const meta = ACTIVITY_META[backup.type];
  const name = backup.place?.name || backup.title;

  const toggleTag = (tag: SceneTag) => {
    const current = backup.sceneTags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    updateActivity(dayId, backup.id, { sceneTags: next });
  };

  return (
    // layoutId lives on the wrapper in BackupSlot — this inner div is just styling
    <div
      className={`rounded-xl border px-3 py-2.5 flex flex-col gap-2 transition-all ${
        isHighlighted
          ? 'bg-amber-50 border-amber-200 shadow-sm'
          : 'bg-gray-50/80 border-gray-100'
      }`}
    >
      {/* Scene-tag chips */}
      <div className="flex gap-1 flex-wrap">
        {ALL_SCENE_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              backup.sceneTags?.includes(tag)
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-400 border border-gray-200 hover:border-gray-400'
            }`}
          >
            {SCENE_TAG_META[tag].icon} {SCENE_TAG_META[tag].label}
          </button>
        ))}
      </div>

      {/* Activity info row */}
      <div className="flex items-center gap-2">
        <span className="text-sm leading-none flex-none">{meta.icon}</span>

        <button onClick={onEdit} className="flex-1 min-w-0 text-left">
          <span className={`text-xs truncate block ${name ? 'text-gray-700' : 'text-gray-300'}`}>
            {name || '选择地点...'}
          </span>
        </button>

        {/* Set as preferred */}
        <button
          onClick={onSetPreferred}
          className="flex-none text-[10px] px-2.5 py-1 rounded-full bg-gray-900 text-white hover:bg-gray-600 transition-colors whitespace-nowrap"
        >
          设为首选 ↑
        </button>

        {/* Remove */}
        <button
          onClick={() => removeBackupActivity(dayId, backup.id)}
          className="flex-none text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
          aria-label="删除备案"
        >
          ×
        </button>
      </div>
    </div>
  );
}
