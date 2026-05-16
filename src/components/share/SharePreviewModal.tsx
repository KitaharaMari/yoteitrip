'use client';

import { useEffect, useRef, useState } from 'react';
import type { Trip, Day } from '@/types';
import { useT } from '@/hooks/useT';
import { OverviewShareCard } from './OverviewShareCard';
import { DailyShareCard } from './DailyShareCard';

export type ShareMode = 'overview' | 'daily';

interface Props {
  mode:    ShareMode;
  trip:    Trip;
  day?:    Day;       // required when mode === 'daily'
  onClose: () => void;
}

// ── QR generation (same logic as ExportModal) ────────────────────────────────
function slimForQr(trip: Trip): string {
  const slim = {
    ...trip,
    days: trip.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) => ({
        ...a,
        commutePolyline: undefined,
        place: a.place
          ? { placeId: a.place.placeId, name: a.place.name, address: a.place.address, lat: a.place.lat, lng: a.place.lng }
          : undefined,
      })),
    })),
  };
  return btoa(encodeURIComponent(JSON.stringify(slim)));
}

async function makeQr(trip: Trip): Promise<string | null> {
  const QRCode = (await import('qrcode')).default;
  try {
    return await QRCode.toDataURL(slimForQr(trip), {
      margin: 1, width: 200, errorCorrectionLevel: 'L',
    });
  } catch {
    return null;
  }
}

// ── html2canvas capture ───────────────────────────────────────────────────────
async function captureEl(el: HTMLElement): Promise<string> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, {
    useCORS:         true,
    allowTaint:      false,
    scale:           1,
    backgroundColor: '#ffffff',
    logging:         false,
    windowWidth:     1242,
  });
  return canvas.toDataURL('image/jpeg', 0.93);
}

// ── SharePreviewModal ─────────────────────────────────────────────────────────
export function SharePreviewModal({ mode, trip, day, onClose }: Props) {
  const t       = useT();
  const cardRef = useRef<HTMLDivElement>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrReady,   setQrReady]   = useState(mode !== 'overview'); // daily needs no QR
  const [preview,   setPreview]   = useState<string | null>(null);
  const [failed,    setFailed]    = useState(false);
  const capturedRef = useRef(false);

  // Generate QR for overview mode
  useEffect(() => {
    if (mode !== 'overview') return;
    makeQr(trip).then((url) => {
      setQrDataUrl(url);
      setQrReady(true);
    });
  }, [mode, trip]);

  // Settle before capture: overview loads one map per day so needs more time
  useEffect(() => {
    if (!qrReady || capturedRef.current) return;
    const timer = setTimeout(async () => {
      if (!cardRef.current || capturedRef.current) return;
      capturedRef.current = true;
      try {
        const dataUrl = await captureEl(cardRef.current);
        setPreview(dataUrl);
      } catch {
        setFailed(true);
      }
    }, mode === 'overview' ? 3000 : 1800);
    return () => clearTimeout(timer);
  }, [qrReady]);

  const handleSave = () => {
    if (!preview) return;
    const a    = document.createElement('a');
    a.href     = preview;
    a.download = `${trip.name}${mode === 'daily' ? `-${day?.label ?? 'Day'}` : '-Overview'}.jpg`;
    a.click();
  };

  const isLoading = !preview && !failed;

  return (
    <>
      {/* ── Off-screen render target (1242px, visually hidden) ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', left: '-9999px', top: 0,
          width: '1242px', zIndex: -1, pointerEvents: 'none',
        }}
      >
        <div ref={cardRef}>
          {mode === 'overview' ? (
            <OverviewShareCard trip={trip} qrDataUrl={qrDataUrl} />
          ) : day ? (
            <DailyShareCard trip={trip} day={day} />
          ) : null}
        </div>
      </div>

      {/* ── Modal sheet ── */}
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-[480px] bg-white rounded-t-3xl flex flex-col max-h-[90dvh]">

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <h2 className="text-base font-semibold text-gray-900">
              {mode === 'overview' ? t('share.overviewTitle') : t('share.dailyTitle')}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Preview area */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-9 h-9 rounded-full border-2 border-gray-200 border-t-[#47BB8E] animate-spin" />
                <p className="text-sm text-gray-400">{t('share.generating')}</p>
              </div>
            )}
            {failed && (
              <div className="flex items-center justify-center py-16">
                <p className="text-sm text-red-400">{t('share.error')}</p>
              </div>
            )}
            {preview && (
              <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="preview" className="w-full" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-4 pb-8 pt-3 flex flex-col gap-2">
            <button
              onClick={handleSave}
              disabled={!preview}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.99] transition-all"
              style={{ backgroundColor: '#47BB8E' }}
            >
              {isLoading ? t('share.generating') : t('share.saveToAlbum')}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t('share.cancel')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
