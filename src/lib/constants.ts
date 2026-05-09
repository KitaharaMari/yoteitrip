import type { ActivityType } from '@/types';

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string }> = {
  TRANSPORT:     { label: '交通',   icon: '✈️' },
  STAY:          { label: '景点',   icon: '📍' },
  MEAL:          { label: '餐饮',   icon: '🍽️' },
  ACCOMMODATION: { label: '住宿',   icon: '🏨' },
  LONG_DISTANCE: { label: '长途',   icon: '🚌' },
};
