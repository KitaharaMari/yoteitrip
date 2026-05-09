'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Activity } from '@/types';
import { ActivityCard } from './ActivityCard';

interface Props {
  activity: Activity;
  dayId: string;
  onEdit: () => void;
  isFirst: boolean;
  isPreview: boolean;
  backupCount?: number;
  isBackupOpen?: boolean;
  onToggleBackup?: () => void;
}

export function SortableActivityItem({
  activity, dayId, onEdit, isFirst, isPreview,
  backupCount, isBackupOpen, onToggleBackup,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: activity.id, disabled: isPreview });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={isDragging ? 'opacity-50 z-10 relative' : ''}
    >
      <ActivityCard
        activity={activity}
        dayId={dayId}
        onEdit={onEdit}
        isFirst={isFirst}
        isPreview={isPreview}
        dragHandleListeners={isPreview ? undefined : (listeners as DraggableSyntheticListeners)}
        backupCount={backupCount}
        isBackupOpen={isBackupOpen}
        onToggleBackup={onToggleBackup}
      />
    </div>
  );
}
