'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Activity, ActivityType, SceneTag } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { ACTIVITY_META } from '@/lib/constants';
import { useT } from '@/hooks/useT';
import { ALL_SCENE_TAGS, SCENE_TAG_META } from '@/lib/sceneTags';
import { BackupCard } from './BackupCard';

interface Props {
  primaryId: string;
  backups: Activity[];
  dayId: string;
  isOpen: boolean;
  openSearchFor: (activityId: string) => void;
  onSetPreferred: (primaryId: string, backupId: string) => void;
}

const BACKUP_TYPES: ActivityType[] = ['STAY', 'MEAL', 'TRANSPORT', 'LONG_DISTANCE'];

export function BackupSlot({
  primaryId,
  backups,
  dayId,
  isOpen,
  openSearchFor,
  onSetPreferred,
}: Props) {
  const addBackupActivity = useTripStore((s) => s.addBackupActivity);
  const t = useT();
  const [activeTag, setActiveTag] = useState<SceneTag | null>(null);

  const tagsInUse = ALL_SCENE_TAGS.filter((t) =>
    backups.some((b) => b.sceneTags?.includes(t))
  );

  const filteredBackups =
    activeTag ? backups.filter((b) => b.sceneTags?.includes(activeTag)) : backups;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="slot"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          {/* Left border visually connects slot to the primary card above */}
          <div className="ml-5 border-l-2 border-dashed border-gray-200 pl-3 pb-3 pt-1 flex flex-col gap-2">

            {/* Scene-tag filter bar — only shown when backups actually carry tags */}
            {tagsInUse.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[9px] text-gray-400 uppercase tracking-wider">场景筛选</span>
                {tagsInUse.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                      activeTag === tag
                        ? 'bg-gray-800 text-white'
                        : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {SCENE_TAG_META[tag].icon} {SCENE_TAG_META[tag].label}
                  </button>
                ))}
                {activeTag && (
                  <button
                    onClick={() => setActiveTag(null)}
                    className="text-[9px] text-gray-400 hover:text-gray-700 underline transition-colors"
                  >
                    清除
                  </button>
                )}
              </div>
            )}

            {/* Backup cards — each with a layoutId for the FLIP swap animation */}
            {filteredBackups.map((backup) => (
              <motion.div
                key={backup.id}
                layoutId={`card-${backup.id}`}
                layout
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <BackupCard
                  backup={backup}
                  primaryId={primaryId}
                  dayId={dayId}
                  isHighlighted={
                    activeTag !== null && (backup.sceneTags?.includes(activeTag) ?? false)
                  }
                  onEdit={() => openSearchFor(backup.id)}
                  onSetPreferred={() => onSetPreferred(primaryId, backup.id)}
                />
              </motion.div>
            ))}

            {/* Add backup buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {BACKUP_TYPES.map((type) => {
                const meta = ACTIVITY_META[type];
                return (
                  <button
                    key={type}
                    onClick={() => addBackupActivity(dayId, primaryId, type)}
                    className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-500 hover:border-gray-400 transition-colors"
                  >
                    {meta.icon} {t(meta.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
