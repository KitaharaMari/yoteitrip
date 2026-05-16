'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useTripStore } from '@/store/useTripStore';
import { useT } from '@/hooks/useT';
import { useMapsLoaded } from './MapProvider';
import { WishlistDrawer } from './WishlistDrawer';
import { UserMenu } from './UserMenu';
import { AuthModal } from './AuthModal';
import type { BaseLocation, Trip } from '@/types';

// ── Colour palette cycling by trip index ─────────────────────────────────────
const GRADIENTS = [
  ['#47BB8E', '#3DAF80'],  // brand green   ← YoteiTrip primary
  ['#3D5568', '#2E4254'],  // brand dark    ← YoteiTrip secondary
  ['#6366f1', '#4f46e5'],  // indigo
  ['#f59e0b', '#d97706'],  // amber
  ['#ec4899', '#db2777'],  // pink
  ['#8b5cf6', '#7c3aed'],  // violet
  ['#06b6d4', '#0284c7'],  // cyan-blue
  ['#f97316', '#ea580c'],  // orange
];

function gradientFor(idx: number) {
  const [a, b] = GRADIENTS[idx % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

// ── Fetch the first photo URL for a Google Places result ─────────────────────
function extractPhotoUrl(photos: google.maps.places.PlacePhoto[] | undefined): string | null {
  if (!photos?.length) return null;
  try {
    return photos[0].getUrl({ maxWidth: 800, maxHeight: 500 });
  } catch {
    return null;
  }
}

// ── Convert a remote image URL → compressed Base64 via Canvas ────────────────
// Uses crossOrigin=anonymous so the canvas isn't tainted; returns null on error.
function urlToBase64(url: string, maxW = 960, maxH = 540, quality = 0.82): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale   = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
        const canvas  = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth  * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);  // canvas tainted (CORS) — caller falls back to raw URL
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── TripCard ─────────────────────────────────────────────────────────────────
function TripCard({
  trip, index, onDelete, onChangeCover,
}: {
  trip: Trip;
  index: number;
  onDelete: (trip: Trip) => void;
  onChangeCover: (trip: Trip) => void;
}) {
  const router          = useRouter();
  const setCurrentTrip  = useTripStore((s) => s.setCurrentTrip);
  const renameTrip      = useTripStore((s) => s.renameTrip);
  const setCoverPhoto   = useTripStore((s) => s.setCoverPhoto);
  const t               = useT();

  const [hovered, setHovered]       = useState(false);
  const [renaming, setRenaming]     = useState(false);
  const [nameInput, setNameInput]   = useState(trip.name);
  const [coverFailed, setCoverFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // When the stored cover URL expires (Google photo_reference has TTL), auto-heal:
  // search for the city photo again, convert to Base64, and update the store.
  const handleCoverError = async () => {
    setCoverFailed(true);
    if (!trip.baseLocation || !window.google?.maps?.places) return;
    try {
      const service = new google.maps.places.PlacesService(document.createElement('div'));
      service.textSearch({ query: trip.baseLocation.name }, async (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) return;
        const rawUrl = results[0].photos?.[0]?.getUrl({ maxWidth: 800, maxHeight: 500 });
        if (!rawUrl) return;
        const b64 = await urlToBase64(rawUrl);
        if (b64) {
          setCoverPhoto(trip.id, b64);
          setCoverFailed(false);
        }
      });
    } catch {
      // gradient fallback stays in place
    }
  };

  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);

  const commitRename = () => {
    const name = nameInput.trim();
    if (name && name !== trip.name) renameTrip(trip.id, name);
    else setNameInput(trip.name);
    setRenaming(false);
  };

  const handleOpen = () => {
    if (renaming) return;
    setCurrentTrip(trip.id);
    router.push(`/trip/${trip.id}`);
  };

  const totalDays = trip.days.length;

  const totalDrivingKm = Math.round(
    trip.days.reduce((sum, day) =>
      sum + day.activities
        .filter((a) => !a.isBackup)
        .reduce((s, a) => s + (a.commuteDrivingMeters ?? 0), 0),
      0) / 1000,
  );

  const firstDate = trip.days[0]?.date;
  const shortStartDate = firstDate
    ? new Date(firstDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  // Relative time computed inside TripCard so it can use t()
  const relativeTime = (iso: string): string => {
    const diff    = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours   = Math.floor(diff / 3_600_000);
    const days    = Math.floor(diff / 86_400_000);
    if (minutes < 2)  return t('dashboard.justNow');
    if (hours < 1)    return t('dashboard.minutesAgo', { n: minutes });
    if (hours < 24)   return t('dashboard.hoursAgo', { n: hours });
    if (days === 1)   return t('dashboard.yesterday');
    if (days < 7)     return t('dashboard.daysAgo', { n: days });
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <motion.div
      layoutId={`trip-card-${trip.id}`}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="rounded-3xl overflow-hidden shadow-sm border border-white/20 cursor-pointer group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      onClick={handleOpen}
    >
      {/* ── Cover: photo if available, else gradient ── */}
      <div
        className="relative h-28 flex items-end p-3 select-none overflow-hidden"
        style={trip.coverPhotoUrl && !coverFailed ? undefined : { background: gradientFor(index) }}
      >
        {trip.coverPhotoUrl && !coverFailed && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={trip.coverPhotoUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={handleCoverError}
            />
            {/* Dark scrim so text stays readable */}
            <div className="absolute inset-0 bg-black/35" />
          </>
        )}

        {/* Hover action buttons */}
        <AnimatePresence>
          {hovered && !renaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setRenaming(true); setHovered(false); }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/90 text-gray-800 rounded-xl text-[11px] font-medium hover:bg-white transition-colors shadow-sm"
              >
                ✏️ {t('dashboard.rename')}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onChangeCover(trip); setHovered(false); }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/90 text-gray-700 rounded-xl text-[11px] font-medium hover:bg-white transition-colors shadow-sm"
              >
                🖼️ {t('dashboard.changeCover')}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(trip); }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/90 text-red-600 rounded-xl text-[11px] font-medium hover:bg-white transition-colors shadow-sm"
              >
                🗑️ {t('dashboard.delete')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── Info row ── */}
      <div className="bg-white px-4 pt-2.5 pb-3">
        {/* Days pill — above the title */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 mb-1.5">
          {t('dashboard.days', { n: totalDays })}
        </span>

        <div className="flex items-center gap-2">
          {renaming ? (
            <input
              ref={inputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setNameInput(trip.name); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm font-bold text-gray-900 outline-none border-b-2 border-indigo-400 bg-transparent pb-0.5"
            />
          ) : (
            <p className="flex-1 text-sm font-bold text-gray-900 truncate leading-snug">{trip.name}</p>
          )}
          {!renaming && (
            <button
              onClick={(e) => { e.stopPropagation(); handleOpen(); }}
              aria-label="进入行程"
              className="flex-none w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-900 hover:text-white flex items-center justify-center text-gray-400 text-sm transition-all active:scale-90"
            >
              →
            </button>
          )}
        </div>

        {/* Stats — km + start date only (days shown in pill above) */}
        {(totalDrivingKm > 0 || shortStartDate) && (
          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 flex-wrap">
            {totalDrivingKm > 0 && <span>🚗 {totalDrivingKm} km</span>}
            {totalDrivingKm > 0 && shortStartDate && <span className="text-gray-200">·</span>}
            {shortStartDate && <span>📅 {shortStartDate}</span>}
          </p>
        )}

        <p className="text-[10px] text-gray-300 mt-0.5">
          {trip.baseLocation ? `📍 ${trip.baseLocation.name} · ` : ''}{relativeTime(trip.updatedAt)}
        </p>
      </div>
    </motion.div>
  );
}

// ── NewTripModal ──────────────────────────────────────────────────────────────
function NewTripModal({ onClose }: { onClose: () => void }) {
  const router       = useRouter();
  const createTrip   = useTripStore((s) => s.createTrip);
  const isMapsLoaded = useMapsLoaded();
  const t            = useT();

  const [name, setName]                   = useState('');
  const [baseLocation, setBaseLocation]   = useState<BaseLocation | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameInputRef.current?.focus(); }, []);

  // City autocomplete — request photos alongside geometry
  useEffect(() => {
    if (!isMapsLoaded || !cityInputRef.current) return;
    const ac = new google.maps.places.Autocomplete(cityInputRef.current, {
      types:  ['(cities)'],
      fields: ['name', 'geometry', 'photos'],
    });
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      const loc   = place.geometry?.location;
      if (!loc) return;
      setBaseLocation({
        name: place.name ?? cityInputRef.current?.value ?? '',
        lat:  loc.lat(),
        lng:  loc.lng(),
      });
      const rawUrl = extractPhotoUrl(place.photos);
      setCoverPhotoUrl(rawUrl);  // show preview immediately
      // Convert to Base64 so the URL never expires after storage
      if (rawUrl) {
        urlToBase64(rawUrl).then((b64) => {
          if (b64) setCoverPhotoUrl(b64);
        });
      }
    });
    return () => google.maps.event.removeListener(listener);
  }, [isMapsLoaded]);

  const clearCity = () => {
    setBaseLocation(null);
    setCoverPhotoUrl(null);
    if (cityInputRef.current) { cityInputRef.current.value = ''; }
    setTimeout(() => cityInputRef.current?.focus(), 0);
  };

  const canCreate = !!name.trim() && !!baseLocation;

  const handleCreate = () => {
    if (!canCreate) return;
    const id = createTrip(name.trim(), baseLocation!, coverPhotoUrl ?? undefined);
    onClose();
    router.push(`/trip/${id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('newTrip.title')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('newTrip.subtitle')}</p>
        </div>

        {/* Trip name */}
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); if (e.key === 'Escape') onClose(); }}
          placeholder={t('newTrip.namePlaceholder')}
          maxLength={40}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-400 transition-colors"
        />

        {/* Target city picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-400">
            {t('newTrip.cityLabel')} <span className="text-red-400">*</span>
            <span className="text-gray-300 ml-1">{t('newTrip.cityAnchor')}</span>
          </label>

          {/* Always in DOM so Autocomplete binding persists; hidden when city selected */}
          <input
            ref={cityInputRef}
            type="text"
            placeholder={isMapsLoaded ? t('newTrip.cityPlaceholder') : t('newTrip.cityLoading')}
            disabled={!isMapsLoaded}
            onChange={() => { if (baseLocation) setBaseLocation(null); }}
            style={{ display: baseLocation ? 'none' : undefined }}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-400 transition-colors disabled:opacity-40"
          />

          {/* Selected city chip + cover preview */}
          {baseLocation && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50">
                <span className="text-base leading-none flex-none">📍</span>
                <span className="flex-1 text-sm font-medium text-emerald-800 truncate">
                  {baseLocation.name}
                </span>
                <button
                  type="button"
                  onClick={clearCity}
                  className="flex-none text-emerald-400 hover:text-emerald-700 transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Cover photo preview */}
              {coverPhotoUrl ? (
                <div className="relative rounded-2xl overflow-hidden h-24 border border-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPhotoUrl} alt="封面" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <span className="text-white/90 text-[11px] font-medium bg-black/30 px-2.5 py-1 rounded-full">
                      🖼️ {t('newTrip.coverPreview')}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-gray-300 text-center py-1">{t('newTrip.noCover')}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm text-gray-500 border border-gray-100 hover:border-gray-300 transition-colors"
          >
            {t('dashboard.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex-1 py-3 rounded-2xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {t('newTrip.create')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Image compression (canvas, no deps) ──────────────────────────────────────
function compressImage(file: File, maxW = 960, maxH = 540, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale   = Math.min(maxW / img.width, maxH / img.height, 1);
        const canvas  = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── CoverPickerModal ──────────────────────────────────────────────────────────
type CoverTab = 'maps' | 'upload';

function CoverPickerModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const setCoverPhoto = useTripStore((s) => s.setCoverPhoto);
  const isMapsLoaded  = useMapsLoaded();
  const t             = useT();

  const [tab, setTab]               = useState<CoverTab>('maps');
  const [previewUrl, setPreviewUrl] = useState<string | null>(trip.coverPhotoUrl ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Google Maps photo search state
  const [searchQuery, setSearchQuery]       = useState(trip.baseLocation?.name ?? '');
  const [mapPhotos, setMapPhotos]           = useState<string[]>([]);
  const [searching, setSearching]           = useState(false);
  const [selectedMapUrl, setSelectedMapUrl] = useState<string | null>(null);
  const autoSearched = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback((query: string) => {
    if (!query.trim() || !isMapsLoaded) return;
    setSearching(true);
    setMapPhotos([]);
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.textSearch({ query }, (results, status) => {
      setSearching(false);
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) return;
      const urls: string[] = [];
      for (const place of results.slice(0, 6)) {
        for (const photo of (place.photos ?? []).slice(0, 3)) {
          try {
            const url = photo.getUrl({ maxWidth: 640, maxHeight: 480 });
            if (url) urls.push(url);
          } catch { /* skip */ }
          if (urls.length >= 9) break;
        }
        if (urls.length >= 9) break;
      }
      setMapPhotos(urls);
    });
  }, [isMapsLoaded]);

  // Auto-search once when maps tab is shown and we have a base location
  useEffect(() => {
    if (tab === 'maps' && isMapsLoaded && trip.baseLocation?.name && !autoSearched.current) {
      autoSearched.current = true;
      doSearch(trip.baseLocation.name);
    }
  }, [tab, isMapsLoaded, trip.baseLocation?.name, doSearch]);

  const handleSelectMapPhoto = async (url: string) => {
    if (isProcessing) return;
    setSelectedMapUrl(url);
    setIsProcessing(true);
    const b64 = await urlToBase64(url);
    setPreviewUrl(b64 ?? url);
    setIsProcessing(false);
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setIsProcessing(true);
    try {
      setPreviewUrl(await compressImage(file));
      setSelectedMapUrl(null);
    } catch { /* ignore */ } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleConfirm = () => {
    setCoverPhoto(trip.id, previewUrl ?? '');
    onClose();
  };

  const hasChanged = previewUrl !== (trip.coverPhotoUrl ?? null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-6 bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full sm:max-w-sm bg-white sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{t('cover.title')}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors text-sm">✕</button>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
          {(['maps', 'upload'] as CoverTab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                tab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {key === 'maps' ? `🗺️ ${t('cover.tabMaps')}` : `📁 ${t('cover.tabUpload')}`}
            </button>
          ))}
        </div>

        {/* ── Google Maps photo tab ── */}
        {tab === 'maps' && (
          <div className="flex flex-col gap-3">
            {/* Search bar */}
            <div className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSearch(searchQuery); }}
                placeholder={t('cover.searchPlaceholder')}
                className="flex-1 px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors"
              />
              <button
                onClick={() => doSearch(searchQuery)}
                disabled={searching || !searchQuery.trim() || !isMapsLoaded}
                className="px-4 rounded-2xl bg-gray-900 text-white text-xs font-medium disabled:opacity-40 hover:bg-gray-700 active:scale-95 transition-all"
              >
                {searching ? '…' : t('cover.search')}
              </button>
            </div>

            {/* Photo grid */}
            <div className="min-h-[8rem]">
              {searching ? (
                <div className="h-32 flex items-center justify-center">
                  <span className="text-sm text-gray-400">{t('cover.searching')}</span>
                </div>
              ) : mapPhotos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {mapPhotos.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectMapPhoto(url)}
                        disabled={isProcessing}
                        className={`relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all active:scale-95 ${
                          selectedMapUrl === url
                            ? 'border-emerald-500'
                            : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {selectedMapUrl === url && (
                          <div className="absolute inset-0 bg-emerald-500/25 flex items-center justify-center">
                            <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold shadow">✓</span>
                          </div>
                        )}
                        {isProcessing && selectedMapUrl === url && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <span className="text-white text-[10px]">{t('cover.processing')}</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-300 mt-2 text-center">{t('cover.mapsNote')}</p>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center">
                  <span className="text-xs text-gray-300">{autoSearched.current ? t('cover.noPhotos') : t('cover.searchPlaceholder')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Upload tab ── */}
        {tab === 'upload' && (
          <>
            <div
              role="button"
              tabIndex={0}
              aria-label="选择封面图片"
              className={`relative rounded-2xl overflow-hidden h-36 cursor-pointer border-2 border-dashed transition-all ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-50 scale-[0.99]'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {previewUrl && !selectedMapUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="封面预览" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-end justify-center pb-3">
                    <span className="text-white text-[11px] bg-black/40 px-3 py-1 rounded-full">
                      {t('cover.reselect')}
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2.5 select-none">
                  {isProcessing ? (
                    <span className="text-sm text-gray-400">{t('cover.processing')}</span>
                  ) : (
                    <>
                      <span className="text-3xl leading-none opacity-30">🖼️</span>
                      <span className="text-xs text-gray-400">{t('cover.clickOrDrag')}</span>
                      <span className="text-[10px] text-gray-300">{t('cover.formats')}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
            />
          </>
        )}

        {/* Selected preview strip (maps tab only, when photo selected) */}
        {tab === 'maps' && previewUrl && selectedMapUrl && (
          <div className="relative rounded-2xl overflow-hidden h-20 border border-emerald-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="封面预览" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/15 flex items-center justify-end pr-3">
              <span className="text-white text-[10px] bg-black/30 px-2.5 py-1 rounded-full">
                {t('newTrip.coverPreview')}
              </span>
            </div>
          </div>
        )}

        {/* Remove cover */}
        {previewUrl && !isProcessing && (
          <button
            onClick={() => { setPreviewUrl(null); setSelectedMapUrl(null); }}
            className="text-[11px] text-gray-400 hover:text-red-400 transition-colors text-center -mt-1"
          >
            {t('cover.remove')}
          </button>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm text-gray-500 border border-gray-100 hover:border-gray-300 transition-colors"
          >
            {t('dashboard.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || !hasChanged}
            className="flex-1 py-3 rounded-2xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {isProcessing ? t('cover.processing') : t('cover.confirm')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── OnboardingModal ───────────────────────────────────────────────────────────
function OnboardingModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);

  const ONBOARDING_SLIDES = [
    { icon: '🧩', title: t('onboarding.s1.title'), desc: t('onboarding.s1.desc') },
    { icon: '⏱️', title: t('onboarding.s2.title'), desc: t('onboarding.s2.desc') },
    { icon: '📋', title: t('onboarding.s3.title'), desc: t('onboarding.s3.desc') },
    { icon: '☁️', title: t('onboarding.s4.title'), desc: t('onboarding.s4.desc') },
  ];

  const isLast = step === ONBOARDING_SLIDES.length - 1;
  const slide  = ONBOARDING_SLIDES[step];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-6 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full sm:max-w-sm bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: '#47BB8E' }}
            animate={{ width: `${((step + 1) / ONBOARDING_SLIDES.length) * 100}%` }}
            transition={{ type: 'spring', damping: 20 }}
          />
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Logo + skip */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logoyt.jpeg" alt="" className="h-9 w-9 rounded-xl object-cover flex-none" />
              <span className="text-xs font-bold tracking-wide select-none">
                <span style={{ color: '#3D5568' }}>Yotei</span>
                <span style={{ color: '#47BB8E' }}>trip</span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
            >
              {t('onboarding.skip')}
            </button>
          </div>

          {/* Slide content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center gap-4 py-3 text-center"
            >
              <span className="text-5xl leading-none select-none">{slide.icon}</span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-bold text-gray-900">{slide.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{slide.desc}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Dot indicators */}
          <div className="flex items-center justify-center gap-1.5">
            {ONBOARDING_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="rounded-full transition-all"
                style={{
                  height: '6px',
                  width: i === step ? '20px' : '6px',
                  backgroundColor: i === step ? '#47BB8E' : '#E5E7EB',
                }}
              />
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => { if (isLast) onClose(); else setStep((s) => s + 1); }}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 active:scale-[0.98] transition-all"
          >
            {isLast ? t('onboarding.start') : t('onboarding.next')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────
function DeleteConfirmModal({ trip, onConfirm, onCancel }: {
  trip: Trip;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.confirmDelete')}</h3>
          <p className="text-sm text-gray-500 mt-1.5">
            {t('dashboard.confirmDeleteBody', { name: trip.name })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl text-sm text-gray-600 border border-gray-100 hover:border-gray-300 transition-colors"
          >
            {t('dashboard.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-2xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 active:scale-[0.98] transition-all"
          >
            {t('dashboard.confirmDeleteBtn')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── TripDashboard ─────────────────────────────────────────────────────────────
export function TripDashboard() {
  const trips        = useTripStore((s) => s.trips);
  const deleteTrip   = useTripStore((s) => s.deleteTrip);
  const pinTrip      = useTripStore((s) => s.pinTrip);
  const reorderTrips = useTripStore((s) => s.reorderTrips);
  const t            = useT();

  const [showNewModal, setShowNewModal]         = useState(false);
  const [deletingTrip, setDeletingTrip]         = useState<Trip | null>(null);
  const [coverPickerTrip, setCoverPickerTrip]   = useState<Trip | null>(null);
  const [showWishlist, setShowWishlist]         = useState(false);
  const [showAuthModal, setShowAuthModal]       = useState(false);
  const [showOnboarding, setShowOnboarding]     = useState(false);

  // ── Long-press drag & pin state ────────────────────────────────────────────
  const [contextId, setContextId]   = useState<string | null>(null);
  const [drag, setDrag]             = useState<{ id: string; tx: number; ty: number } | null>(null);
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const pressRef    = useRef<{ x: number; y: number; id: string; idx: number } | null>(null);
  const lpTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef  = useRef<string | null>(null);  // sync ref for callbacks

  const setCtx = (id: string | null) => { contextRef.current = id; setContextId(id); };

  const findDropIdx = useCallback((x: number, y: number, excludeId: string): number => {
    let bestIdx = -1, bestDist = Infinity;
    trips.forEach((trip, i) => {
      if (trip.id === excludeId) return;
      if (trip.pinnedAt) return;           // pinned cards are not valid drop targets
      const el = cardRefsMap.current.get(trip.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });
    return bestIdx;
  }, [trips]);

  const startDragMode = useCallback((id: string, fromIdx: number, startX: number, startY: number) => {
    setDrag({ id, tx: 0, ty: 0 });
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', preventScroll, { passive: false });
    const onMove = (e: PointerEvent) => {
      setDrag({ id, tx: e.clientX - startX, ty: e.clientY - startY });
    };
    const onUp = (e: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('touchmove', preventScroll);
      const toIdx = findDropIdx(e.clientX, e.clientY, id);
      if (toIdx >= 0 && toIdx !== fromIdx) reorderTrips(fromIdx, toIdx);
      setDrag(null);
      pressRef.current = null;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [findDropIdx, reorderTrips]);

  const onCardPointerDown = useCallback((e: React.PointerEvent, id: string, idx: number) => {
    if (contextRef.current !== null) return;
    pressRef.current = { x: e.clientX, y: e.clientY, id, idx };
    lpTimer.current = setTimeout(() => {
      navigator.vibrate?.(30);
      setCtx(id);
    }, 500);
  }, []);

  const onCardPointerMove = useCallback((e: React.PointerEvent, id: string, idx: number) => {
    if (!pressRef.current || pressRef.current.id !== id) return;
    // Pinned trips are immovable — cancel the press but don't start a drag
    if (useTripStore.getState().trips.find((t) => t.id === id)?.pinnedAt) {
      if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
      pressRef.current = null;
      return;
    }
    const dist = Math.hypot(e.clientX - pressRef.current.x, e.clientY - pressRef.current.y);
    if (dist > 10) {
      if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
      if (contextRef.current === id) {
        setCtx(null);
        startDragMode(id, idx, pressRef.current.x, pressRef.current.y);
      } else if (contextRef.current === null) {
        startDragMode(id, idx, pressRef.current.x, pressRef.current.y);
        pressRef.current = null;
      }
    }
  }, [startDragMode]);

  const onCardPointerUp = useCallback(() => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('yoteitrip-onboarded')) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingClose = () => {
    localStorage.setItem('yoteitrip-onboarded', '1');
    setShowOnboarding(false);
  };

  const handleDelete = (trip: Trip) => setDeletingTrip(trip);
  const confirmDelete = () => {
    if (deletingTrip) deleteTrip(deletingTrip.id);
    setDeletingTrip(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[480px] mx-auto flex flex-col px-4">

        {/* ── Header ── */}
        <header className="pt-12 pb-6">
          {/* Brand row: logo badge + two-tone name */}
          <div className="flex items-center gap-2 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logoyt.jpeg"
              alt="YoteiTrip"
              className="h-11 w-11 rounded-2xl object-cover flex-none"
            />
            <span className="text-sm font-bold tracking-wide select-none">
              <span style={{ color: '#3D5568' }}>Yotei</span>
              <span style={{ color: '#47BB8E' }}>trip</span>
            </span>
          </div>
          <div className="flex items-end justify-between">
            <h1 className="text-2xl font-bold" style={{ color: '#3D5568' }}>{t('dashboard.title')}</h1>
            <div className="flex items-center gap-2">
              <UserMenu onOpenAuth={() => setShowAuthModal(true)} />
              <button
                onClick={() => setShowWishlist(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-2xl text-sm text-gray-600 hover:border-gray-400 transition-colors shadow-sm"
              >
                <span className="text-base leading-none">⭐</span>
                <span className="font-medium">{t('dashboard.wishlist')}</span>
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-gray-700 active:scale-95 transition-all shadow-sm"
              >
                <span className="text-base leading-none">+</span>
                {t('dashboard.newTrip')}
              </button>
            </div>
          </div>
        </header>

        {/* ── Trip grid ── */}
        {trips.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <span className="text-5xl">🗺️</span>
            <p className="text-sm text-gray-400">{t('dashboard.noTrips')}</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-5 py-2.5 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              {t('dashboard.startPlanning')}
            </button>
          </div>
        ) : (
          <>
            {/* Global backdrop to dismiss context menu */}
            {contextId && (
              <div className="fixed inset-0 z-10" onClick={() => setCtx(null)} />
            )}
            <motion.div
              className="grid grid-cols-2 gap-3 pb-12"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.06 } },
              }}
            >
              <AnimatePresence mode="popLayout">
                {trips.map((trip, i) => (
                  <div
                    key={trip.id}
                    ref={(el) => { if (el) cardRefsMap.current.set(trip.id, el); else cardRefsMap.current.delete(trip.id); }}
                    className="relative"
                    style={drag?.id === trip.id ? {
                      transform: `translate(${drag.tx}px, ${drag.ty}px)`,
                      zIndex: 50,
                      opacity: 0.92,
                      transition: 'none',
                      pointerEvents: 'none',
                    } : { transition: 'transform 0.2s' }}
                    onPointerDown={(e) => onCardPointerDown(e, trip.id, i)}
                    onPointerMove={(e) => onCardPointerMove(e, trip.id, i)}
                    onPointerUp={onCardPointerUp}
                    onPointerLeave={onCardPointerUp}
                  >
                    {/* Long-press context overlay */}
                    {contextId === trip.id && (
                      <div
                        className="absolute inset-0 z-10 bg-black/40 rounded-3xl flex items-center justify-center gap-2"
                        onClick={() => setCtx(null)}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); pinTrip(trip.id, !trip.pinnedAt); setCtx(null); }}
                          className="flex items-center gap-1 px-3 py-2 bg-white/90 text-gray-800 rounded-xl text-[11px] font-semibold shadow-sm active:scale-95 transition-all"
                        >
                          {trip.pinnedAt ? `× ${t('dashboard.unpin')}` : `📌 ${t('dashboard.pin')}`}
                        </button>
                        {/* Drag button only shown for unpinned trips — must unpin first */}
                        {!trip.pinnedAt && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCtx(null); startDragMode(trip.id, i, 0, 0); }}
                            className="flex items-center gap-1 px-3 py-2 bg-white/90 text-gray-600 rounded-xl text-[11px] font-medium shadow-sm active:scale-95 transition-all"
                          >
                            ⇅ {t('dashboard.drag')}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Pinned indicator */}
                    {trip.pinnedAt && contextId !== trip.id && (
                      <span className="absolute top-2 right-2 z-10 text-xs bg-white/80 rounded-full w-5 h-5 flex items-center justify-center shadow-sm pointer-events-none">
                        📌
                      </span>
                    )}
                    <TripCard
                      trip={trip}
                      index={i}
                      onDelete={handleDelete}
                      onChangeCover={setCoverPickerTrip}
                    />
                  </div>
                ))}
              </AnimatePresence>

              {/* "+ New" ghost card */}
              <motion.button
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowNewModal(true)}
                className="rounded-3xl border-2 border-dashed border-gray-200 h-[7.5rem] flex flex-col items-center justify-center gap-1.5 text-gray-300 hover:border-gray-400 hover:text-gray-400 active:scale-95 transition-all"
              >
                <span className="text-2xl leading-none">+</span>
                <span className="text-[11px] font-medium">{t('dashboard.ghostCard')}</span>
              </motion.button>
            </motion.div>
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal key="onboarding" onClose={handleOnboardingClose} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal key="auth" onClose={() => setShowAuthModal(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewModal && (
          <NewTripModal key="new" onClose={() => setShowNewModal(false)} />
        )}
        {coverPickerTrip && (
          <CoverPickerModal
            key="cover"
            trip={coverPickerTrip}
            onClose={() => setCoverPickerTrip(null)}
          />
        )}
        {deletingTrip && (
          <DeleteConfirmModal
            key="delete"
            trip={deletingTrip}
            onConfirm={confirmDelete}
            onCancel={() => setDeletingTrip(null)}
          />
        )}
      </AnimatePresence>

      {/* Global wishlist drawer — no trip context, no proximity filter */}
      <WishlistDrawer
        isOpen={showWishlist}
        onClose={() => setShowWishlist(false)}
        activeDayId={null}
        baseLocation={null}
      />
    </div>
  );
}
