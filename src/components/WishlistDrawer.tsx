'use client';

import { useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActivityType, BaseLocation, PlaceDetails, WishlistCategory, WishlistItem } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { useAuthStore } from '@/store/useAuthStore';
import { saveCloudData } from '@/lib/firestore';
import { useT } from '@/hooks/useT';
import { SearchOverlay } from './SearchOverlay';

// ── Category meta (BACKUP kept for displaying legacy items only) ──────────────
const CATEGORY_META: Record<WishlistCategory, { icon: string; labelKey: string; type: ActivityType }> = {
  RESTAURANT: { icon: '🍽️', labelKey: 'wishlist.restaurant', type: 'MEAL' },
  ATTRACTION: { icon: '🏛️', labelKey: 'wishlist.attraction', type: 'STAY' },
  BACKUP:     { icon: '📌', labelKey: 'wishlist.backup',     type: 'STAY' },
};

// BACKUP intentionally excluded — no longer offered for new items
const ACTIVE_CATEGORIES: WishlistCategory[] = ['RESTAURANT', 'ATTRACTION'];
const FILTER_OPTIONS = ['ALL', 'RESTAURANT', 'ATTRACTION'] as const;
type FilterOption = typeof FILTER_OPTIONS[number];
type SortOption   = 'default' | 'name' | 'category' | 'addedAt' | 'country';

const SORT_KEY: Record<SortOption, string> = {
  default:  'wishlist.sortDefault',
  name:     'wishlist.sortName',
  category: 'wishlist.sortCategory',
  addedAt:  'wishlist.sortAddedAt',
  country:  'wishlist.sortCountry',
};

function extractCountry(address: string): string {
  return address.split(',').pop()?.trim() ?? '';
}

function StarRating({ rating, count }: { rating: number; count?: number }) {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="text-amber-400 tracking-tighter">
        {'★'.repeat(full)}
        {half ? '½' : ''}
        <span className="text-gray-200">{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
      </span>
      <span className="text-gray-600 font-medium">{rating.toFixed(1)}</span>
      {count != null && (
        <span className="text-gray-400 text-xs">({count.toLocaleString()})</span>
      )}
    </span>
  );
}

interface Props {
  isOpen:      boolean;
  onClose:     () => void;
  activeDayId: string | null;
  baseLocation?: BaseLocation | null;
}

export function WishlistDrawer({ isOpen, onClose, activeDayId, baseLocation }: Props) {
  const wishlist           = useTripStore((s) => s.wishlist);
  const addToWishlist      = useTripStore((s) => s.addToWishlist);
  const removeFromWishlist = useTripStore((s) => s.removeFromWishlist);
  const updateWishlistItem = useTripStore((s) => s.updateWishlistItem);
  const insertActivity     = useTripStore((s) => s.insertActivity);
  const setLastManualSave  = useTripStore((s) => s.setLastManualSave);
  const user               = useAuthStore((s) => s.user);
  const t                  = useT();

  const [isSearching, setIsSearching]   = useState(false);
  const [filter, setFilter]             = useState<FilterOption>('ALL');
  const [sort, setSort]                 = useState<SortOption>('default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<PlaceDetails | null>(null);
  const [saveState, setSaveState]       = useState<'idle' | 'saving' | 'saved'>('idle');
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  // Multi-select
  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg]       = useState<string | null>(null);

  // ── Cloud save ─────────────────────────────────────────────────────────────
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

  // ── Add place ──────────────────────────────────────────────────────────────
  const handlePlaceSelect = (place: PlaceDetails) => {
    setIsSearching(false);
    setPendingPlace(place);
  };

  const confirmAdd = (category: WishlistCategory) => {
    if (!pendingPlace) return;
    addToWishlist({ ...pendingPlace, category });
    setPendingPlace(null);
  };

  // ── Insert to trip ─────────────────────────────────────────────────────────
  const handleInsert = (item: WishlistItem) => {
    if (!activeDayId) return;
    insertActivity(activeDayId, null, CATEGORY_META[item.category].type, {
      placeId: item.placeId, name: item.name, address: item.address, lat: item.lat, lng: item.lng,
    });
  };

  const cycleCategory = (id: string, current: WishlistCategory) => {
    // Cycle only between the two active categories; BACKUP → ATTRACTION as fallback
    const idx  = ACTIVE_CATEGORIES.indexOf(current as 'RESTAURANT' | 'ATTRACTION');
    const next = idx === -1 ? 'ATTRACTION' : ACTIVE_CATEGORIES[(idx + 1) % ACTIVE_CATEGORIES.length];
    updateWishlistItem(id, { category: next });
  };

  // ── Select mode ────────────────────────────────────────────────────────────
  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
    setDeletingId(null);
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

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

  const bulkCopy = async () => {
    const sep   = t('wishlist.copyItemSep');
    const items: string[] = [];
    let idx = 1;
    for (const id of selected) {
      const item = wishlist.find((i) => i.id === id);
      if (!item) continue;
      items.push(`${idx}. ${item.name} - ${item.address}`);
      idx++;
    }
    const text = t('wishlist.copyHeader') + items.join(sep);
    await navigator.clipboard.writeText(text);
    const msg = t('wishlist.copySuccess');
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  };

  // ── Sorted + filtered list ─────────────────────────────────────────────────
  const filtered = filter === 'ALL' ? wishlist : wishlist.filter((i) => i.category === filter);
  const sorted   = [...filtered].sort((a, b) => {
    if (sort === 'name')     return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (sort === 'category') return ACTIVE_CATEGORIES.indexOf(a.category as 'RESTAURANT'|'ATTRACTION') - ACTIVE_CATEGORIES.indexOf(b.category as 'RESTAURANT'|'ATTRACTION');
    if (sort === 'addedAt')  return (b.addedAt ?? '').localeCompare(a.addedAt ?? '');
    if (sort === 'country')  return extractCountry(a.address).localeCompare(extractCountry(b.address));
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

      {/* ── Sheet (slides from top) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="wishlist-drawer"
            initial={{ y: '-100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 top-0 z-50 bg-white rounded-b-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden"
            // Clicking anywhere in the drawer (that doesn't stop propagation) exits select mode
            onClick={() => { if (selectMode) exitSelectMode(); }}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-none"
              onClick={(e) => e.stopPropagation()} // header clicks don't trigger select-exit
            >
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
                    title="Save wishlist to cloud"
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all ${
                      saveState === 'saved' ? 'bg-green-50 text-green-500'
                      : saveState === 'saving' ? 'bg-gray-50 text-gray-300'
                      : 'text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    {saveState === 'saved' ? '✓' : saveState === 'saving' ? '…' : '💾'}
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label={t('dashboard.cancel')}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors text-lg"
                >
                  ×
                </button>
              </div>
            </div>

            {/* ── Add button ── */}
            <div
              className="px-5 pb-3 flex-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  if (selectMode) { exitSelectMode(); return; }
                  setIsSearching(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-gray-700 active:scale-[0.98] transition-all"
              >
                <span className="text-base leading-none">+</span>
                {t('wishlist.addPlace')}
              </button>
            </div>

            {/* ── Filter + Sort row ── */}
            <div
              className="flex items-center gap-2 px-5 pb-3 border-b border-gray-100 flex-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-1.5 flex-1 overflow-x-auto no-scrollbar">
                {FILTER_OPTIONS.map((cat) => (
                  <button key={cat} onClick={() => setFilter(cat)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors flex-none ${
                      filter === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {cat === 'ALL'
                      ? t('wishlist.all')
                      : `${CATEGORY_META[cat].icon} ${t(CATEGORY_META[cat].labelKey)}`}
                  </button>
                ))}
              </div>

              {/* Sort dropdown */}
              <div className="relative flex-none">
                <button
                  onClick={() => setShowSortMenu((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  ↕ {t(SORT_KEY[sort])}
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[108px]">
                      {(Object.keys(SORT_KEY) as SortOption[]).map((s) => (
                        <button key={s}
                          onClick={() => { setSort(s); setShowSortMenu(false); }}
                          className={`flex items-center justify-between w-full px-4 py-2.5 text-xs text-left transition-colors ${
                            sort === s ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {t(SORT_KEY[s])}
                          {sort === s && <span className="text-emerald-500">✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Content (list) ── */}
            {/* Clicking empty space in this area exits select mode (onClick bubbles to outer drawer div) */}
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
                    // stopPropagation in select mode prevents outer drawer's onClick from exiting select mode
                    <div
                      key={item.id}
                      onClick={(e) => { if (selectMode) e.stopPropagation(); }}
                    >
                      <WishlistItemRow
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
                    </div>
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
                  className="absolute inset-x-0 bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center gap-2 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button onClick={exitSelectMode}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors flex-none">
                    {t('wishlist.cancel')}
                  </button>
                  <span className="text-xs text-gray-400 flex-1 text-center">
                    {t('wishlist.selected')} · {selected.size}
                  </span>
                  {selected.size > 0 && (
                    <button
                      onClick={bulkCopy}
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-none"
                    >
                      {t('wishlist.copySelected')}
                    </button>
                  )}
                  {activeDayId && selected.size > 0 && (
                    <button onClick={bulkInsert}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all flex-none">
                      + {t('wishlist.addToTrip')}
                    </button>
                  )}
                  {selected.size > 0 && (
                    <button onClick={bulkDelete}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-red-400 hover:bg-red-500 active:scale-95 transition-all flex-none">
                      ✕
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Place Detail: centered fixed modal (above the drawer) ── */}
      <AnimatePresence>
        {pendingPlace && (
          <motion.div
            key="place-detail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-5 bg-black/55"
            onClick={() => setPendingPlace(null)}
          >
            <motion.div
              key="place-detail-card"
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
              style={{ maxHeight: '80dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1">
                {/* Photo */}
                {pendingPlace.photoUrl && (
                  <div className="w-full" style={{ aspectRatio: '16/9' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pendingPlace.photoUrl}
                      alt={pendingPlace.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Info block */}
                <div className="px-5 pt-4 pb-3">
                  <h2 className="text-base font-bold text-gray-900 leading-snug">{pendingPlace.name}</h2>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{pendingPlace.address}</p>

                  {/* Rating + review count + Maps link */}
                  <div className="flex items-center justify-between mt-3">
                    {pendingPlace.rating != null && (
                      <StarRating rating={pendingPlace.rating} count={pendingPlace.userRatingsTotal} />
                    )}
                    {pendingPlace.googleMapsUrl && (
                      <a
                        href={pendingPlace.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors ml-auto"
                      >
                        {t('wishlist.viewOnMaps')}
                      </a>
                    )}
                  </div>

                  {/* AI editorial summary */}
                  {pendingPlace.editorialSummary && (
                    <p className="text-[13px] text-gray-600 mt-3 leading-relaxed">
                      {pendingPlace.editorialSummary}
                    </p>
                  )}
                </div>
              </div>

              {/* Fixed footer: category buttons */}
              <div className="px-5 pt-2 pb-5 border-t border-gray-50 flex-none">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5 text-center">
                  {t('wishlist.selectType')}
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => confirmAdd('ATTRACTION')}
                    className="flex flex-col items-center gap-1.5 py-4 bg-indigo-50 border-2 border-indigo-100 rounded-2xl hover:border-indigo-300 active:scale-[0.98] transition-all"
                  >
                    <span className="text-xl leading-none">🏛️</span>
                    <span className="text-xs font-semibold text-indigo-700">{t('wishlist.attraction')}</span>
                    <span className="text-[9px] text-indigo-400">{t('wishlist.museumHint')}</span>
                  </button>
                  <button
                    onClick={() => confirmAdd('RESTAURANT')}
                    className="flex flex-col items-center gap-1.5 py-4 bg-orange-50 border-2 border-orange-100 rounded-2xl hover:border-orange-300 active:scale-[0.98] transition-all"
                  >
                    <span className="text-xl leading-none">🍽️</span>
                    <span className="text-xs font-semibold text-orange-700">{t('wishlist.restaurant')}</span>
                    <span className="text-[9px] text-orange-400">{t('wishlist.cafeHint')}</span>
                  </button>
                </div>
                <button
                  onClick={() => setPendingPlace(null)}
                  className="w-full mt-2.5 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {t('wishlist.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast notification (copy success) ── */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key="wishlist-toast"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            transition={{ duration: 0.22 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] bg-gray-900/95 text-white text-xs font-medium rounded-full px-5 py-3 shadow-xl whitespace-nowrap pointer-events-none"
          >
            ✓ {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full-screen search overlay ── */}
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
  const startLongPress = () => { longPressTimer.current = setTimeout(() => onLongPress(), 400); };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  if (isDeleting) {
    return (
      <div className="py-3.5 flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 flex-1">{t('wishlist.confirmDeleteQ')}</span>
          <button onClick={onCancelDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            {t('wishlist.cancel')}
          </button>
          <button onClick={onConfirmDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all">
            {t('wishlist.confirmDeleteBtn')}
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
      onClick={isSelectMode ? onToggleSelect : undefined}
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

        {/* Category badge */}
        {!isSelectMode ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCycleCategory(); }}
            title={t('wishlist.cycleType')}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors flex-none mt-0.5"
          >
            {meta.icon} {t(meta.labelKey)}
          </button>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-400 flex-none mt-0.5">
            {meta.icon} {t(meta.labelKey)}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 leading-tight truncate">{item.name}</p>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.address}</p>
        </div>

        {!isSelectMode && (
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            aria-label={t('wishlist.removeItem')}
            className="flex-none text-gray-200 hover:text-red-400 transition-colors text-xl leading-none mt-0.5"
          >
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
            <button
              onClick={() => onInsert(item)}
              className="flex-none flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[11px] font-medium hover:bg-emerald-600 active:scale-95 transition-all"
            >
              {t('wishlist.addToTrip')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
