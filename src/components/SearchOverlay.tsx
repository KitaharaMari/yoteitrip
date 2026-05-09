'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapsLoaded } from './MapProvider';
import type { PlaceDetails } from '@/types';


export interface SearchAnchor {
  lat: number;
  lng: number;
  name?: string;   // city / region name shown in placeholder and hint
}

interface Props {
  onSelect: (place: PlaceDetails) => void;
  onClose: () => void;
  searchAnchor?: SearchAnchor | null;
}

const RADIUS_KM = 1000;

// Converts a circle (center + radius) to an approximate bounding box.
function toBounds(lat: number, lng: number, radiusKm: number): google.maps.LatLngBoundsLiteral {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    south: Math.max(-90,  lat - latDelta),
    north: Math.min(90,   lat + latDelta),
    west:  Math.max(-180, lng - lngDelta),
    east:  Math.min(180,  lng + lngDelta),
  };
}

export function SearchOverlay({ onSelect, onClose, searchAnchor }: Props) {
  const isMapsLoaded  = useMapsLoaded();
  const inputRef      = useRef<HTMLInputElement>(null);
  const onSelectRef   = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  // Holds the Autocomplete instance so the bounds-update effect can reach it
  // without the init effect needing anchor/isGlobal in its dependency array
  // (re-creating the Autocomplete would clear the user's typed text).
  const acRef         = useRef<google.maps.places.Autocomplete | null>(null);

  const [isGlobal, setIsGlobal] = useState(false);

  // ── Keyboard close ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Initialise Autocomplete (once, when Maps SDK loads) ──────────────────
  useEffect(() => {
    if (!isMapsLoaded || !inputRef.current) return;
    inputRef.current.focus();

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      fields: [
        'place_id', 'name', 'formatted_address', 'geometry', 'vicinity',
        'editorial_summary', 'photos',
        'opening_hours', 'rating', 'url',
      ],
    });
    acRef.current = ac;
    // Bounds are applied by the separate bounds-update effect which runs
    // immediately after this one in the same effects flush.

    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.place_id) return;

      type PlaceWithEditorial = google.maps.places.PlaceResult & {
        editorial_summary?: { overview?: string };
      };

      const buildDetails = (
        p: PlaceWithEditorial,
        overrides?: Partial<PlaceDetails>,
      ): PlaceDetails => {
        const rawPeriods = p.opening_hours?.periods;
        const openingHours = rawPeriods?.length
          ? {
              periods: rawPeriods
                .filter((pr) => pr.open)
                .map((pr) => ({
                  open:  { day: pr.open.day  ?? 0, time: pr.open.time  ?? '0000' },
                  close: pr.close
                    ? { day: pr.close.day ?? 0, time: pr.close.time ?? '0000' }
                    : undefined,
                })),
            }
          : undefined;
        return {
          placeId:          p.place_id ?? '',
          name:             p.name ?? '',
          address:          p.formatted_address ?? (p as google.maps.places.PlaceResult).vicinity ?? '',
          lat:              p.geometry?.location?.lat(),
          lng:              p.geometry?.location?.lng(),
          editorialSummary: p.editorial_summary?.overview,
          photoUrl:         p.photos?.[0]?.getUrl({ maxWidth: 800, maxHeight: 600 }),
          openingHours,
          rating:           p.rating,
          googleMapsUrl:    p.url,
          ...overrides,
        };
      };

      const base = buildDetails(place as PlaceWithEditorial);

      // Autocomplete omits editorial_summary / url for some places.
      // Always fire a follow-up getDetails to fill those gaps.
      const svc = new google.maps.places.PlacesService(document.createElement('div'));
      svc.getDetails(
        {
          placeId: place.place_id,
          fields: ['editorial_summary', 'url', 'rating', 'photos'],
        },
        (details, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && details) {
            const enriched = details as PlaceWithEditorial;
            onSelectRef.current({
              ...base,
              editorialSummary: enriched.editorial_summary?.overview ?? base.editorialSummary,
              photoUrl: details.photos?.[0]?.getUrl({ maxWidth: 800, maxHeight: 600 }) ?? base.photoUrl,
              rating:         details.rating          ?? base.rating,
              googleMapsUrl:  details.url             ?? base.googleMapsUrl,
            });
          } else {
            // getDetails failed — use autocomplete data as-is
            onSelectRef.current(base);
          }
        },
      );
    });

    return () => {
      google.maps.event.removeListener(listener);
      acRef.current = null;
    };
  }, [isMapsLoaded]);

  // ── Update geofence bounds when anchor or global-toggle changes ──────────
  // Uses primitive deps (lat/lng numbers) so object identity doesn't matter.
  useEffect(() => {
    const ac = acRef.current;
    if (!ac) return;

    if (searchAnchor && !isGlobal) {
      ac.setBounds(toBounds(searchAnchor.lat, searchAnchor.lng, RADIUS_KM));
      ac.setOptions({ strictBounds: true });
    } else {
      // Disable strict restriction — existing bounds remain as a soft bias.
      ac.setOptions({ strictBounds: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchAnchor?.lat, searchAnchor?.lng, isGlobal]);

  const geofenceActive = !!searchAnchor && !isGlobal;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">

      {/* ── Search bar ── */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-5 pb-4 border-b border-gray-100">
        <button
          onClick={onClose}
          aria-label="关闭搜索"
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors flex-none"
        >
          ←
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder={
            !isMapsLoaded
              ? '地图加载中，请稍候...'
              : geofenceActive && searchAnchor?.name
              ? `搜索 ${searchAnchor.name} 周边 ${RADIUS_KM}km 的景点...`
              : '搜索地点、景点、餐厅...'
          }
          disabled={!isMapsLoaded}
          className="flex-1 text-base outline-none text-gray-900 placeholder-gray-400 disabled:opacity-40"
        />
      </div>

      {/* ── Geofence hint bar ── */}
      {isMapsLoaded && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50/60 border-b border-gray-100">
          <span className="text-[11px] text-gray-400 leading-none">
            {geofenceActive
              ? `📍 ${searchAnchor?.name ?? '当前位置'} · ${RADIUS_KM}km 范围`
              : '🌐 全球搜索模式'}
          </span>
          {geofenceActive && (
            <button
              onClick={() => setIsGlobal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            >
              🌐 切换全球
            </button>
          )}
          {isGlobal && (
            <button
              onClick={() => setIsGlobal(false)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
            >
              📍 恢复围栏
            </button>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col items-center justify-start pt-12 px-6 text-center">
        <span className="text-4xl mb-4">{isMapsLoaded ? '🔍' : '⏳'}</span>
        <p className="text-sm text-gray-500">
          {isMapsLoaded
            ? '输入关键词，从下拉列表中选择地点'
            : '地图服务正在加载…如持续出现请检查 API Key 配置'}
        </p>

        {/* Prominent global-search escape hatch — visible whenever geofence is on */}
        {isMapsLoaded && geofenceActive && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-[11px] text-gray-300">搜索不到结果？</p>
            <button
              onClick={() => setIsGlobal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-2xl text-sm font-medium hover:bg-blue-100 active:scale-[0.98] transition-all"
            >
              🌐 扩大到全球搜索
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
