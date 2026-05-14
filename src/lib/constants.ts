import type { ActivityType } from '@/types';

export const CURRENCIES: { code: string; symbol: string }[] = [
  { code: 'CAD', symbol: '$' },
  { code: 'USD', symbol: '$' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CNY', symbol: '¥' },
  { code: 'EUR', symbol: '€' },
  { code: 'TWD', symbol: 'NT$' },
  { code: 'HKD', symbol: 'HK$' },
  { code: 'GBP', symbol: '£' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'KRW', symbol: '₩' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'THB', symbol: '฿' },
];

export const ACTIVITY_META: Record<ActivityType, { labelKey: string; icon: string }> = {
  TRANSPORT:     { labelKey: 'type.TRANSPORT',     icon: '✈️' },
  STAY:          { labelKey: 'type.STAY',          icon: '📍' },
  MEAL:          { labelKey: 'type.MEAL',          icon: '🍽️' },
  ACCOMMODATION: { labelKey: 'type.ACCOMMODATION', icon: '🏨' },
  LONG_DISTANCE: { labelKey: 'type.LONG_DISTANCE', icon: '🚏' },
};
