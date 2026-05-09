import type { SceneTag } from '@/types';

export const SCENE_TAG_META: Record<SceneTag, { icon: string; label: string }> = {
  INDOOR:     { icon: '🌧️', label: '室内备选' },
  REST:       { icon: '☕',  label: '休息点'   },
  LATE_START: { icon: '🚗', label: '较晚出发' },
};

export const ALL_SCENE_TAGS: SceneTag[] = ['INDOOR', 'REST', 'LATE_START'];
