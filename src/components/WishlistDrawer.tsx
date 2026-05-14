'use client';

import { useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActivityType, BaseLocation, PlaceDetails, WishlistCategory, WishlistItem } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { useAuthStore } from '@/store/useAuthStore';
import { saveCloudData } from '@/lib/firestore';
import { useT } from '@/hooks/useT';
import { SearchOverlay } from './SearchOverlay';

const CATEGORY_META: Record<WishlistCategory, { icon: string; label: string; type: ActivityType }> = {
  RESTAURANT: { icon: '🍽️', label: '餐厅', type: 'MEAL' },
  ATTRACTION: { icon: '🏛️', label: '景点', type: 'STAY' },
  BACKUP:     { icon: '📌', label: '备选', type: 'STAY' },
};

const CATEGORY_ORDER: WishlistCategory[] = ['RESTAURANT', 'ATTRACTION', 'BACKUP'];
const FILTER_OPTIONS = ['ALL', ...CATEGORY_ORDER] as const;
type FilterOption = typeof FILTER_OPTIONS[number];
type SortOption   = 'default' | 'name' | 'category';

const SORT_LABELS: Record<SortOption, string> = {
  default:  '默认',
  name:     '名称',
  category: '类型',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeDayId: string | null;
  baseLocation?: BaseLocation | null;
}

export function WishlistDrawer({ isOpen, onClose, activeDayId, baseLocation }: Props) {
  const wishlist            = useTripStore((s) => s.wishlist);
  const addToWishlist       = useTripStore((s) => s.addToWishlist);
  const removeFromWishlist  = useTripStore((s) => s.removeFromWishlist);
  const updateWishlistItem  = useTripStore((s) => s.updateWishlistItem);
  const insertActivity      = useTripStore((s) => s.insertActivity);
  const setLastManualSave   = useTripStore((s) => s.setLastManualSave);
  const user                = useAuthStore((s) => s.user);
  const t                   = useT();

  const [isSearching, setIsSearching]   = useState(false);
  const [filter, setFilter]             = useState<FilterOption>('ALL');
  const [sort, setSort]                 = useState<SortOption>('default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<PlaceDetails | null>(null);
  const [saveState, setSaveState]       = useState<'idle' | 'saving' | 'saved'>('idle');

  // Delete confirmation: stores id of item pending confirmation
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  // Multi-select
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  // ── Cloud save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || saveState === 'saving') return;
    setSaveState('saving');
    const { trips, currentTripId, wishlist: w } = useTripStore.getState();
    const now = new Date().toISOString();
    try {
      await saveCloudData(user.uid, { trips, currentTripId, wishlist: w, savedAt: now, manualSavedAt: now });
      setLastManualSave(now);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch { setSaveState('idle'); }
  };

  // ── Add place ─────────────────────────────────────────────────────────────────
  const handlePlaceSelect = (place: PlaceDetails) => {
    setIsSearching(false);
    setPendingPlace(place);
  };
  const confirmAdd = (category: WishlistCategory) => {
    if (!pendingPlace) return;
    addToWishlist({ ...pendingPlace, category });
    setPendingPlace(null);
  };

  // ── Insert to trip ────────────────────────────────────────────────────────────
  const handleInsert = (item: WishlistItem) => {
    if (!activeDayId) return;
    insertActivity(activeDayId, null, CATEGORY_META[item.category].type, {
      placeId: item.placeId, name: item.name, address: item.address, lat: item.lat, lng: item.lng,
    });
  };

  const cycleCategory = (id: string, current: WishlistCategory) => {
    const next = CATEGORY_ORDER[(CATEGORY_ORDER.indexOf(current) + 1) % CATEGORY_ORDER.length];
    updateWishlistItem(id, { category: next });
  };

  // ── Selection mode ────────────────────────────────────────────────────────────
  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
    setDeletingId(null);
  }, []);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkDelete = () => {
    selected.forEach((id) => removeFromWishlist(id));
    exitSelectMode();
  };

  const bulkInsert = () => {
    if (!activeDayId) return;
    selected.forEach((id) => {
      const item = wishlist.find((i) => i.id === id);
      if (item) handleInsert(item);
    });
    exitSelectMode();
  };

  // ── Sorted + filtered list ────────────────────────────────────────────────────
  const filtered = filter === 'ALL' ? wishlist : wishlist.filter((i) => i.category === filter);
  const sorted   = [...filtered].sort((a, b) => {
    if (sort === 'name')     return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (sort === 'category') return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return 0;
  });

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
            <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-none">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('wishlist.title')}</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {t('wishlist.count', { n: wishlist.length })}
                  {baseLocation && <span className="text-emerald-500"> · 📍 {baseLocation.name}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {user && (
                  <button
                    onClick={handleSave}
                    disabled={saveState === 'saving'}
                    title="保存种草名单到云端"
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all ${
                      saveState === 'saved' ? 'bg-green-50 text-green-500'
                      : saveState === 'saving' ? 'bg-gray-50 text-gray-300'
                      : 'text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    {saveState === 'saved' ? '✓' : saveState === 'saving' ? '…' : '💾'}
                  </button>
                )}
                <button onClick={onClose} aria-label="关闭"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors text-lg">
                  ×
                </button>
              </div>
            </div>

            {/* Add button */}
            <div className="px-5 pb-3 flex-none">
              <button
                onClick={() => setIsSearching(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-gray-700 active:scale-[0.98] transition-all"
              >
                <span className="text-base leading-none">+</span>
                {t('wishlist.addPlace')}
              </button>
            </div>

            {/* Filter + Sort row */}
            <div className="flex items-center gap-2 px-5 pb-3 border-b border-gray-100 flex-none">
              <div className="flex gap-1.5 flex-1 overflow-x-auto">
                {FILTER_OPTIONS.map((cat) => (
                  <button key={cat} onClick={() => setFilter(cat)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex-none ${
                      filter === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {cat === 'ALL' ? t('wishlist.all')
                      : cat === 'RESTAURANT' ? `${CATEGORY_META[cat].icon} ${t('wishlist.restaurant')}`
                      : cat === 'ATTRACTION' ? `${CATEGORY_META[cat].icon} ${t('wishlist.attraction')}`
                      : `${CATEGORY_META[cat as WishlistCategory].icon} ${t('wishlist.backup')}`}
                  </button>
                ))}
              </div>

              {/* Sort dropdown */}
              <div className="relative flex-none">
                <button
                  onClick={() => setShowSortMenu((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  ↕ {SORT_LABELS[sort]}
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[96px]">
                      {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
                        <button key={s}
                          onClick={() => { setSort(s); setShowSortMenu(false); }}
                          className={`flex items-center justify-between w-full px-4 py-2.5 text-xs text-left transition-colors ${
                            sort === s ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {SORT_LABELS[s]}
                          {sort === s && <span className="text-emerald-500">✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto">
              {sorted.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
                  <span className="text-4xl">✨</span>
                  <p className="text-sm text-gray-500">{t('wishlist.empty')}</p>
                  <p className="text-[11px] text-gray-300">{t('wishlist.emptyHint')}</p>
                </div>
              ) : (
                <div className={`divide-y divide-gray-100 px-5 ${selectMode ? 'pb-24' : 'pb-safe-bottom pb-8'}`}>
                  {sorted.map((item) => (
                    <WishlistItemRow
                      key={item.id}
                      item={item}
                      activeDayId={activeDayId}
                      isSelectMode={selectMode}
                      isSelected={selected.has(item.id)}
                      isDeleting={deletingId === item.id}
                      onInsert={handleInsert}
                      onRequestDelete={() => { setDeletingId(item.id); }}
                      onConfirmDelete={() => { removeFromWishlist(item.id); setDeletingId(null); }}
                      onCancelDelete={() => setDeletingId(null)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      onLongPress={() => enterSelectMode(item.id)}
                      onCycleCategory={() => cycleCategory(item.id, item.category)}
                      onUpdateNote={(note) => updateWishlistItem(item.id, { note })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Multi-select action bar ── */}
            <AnimatePresence>
              {selectMode && (
                <motion.div
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 80, opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="absolute inset-x-0 bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center gap-2 pb-safe-bottom shadow-lg"
                >
                  <button onClick={exitSelectMode}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                    取消
                  </button>
                  <span className="text-xs text-gray-400 flex-1 text-center">已选 {selected.size} 项</span>
                  {activeDayId && selected.size > 0 && (
                    <button onClick={bulkInsert}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all">
                      + 加入行程
                    </button>
                  )}
                  {selected.size > 0 && (
                    <button onClick={bulkDelete}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all">
                      删除 {selected.size} 项
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Category picker overlay ── */}
            <AnimatePresence>
              {pendingPlace && (
                <motion.div key="category-picker"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-10 flex flex-col justify-end bg-black/20 rounded-t-3xl"
                  onClick={() => setPendingPlace(null)}
                >
                  <motion.div
                    initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                    className="bg-white rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">{t('wishlist.selected')}</p>
                      <p className="text-base font-semibold text-gray-900 leading-tight">{pendingPlace.name}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{pendingPlace.address}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-700">{t('wishlist.selectType')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => confirmAdd('ATTRACTION')}
                        className="flex flex-col items-center gap-2 py-5 bg-indigo-50 border-2 border-indigo-100 rounded-2xl hover:border-indigo-300 active:scale-[0.98] transition-all">
                        <span className="text-2xl leading-none">🏛️</span>
                        <span className="text-sm font-semibold text-indigo-700">{t('wishlist.attraction')}</span>
                        <span className="text-[10px] text-indigo-400">{t('wishlist.museumHint')}</span>
                      </button>
                      <button onClick={() => confirmAdd('RESTAURANT')}
                        className="flex flex-col items-center gap-2 py-5 bg-orange-50 border-2 border-orange-100 rounded-2xl hover:border-orange-300 active:scale-[0.98] transition-all">
                        <span className="text-2xl leading-none">🍽️</span>
                        <span className="text-sm font-semibold text-orange-700">{t('wishlist.restaurant')}</span>
                        <span className="text-[10px] text-orange-400">{t('wishlist.cafeHint')}</span>
                      </button>
                    </div>
                    <button onClick={() => setPendingPlace(null)}
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors text-center">
                      {t('wishlist.cancel')}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen search */}
      {isSearching && (
        <SearchOverlay onSelect={handlePlaceSelect} onClose={() => setIsSearching(false)} />
      )}
    </>
  );
}

// ── WishlistItemRow ───────────────────────────────────────────────────────────
interface RowProps {
  item:            WishlistItem;
  activeDayId:     string | null;
  isSelectMode:    boolean;
  isSelected:      boolean;
  isDeleting:      boolean;
  onInsert:        (item: WishlistItem) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete:  () => void;
  onToggleSelect:  () => void;
  onLongPress:     () => void;
  onCycleCategory: () => void;
  onUpdateNote:    (note: string) => void;
}

function WishlistItemRow({
  item, activeDayId, isSelectMode, isSelected, isDeleting,
  onInsert, onRequestDelete, onConfirmDelete, onCancelDelete,
  onToggleSelect, onLongPress, onCycleCategory, onUpdateNote,
}: RowProps) {
  const meta = CATEGORY_META[item.category];
  const t    = useT();

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => onLongPress(), 400);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handleRowClick = () => {
    if (isSelectMode) onToggleSelect();
  };

  if (isDeleting) {
    return (
      <div className="py-3.5 flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 flex-1">确认删除此条目？</span>
          <button onClick={onCancelDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            取消
          </button>
          <button onClick={onConfirmDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all">
            确认删除
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`py-3.5 flex flex-col gap-2.5 transition-colors ${
        isSelectMode ? 'cursor-pointer' : ''
      } ${isSelected ? 'bg-emerald-50/60 -mx-5 px-5 rounded-xl' : ''}`}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onClick={handleRowClick}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox in select mode */}
        {isSelectMode && (
          <div className={`w-5 h-5 rounded-full border-2 flex-none mt-0.5 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
          }`}>
            {isSelected && <span className="text-white text-[10px]">✓</span>}
          </div>
        )}

        {/* Category badge — disabled in select mode */}
        {!isSelectMode && (
          <button onClick={(e) => { e.stopPropagation(); onCycleCategory(); }}
            title="点击切换类型"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors flex-none mt-0.5">
            {meta.icon} {meta.label}
          </button>
        )}
        {isSelectMode && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-400 flex-none mt-0.5">
            {meta.icon} {meta.label}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 leading-tight truncate">{item.name}</p>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.address}</p>
        </div>

        {!isSelectMode && (
          <button onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            aria-label="移除收藏"
            className="flex-none text-gray-200 hover:text-red-400 transition-colors text-xl leading-none mt-0.5">
            ×
          </button>
        )}
      </div>

      {!isSelectMode && (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder={t('wishlist.notePlaceholder')}
            value={item.note ?? ''}
            onChange={(e) => onUpdateNote(e.target.value)}
            className="flex-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 outline-none placeholder-gray-300 min-w-0"
          />
          {activeDayId && (
            <button onClick={() => onInsert(item)}
              className="flex-none flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[11px] font-medium hover:bg-emerald-600 active:scale-95 transition-all">
              {t('wishlist.addToTrip')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
