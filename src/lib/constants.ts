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

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string }> = {
  TRANSPORT:     { label: '交通',   icon: '✈️' },
  STAY:          { label: '景点',   icon: '📍' },
  MEAL:          { label: '餐饮',   icon: '🍽️' },
  ACCOMMODATION: { label: '住宿',   icon: '🏨' },
  LONG_DISTANCE: { label: '经停点', icon: '🚏' },
};
