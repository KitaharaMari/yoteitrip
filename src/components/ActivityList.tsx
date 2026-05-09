'use client';

import { useState } from 'react';
import {
  DndContext, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { LayoutGroup, motion } from 'framer-motion';
import type { Activity, ActivityType, PlaceDetails, WishlistCategory, WishlistItem } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { ACTIVITY_META } from '@/lib/constants';
import { haversineKm, formatDist } from '@/lib/haversine';
import { DayStatsBar } from './DayStatsBar';
import { SortableActivityItem } from './SortableActivityItem';
import { CommuteConnector } from './CommuteConnector';
import { BackupSlot } from './BackupSlot';
import { SearchOverlay } from './SearchOverlay';
import { DayOriginCard } from './DayOriginCard';
import { OriginConnector } from './OriginConnector';
import { DayWeatherBar } from './DayWeatherBar';

interface Props {
  dayId: string;
  activities: Activity[];
  originPlace?: PlaceDetails;
  originTime?: string;
  onOpenWishlist?: () => void;
}

const REGULAR_TYPES: ActivityType[] = ['STAY', 'MEAL', 'ACCOMMODATION'];

const CATEGORY_TO_TYPE: Record<WishlistCategory, ActivityType> = {
  RESTAURANT: 'MEAL',
  ATTRACTION: 'STAY',
  BACKUP:     'STAY',
};

export function ActivityList({ dayId, activities, originPlace, originTime, onOpenWishlist }: Props) {
  const addActivity       = useTripStore((s) => s.addActivity);
  const insertActivity    = useTripStore((s) => s.insertActivity);
  const updateActivity    = useTripStore((s) => s.updateActivity);
  const reorderActivities = useTripStore((s) => s.reorderActivities);
  const setPreferred      = useTripStore((s) => s.setPreferred);
  const updateDay         = useTripStore((s) => s.updateDay);
  const currency          = useTripStore((s) => s.trip.currency ?? 'CAD');
  const wishlist          = useTripStore((s) => s.wishlist);
  const carSettings       = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.carSettings);
  const dayDate           = useTripStore((s) => s.trip.days.find((d) => d.id === dayId)?.date);
  const baseLocation      = useTripStore((s) => s.trip.baseLocation);

  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [openBackupId, setOpenBackupId]   = useState<string | null>(null);

  const primaryActivities = activities.filter((a) => !a.isBackup);
  const getBackups        = (id: string) => activities.filter((a) => a.isBackup && a.linkedToId === id);
  const firstActivity     = primaryActivities[0];

  // ── DnD ─────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = primaryActivities.findIndex((a) => a.id === String(active.id));
    const to   = primaryActivities.findIndex((a) => a.id === String(over.id));
    if (from !== -1 && to !== -1) reorderActivities(dayId, from, to);
  };

  // ── Place selection ──────────────────────────────────────────────────────
  const handlePlaceSelect = (place: PlaceDetails) => {
    if (editingOrigin) {
      updateDay(dayId, { originPlace: place });
      setEditingOrigin(false);
      return;
    }
    if (!editingId) return;
    // Auto-sync title to place name for export compatibility
    updateActivity(dayId, editingId, { place, title: place.name });
    setEditingId(null);
  };

  const handleCloseSearch = () => {
    setEditingId(null);
    setEditingOrigin(false);
  };

  // ── Plan B swap ──────────────────────────────────────────────────────────
  const handleSetPreferred = (primaryId: string, backupId: string) => {
    setPreferred(dayId, primaryId, backupId);
    setOpenBackupId(backupId);
  };

  // ── Search anchor for geofencing ─────────────────────────────────────────
  // Priority: edited activity's existing coords
  //        → last placed primary activity (most recent context)
  //        → day origin place
  //        → trip's declared baseLocation (city anchor)
  const editedPlace    = editingId ? activities.find((a) => a.id === editingId)?.place : undefined;
  const lastWithCoords = [...primaryActivities].reverse()
    .find((a) => a.place?.lat != null && a.place?.lng != null)?.place;
  const anchorLat  = editedPlace?.lat  ?? lastWithCoords?.lat  ?? originPlace?.lat  ?? baseLocation?.lat;
  const anchorLng  = editedPlace?.lng  ?? lastWithCoords?.lng  ?? originPlace?.lng  ?? baseLocation?.lng;
  // Include the trip's city name so SearchOverlay can show it in the placeholder.
  const anchorName = baseLocation?.name;
  const searchAnchor = anchorLat != null && anchorLng != null
    ? { lat: anchorLat, lng: anchorLng, name: anchorName }
    : null;

  // ── Budget ───────────────────────────────────────────────────────────────
  const activityCost = primaryActivities
    .filter((a) => (a.type === 'STAY' || a.type === 'MEAL') && a.estimatedCost != null)
    .reduce((sum, a) => sum + (a.estimatedCost ?? 0), 0);

  // Transit fares are auto-filled by CommuteConnector / OriginConnector from Directions API.
  const transitCost = primaryActivities
    .filter((a) => a.transitFare != null)
    .reduce((sum, a) => sum + (a.transitFare ?? 0), 0);

  // Use the fare's own currency label (e.g. "¥", "JPY") rather than trip.currency so the
  // summary matches what each connector displays. Falls back to trip.currency only when absent.
  const transitCurrencyLabel =
    primaryActivities.find((a) => a.transitFareCurrency)?.transitFareCurrency ?? currency;

  const hasBudget = activityCost > 0 || transitCost > 0;

  // Driving distance — summed from all activities' persisted commuteDrivingMeters.
  const totalDrivingMeters = primaryActivities.reduce(
    (sum, a) => sum + (a.commuteDrivingMeters ?? 0), 0,
  );

  return (
    <>
      {(editingId || editingOrigin) && (
        <SearchOverlay
          onSelect={handlePlaceSelect}
          onClose={handleCloseSearch}
          searchAnchor={searchAnchor}
        />
      )}

      <div className="flex-1 flex flex-col pb-safe-bottom">
        <div className="flex flex-col px-4 pt-4 gap-0">

          {/* ── Day origin card ─────────────────────────────────── */}
          <DayOriginCard
            originPlace={originPlace}
            originTime={originTime}
            onEditPlace={() => setEditingOrigin(true)}
            onUpdateTime={(t) => updateDay(dayId, { originTime: t })}
          />

          {/* ── Weather bar — only when date + origin coords are known ── */}
          {dayDate && originPlace?.lat != null && (
            <DayWeatherBar
              date={dayDate}
              originPlace={originPlace}
              activities={activities}
            />
          )}

          {/* Connector from origin → first activity (only when both have places) */}
          {originPlace && firstActivity && (
            <OriginConnector
              originPlace={originPlace}
              originTime={originTime ?? '08:00'}
              firstActivity={firstActivity}
              dayId={dayId}
            />
          )}

          {/* ── Card stack with DnD ─────────────────────────────── */}
          {/* Issue fix: removed `layout` from motion.div — it conflicts with
              dnd-kit's inline transforms and causes cards to snap back after drop.
              `layoutId` alone is sufficient for the Plan B FLIP swap animation. */}
          <LayoutGroup>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={primaryActivities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col">
                  {primaryActivities.length === 0 ? (
                    <EmptyState />
                  ) : (
                    primaryActivities.map((activity, index) => {
                      const backups    = getBackups(activity.id);
                      const isSlotOpen = openBackupId === activity.id;

                      return (
                        <div key={activity.id}>
                          {/* Regular commute connector between adjacent primary activities */}
                          {index > 0 && (
                            <CommuteConnector
                              prevActivity={primaryActivities[index - 1]}
                              nextActivity={activity}
                              dayId={dayId}
                            />
                          )}

                          {/* Primary card — layoutId only (no layout) to avoid DnD conflict */}
                          <motion.div
                            layoutId={`card-${activity.id}`}
                            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                          >
                            <SortableActivityItem
                              activity={activity}
                              dayId={dayId}
                              onEdit={() => setEditingId(activity.id)}
                              isFirst={index === 0}
                              backupCount={backups.length}
                              isBackupOpen={isSlotOpen}
                              onToggleBackup={() =>
                                setOpenBackupId(isSlotOpen ? null : activity.id)
                              }
                            />
                          </motion.div>

                          {/* Quick-pick chips for unset accommodation cards */}
                          {activity.type === 'ACCOMMODATION' && !activity.place && (
                            <AccommodationQuickPick
                              originPlace={originPlace}
                              otherAccomPlaces={primaryActivities
                                .filter((a) => a.type === 'ACCOMMODATION' && a.id !== activity.id && !!a.place)
                                .map((a) => a.place!)}
                              onSelect={(place) =>
                                updateActivity(dayId, activity.id, { place, title: place.name })
                              }
                            />
                          )}

                          <BackupSlot
                            primaryId={activity.id}
                            backups={backups}
                            dayId={dayId}
                            isOpen={isSlotOpen}
                            openSearchFor={(id) => setEditingId(id)}
                            onSetPreferred={handleSetPreferred}
                          />

                          <ProximityBubbles
                              activity={activity}
                              wishlist={wishlist}
                              onInsert={(item) =>
                                insertActivity(
                                  dayId,
                                  activity.id,
                                  CATEGORY_TO_TYPE[item.category],
                                  { placeId: item.placeId, name: item.name, address: item.address, lat: item.lat, lng: item.lng },
                                )
                              }
                            />
                        </div>
                      );
                    })
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </LayoutGroup>
        </div>

        {/* Budget summary — activity costs + transit fares */}
        {hasBudget && (
          <div className="mx-4 mt-4 rounded-2xl border border-gray-100 overflow-hidden text-sm">
            {activityCost > 0 && (
              <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">景点 &amp; 餐饮</span>
                <span className="tabular-nums text-gray-700">
                  {currency} {activityCost.toLocaleString()}
                </span>
              </div>
            )}
            {transitCost > 0 && (
              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">🚌 公共交通票价</span>
                <span className="tabular-nums text-gray-700">
                  {transitCurrencyLabel} {transitCost.toLocaleString()}
                </span>
              </div>
            )}
            {/* Show grand total only when both categories exist */}
            <div className={`px-4 py-3 flex items-center justify-between ${
              activityCost > 0 && transitCost > 0 ? 'bg-white border-t border-gray-100' : 'bg-gray-50'
            }`}>
              <span className="text-xs font-medium text-gray-600">
                {activityCost > 0 && transitCost > 0 ? '当日合计' : '当天预估费用'}
              </span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {activityCost > 0 ? currency : transitCurrencyLabel} {(activityCost + transitCost).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Driving fuel stats */}
        <DayStatsBar
          dayId={dayId}
          totalDrivingMeters={totalDrivingMeters}
          carSettings={carSettings}
          currency={currency}
        />

        {/* Add-module section */}
        <div className="px-4 pt-5 pb-8 flex flex-col gap-3">
            <p className="text-[11px] uppercase tracking-widest text-gray-400">添加模块</p>

            <div className="grid grid-cols-3 gap-2">
              {REGULAR_TYPES.map((type) => {
                const meta = ACTIVITY_META[type];
                return (
                  <button key={type} onClick={() => addActivity(dayId, type)}
                    className="flex flex-col items-center gap-1.5 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-300 active:scale-95 transition-all"
                  >
                    <span className="text-xl leading-none">{meta.icon}</span>
                    <span className="text-[10px] text-gray-500">{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <button onClick={() => addActivity(dayId, 'LONG_DISTANCE')}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 rounded-2xl border border-blue-100 hover:border-blue-300 active:scale-[0.99] transition-all"
            >
              <span className="text-xl leading-none">🚌</span>
              <div className="text-left">
                <p className="text-sm font-medium text-blue-800">城际移动</p>
                <p className="text-[11px] text-blue-400 mt-0.5">渡轮 · 大巴 · 飞机 · 火车 · 自驾</p>
              </div>
              <span className="ml-auto text-blue-300 text-sm">+</span>
            </button>

            {onOpenWishlist && (
              <button
                onClick={onOpenWishlist}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-300 active:scale-[0.99] transition-all"
              >
                <span className="text-xl leading-none">✨</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-700">从灵感清单选择</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">一键加入已收藏的景点与餐厅</p>
                </div>
                <span className="ml-auto text-gray-300 text-sm">›</span>
              </button>
            )}
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-12 text-center gap-2">
      <span className="text-3xl">🗺️</span>
      <p className="text-sm text-gray-400">从下方添加第一个行程模块</p>
    </div>
  );
}

// ── Accommodation quick-pick ──────────────────────────────────────────────────
// When a new ACCOMMODATION card has no place yet, show one-tap chips for:
//   1. The day's origin place (e.g. returning to today's departure hotel)
//   2. Any other accommodation on the same day that already has a place set
function AccommodationQuickPick({
  originPlace,
  otherAccomPlaces,
  onSelect,
}: {
  originPlace?: PlaceDetails;
  otherAccomPlaces: PlaceDetails[];
  onSelect: (place: PlaceDetails) => void;
}) {
  const candidates: Array<{ place: PlaceDetails; icon: string }> = [];

  if (originPlace?.name) {
    candidates.push({ place: originPlace, icon: '📍' });
  }
  for (const p of otherAccomPlaces) {
    candidates.push({ place: p, icon: '🏨' });
  }
  if (candidates.length === 0) return null;

  return (
    <div className="ml-[52px] mr-0 mt-1 mb-1.5 flex flex-wrap gap-1">
      {candidates.map((c) => (
        <button
          key={c.place.placeId ?? c.place.name}
          onClick={() => onSelect(c.place)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-[11px] text-indigo-700 hover:bg-indigo-100 active:scale-[0.98] transition-all"
        >
          <span>{c.icon}</span>
          <span className="truncate max-w-[120px]">{c.place.name}</span>
          <span className="text-indigo-300 ml-0.5">↩</span>
        </button>
      ))}
    </div>
  );
}

function ProximityBubbles({
  activity, wishlist, onInsert,
}: {
  activity: Activity;
  wishlist: WishlistItem[];
  onInsert: (item: WishlistItem) => void;
}) {
  if (!activity.place?.lat || !activity.place?.lng) return null;

  const { lat, lng } = activity.place as { lat: number; lng: number };

  const nearby = wishlist
    .filter((item) => item.lat != null && item.lng != null)
    // Skip the exact same place (already an activity here)
    .filter((item) => item.placeId !== activity.place?.placeId)
    .map((item) => ({ item, distKm: haversineKm(lat, lng, item.lat!, item.lng!) }))
    // Skip items at essentially the same location (< 10 m) and items beyond 3 km
    .filter(({ distKm }) => distKm > 0.01 && distKm < 3)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 3);

  if (!nearby.length) return null;

  return (
    <div className="ml-[52px] mr-0 mb-1 mt-0.5 flex flex-col gap-1">
      {nearby.map(({ item, distKm }) => (
        <button
          key={item.id}
          onClick={() => onInsert(item)}
          className="flex items-center gap-1.5 text-left px-2.5 py-1.5 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 hover:bg-amber-100 active:scale-[0.98] transition-all"
        >
          <span className="flex-none">📍</span>
          <span className="font-medium truncate min-w-0">{item.name}</span>
          <span className="flex-none text-amber-500 ml-0.5">(距此 {formatDist(distKm)})</span>
          <span className="ml-auto flex-none text-amber-600 font-medium">+ 加入</span>
        </button>
      ))}
    </div>
  );
}
