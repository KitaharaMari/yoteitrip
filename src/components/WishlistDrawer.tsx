'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActivityType, BaseLocation, PlaceDetails, WishlistCategory, WishlistItem } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { haversineKm, formatDist } from '@/lib/haversine';
import { SearchOverlay } from './SearchOverlay';

const TRIP_RADIUS_KM = 1000;

const CATEGORY_META: Record<WishlistCategory, { icon: string; label: string; type: ActivityType }> = {
  RESTAURANT: { icon: '🍽️', label: '餐厅', type: 'MEAL' },
  ATTRACTION: { icon: '🏛️', label: '景点', type: 'STAY' },
  BACKUP:     { icon: '📌', label: '备选', type: 'STAY' },
};

const CATEGORY_ORDER: WishlistCategory[] = ['RESTAURANT', 'ATTRACTION', 'BACKUP'];
const FILTER_OPTIONS = ['ALL', ...CATEGORY_ORDER] as const;
type FilterOption = typeof FILTER_OPTIONS[number];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Day to insert into. Null means global context (dashboard) — hides "加入行程". */
  activeDayId: string | null;
  /** When set, items are split into ≤1000km nearby and farther-away sections. */
  baseLocation?: BaseLocation | null;
}

type NearbyEntry = { item: WishlistItem; distKm: number };

export function WishlistDrawer({ isOpen, onClose, activeDayId, baseLocation }: Props) {
  const wishlist           = useTripStore((s) => s.wishlist);
  const addToWishlist      = useTripStore((s) => s.addToWishlist);
  const removeFromWishlist = useTripStore((s) => s.removeFromWishlist);
  const updateWishlistItem = useTripStore((s) => s.updateWishlistItem);
  const insertActivity     = useTripStore((s) => s.insertActivity);

  const [isSearching, setIsSearching]   = useState(false);
  const [filter, setFilter]             = useState<FilterOption>('ALL');
  const [showOthers, setShowOthers]     = useState(false);
  // Holds a place after SearchOverlay closes — user picks category before it's added.
  const [pendingPlace, setPendingPlace] = useState<PlaceDetails | null>(null);

  const handlePlaceSelect = (place: PlaceDetails) => {
    setIsSearching(false);   // close SearchOverlay first so drawer is visible
    setPendingPlace(place);  // show category picker
  };

  const confirmAdd = (category: WishlistCategory) => {
    if (!pendingPlace) return;
    addToWishlist({ ...pendingPlace, category });
    setPendingPlace(null);
  };

  const handleInsert = (item: WishlistItem) => {
    if (!activeDayId) return;
    insertActivity(activeDayId, null, CATEGORY_META[item.category].type, {
      placeId: item.placeId, name: item.name,
      address: item.address, lat: item.lat, lng: item.lng,
    });
  };

  const cycleCategory = (id: string, current: WishlistCategory) => {
    const next = CATEGORY_ORDER[(CATEGORY_ORDER.indexOf(current) + 1) % CATEGORY_ORDER.length];
    updateWishlistItem(id, { category: next });
  };

  const filtered = filter === 'ALL' ? wishlist : wishlist.filter((i) => i.category === filter);

  // ── Proximity split ───────────────────────────────────────────────────────
  let nearbyItems: NearbyEntry[] = [];
  const otherItems: WishlistItem[] = [];

  if (baseLocation) {
    for (const item of filtered) {
      if (item.lat != null && item.lng != null) {
        const dist = haversineKm(baseLocation.lat, baseLocation.lng, item.lat, item.lng);
        if (dist <= TRIP_RADIUS_KM) {
          nearbyItems.push({ item, distKm: dist });
        } else {
          otherItems.push(item);
        }
      } else {
        otherItems.push(item);
      }
    }
    nearbyItems.sort((a, b) => a.distKm - b.distKm);
  } else {
    // Dashboard / no-base context: show all items without distance filtering
    nearbyItems = filtered.map((item) => ({ item, distKm: 0 }));
  }

  const hasNearby = nearbyItems.length > 0;
  const hasOthers = baseLocation && otherItems.length > 0;

  return (
    <>
      {/* ── Backdrop ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="wishlist-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20"
          />
        )}
      </AnimatePresence>

      {/* ── Sheet ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="wishlist-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col relative overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-none">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-none">
              <div>
                <h2 className="text-base font-semibold text-gray-900">灵感清单</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {wishlist.length} 个收藏
                  {baseLocation && (
                    <span className="text-emerald-500"> · 📍 {baseLocation.name}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSearching(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-xl text-xs font-medium hover:bg-gray-700 active:scale-95 transition-all"
                >
                  + 收藏地点
                </button>
                <button
                  onClick={onClose}
                  aria-label="关闭"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors text-lg"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Category filter */}
            <div className="flex gap-2 px-5 py-3 border-b border-gray-100 flex-none overflow-x-auto">
              {FILTER_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors flex-none ${
                    filter === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat === 'ALL'
                    ? '全部'
                    : `${CATEGORY_META[cat as WishlistCategory].icon} ${CATEGORY_META[cat as WishlistCategory].label}`}
                </button>
              ))}
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
                  <span className="text-4xl">✨</span>
                  <p className="text-sm text-gray-500">还没有收藏地点</p>
                  <p className="text-[11px] text-gray-300">
                    点击上方「收藏地点」搜索添加{'\n'}
                    行程中的附近收藏将自动提醒
                  </p>
                </div>
              ) : (
                <div className="flex flex-col pb-safe-bottom pb-8">

                  {/* ── Nearby / all items ── */}
                  {hasNearby && (
                    <>
                      {/* Section label — only in trip context */}
                      {baseLocation && (
                        <div className="px-5 pt-3 pb-1.5 flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">
                            📍 {baseLocation.name} 附近
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {nearbyItems.length} 个 · 1000km 内
                          </span>
                        </div>
                      )}
                      <div className="divide-y divide-gray-100 px-5">
                        {nearbyItems.map(({ item, distKm }) => (
                          <WishlistItemRow
                            key={item.id}
                            item={item}
                            activeDayId={activeDayId}
                            distKm={baseLocation && distKm > 0 ? distKm : undefined}
                            onInsert={handleInsert}
                            onRemove={() => removeFromWishlist(item.id)}
                            onCycleCategory={() => cycleCategory(item.id, item.category)}
                            onUpdateNote={(note) => updateWishlistItem(item.id, { note })}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* ── Out-of-range items (trip context only, collapsible) ── */}
                  {hasOthers && (
                    <>
                      <button
                        onClick={() => setShowOthers((v) => !v)}
                        className="mx-5 mt-3 mb-0.5 flex items-center gap-2 py-2 px-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors text-left"
                      >
                        <span className="text-[11px] font-medium text-gray-400">🌏 目的地以外</span>
                        <span className="text-[11px] text-gray-300">· {otherItems.length} 个</span>
                        <span className="ml-auto text-[10px] text-gray-300">{showOthers ? '▲' : '▼'}</span>
                      </button>
                      <AnimatePresence>
                        {showOthers && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="divide-y divide-gray-100 px-5 opacity-55">
                              {otherItems.map((item) => (
                                <WishlistItemRow
                                  key={item.id}
                                  item={item}
                                  activeDayId={null}
                                  distKm={undefined}
                                  onInsert={handleInsert}
                                  onRemove={() => removeFromWishlist(item.id)}
                                  onCycleCategory={() => cycleCategory(item.id, item.category)}
                                  onUpdateNote={(note) => updateWishlistItem(item.id, { note })}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                </div>
              )}
            </div>

            {/* ── Category picker overlay (appears after place is selected) ── */}
            <AnimatePresence>
              {pendingPlace && (
                <motion.div
                  key="category-picker"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-10 flex flex-col justify-end bg-black/20 rounded-t-3xl"
                  onClick={() => setPendingPlace(null)}
                >
                  <motion.div
                    initial={{ y: 48, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 48, opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                    className="bg-white rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Place preview */}
                    <div>
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">已选择</p>
                      <p className="text-base font-semibold text-gray-900 leading-tight">{pendingPlace.name}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{pendingPlace.address}</p>
                    </div>

                    <p className="text-sm font-medium text-gray-700">选择类型</p>

                    {/* Two category buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => confirmAdd('ATTRACTION')}
                        className="flex flex-col items-center gap-2 py-5 bg-indigo-50 border-2 border-indigo-100 rounded-2xl hover:border-indigo-300 active:scale-[0.98] transition-all"
                      >
                        <span className="text-2xl leading-none">🏛️</span>
                        <span className="text-sm font-semibold text-indigo-700">景点</span>
                        <span className="text-[10px] text-indigo-400">博物馆 · 公园 · 景区</span>
                      </button>
                      <button
                        onClick={() => confirmAdd('RESTAURANT')}
                        className="flex flex-col items-center gap-2 py-5 bg-orange-50 border-2 border-orange-100 rounded-2xl hover:border-orange-300 active:scale-[0.98] transition-all"
                      >
                        <span className="text-2xl leading-none">🍽️</span>
                        <span className="text-sm font-semibold text-orange-700">餐厅</span>
                        <span className="text-[10px] text-orange-400">餐厅 · 咖啡 · 甜品</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setPendingPlace(null)}
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors text-center"
                    >
                      取消
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen search — adds to wishlist */}
      {isSearching && (
        <SearchOverlay
          onSelect={handlePlaceSelect}
          onClose={() => setIsSearching(false)}
        />
      )}
    </>
  );
}

// ── WishlistItemRow ───────────────────────────────────────────────────────────
interface RowProps {
  item: WishlistItem;
  activeDayId: string | null;
  distKm: number | undefined;
  onInsert: (item: WishlistItem) => void;
  onRemove: () => void;
  onCycleCategory: () => void;
  onUpdateNote: (note: string) => void;
}

function WishlistItemRow({
  item, activeDayId, distKm,
  onInsert, onRemove, onCycleCategory, onUpdateNote,
}: RowProps) {
  const meta = CATEGORY_META[item.category];

  return (
    <div className="py-3.5 flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <button
          onClick={onCycleCategory}
          title="点击切换类型"
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors flex-none mt-0.5"
        >
          {meta.icon} {meta.label}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-gray-800 leading-tight truncate">{item.name}</p>
            {distKm != null && (
              <span className="flex-none text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                {formatDist(distKm)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.address}</p>
        </div>
        <button
          onClick={onRemove}
          aria-label="移除收藏"
          className="flex-none text-gray-200 hover:text-red-400 transition-colors text-xl leading-none mt-0.5"
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="添加备注…"
          value={item.note ?? ''}
          onChange={(e) => onUpdateNote(e.target.value)}
          className="flex-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 outline-none placeholder-gray-300 min-w-0"
        />
        {activeDayId && (
          <button
            onClick={() => onInsert(item)}
            className="flex-none flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[11px] font-medium hover:bg-emerald-600 active:scale-95 transition-all"
          >
            + 加入行程
          </button>
        )}
      </div>
    </div>
  );
}
