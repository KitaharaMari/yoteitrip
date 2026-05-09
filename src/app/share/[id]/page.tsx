'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSharedTrip } from '@/lib/shareLink';
import { useTripStore } from '@/store/useTripStore';
import { ACTIVITY_META } from '@/lib/constants';
import type { Trip } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? (r > 0 ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen bg-[#F0F7F4] flex flex-col items-center justify-center gap-4 px-6">
      <div className="w-12 h-12 rounded-2xl bg-gray-200 animate-pulse" />
      <div className="w-40 h-4 rounded bg-gray-200 animate-pulse" />
      <div className="w-56 h-3 rounded bg-gray-100 animate-pulse mt-2" />
    </div>
  );
}

// ── Not found ─────────────────────────────────────────────────────────────────
function NotFound() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#F0F7F4] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-5xl">🗺️</span>
      <h1 className="text-lg font-bold" style={{ color: '#3D5568' }}>行程不存在或已失效</h1>
      <p className="text-sm text-gray-400">此分享链接可能已过期或被删除</p>
      <button
        onClick={() => router.push('/')}
        className="mt-2 px-5 py-2.5 rounded-2xl text-sm font-medium text-white"
        style={{ backgroundColor: '#47BB8E' }}
      >
        打开 YoteiTrip
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router   = useRouter();
  const loadTrip = useTripStore((s) => s.loadTrip);

  const [trip, setTrip] = useState<Trip | null | 'loading'>('loading');
  const [imported, setImported] = useState(false);

  useEffect(() => {
    loadSharedTrip(id).then((t) => setTrip(t));
  }, [id]);

  const handleImport = () => {
    if (!trip || trip === 'loading') return;
    loadTrip(trip);
    setImported(true);
    setTimeout(() => router.push(`/trip/${(trip as Trip).id}`), 800);
  };

  if (trip === 'loading') return <Skeleton />;
  if (!trip) return <NotFound />;

  const primaryActivities = trip.days.flatMap((d) => d.activities.filter((a) => !a.isBackup));
  const placesCount = primaryActivities.filter((a) => a.place?.name).length;

  return (
    <div className="min-h-screen bg-[#F0F7F4]">
      <div className="w-full max-w-[480px] mx-auto flex flex-col px-4 pb-32">

        {/* ── Top bar ── */}
        <div className="pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoyt.jpeg" alt="YoteiTrip" className="h-7 w-7 rounded-lg object-cover" />
            <span className="text-sm font-bold">
              <span style={{ color: '#3D5568' }}>Yotei</span>
              <span style={{ color: '#47BB8E' }}>trip</span>
            </span>
          </div>
          <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            只读预览
          </span>
        </div>

        {/* ── Trip header card ── */}
        <div
          className="rounded-3xl p-5 text-white mb-4"
          style={{ background: 'linear-gradient(135deg, #47BB8E, #3DAF80)' }}
        >
          {trip.baseLocation && (
            <p className="text-[11px] text-white/70 mb-1">📍 {trip.baseLocation.name}</p>
          )}
          <h1 className="text-xl font-bold leading-snug mb-3">{trip.name}</h1>
          <div className="flex gap-4 text-sm text-white/90">
            <span>📅 {trip.days.length} 天</span>
            <span>📌 {placesCount} 景点</span>
          </div>
        </div>

        {/* ── Day list ── */}
        <div className="flex flex-col gap-4">
          {trip.days.map((day) => {
            const items = day.activities.filter((a) => !a.isBackup);
            if (items.length === 0) return null;
            return (
              <div key={day.id}>
                {/* Day header */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: '#3D5568' }}
                  >
                    {day.label}
                  </span>
                  {day.date && (
                    <span className="text-[11px] text-gray-400">{day.date}</span>
                  )}
                </div>

                {/* Activity rows */}
                <div className="flex flex-col gap-1.5 pl-1">
                  {items.map((act) => {
                    const meta = ACTIVITY_META[act.type];
                    return (
                      <div key={act.id} className="flex items-center gap-3 bg-white rounded-2xl px-3.5 py-2.5 shadow-sm">
                        <span className="text-[10px] font-mono text-gray-400 w-9 flex-none tabular-nums">
                          {act.startTime}
                        </span>
                        <span className="text-base leading-none flex-none">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">
                            {act.place?.name ?? (act.title || (
                              <span className="text-gray-300">未设置地点</span>
                            ))}
                          </p>
                          {act.place?.address && (
                            <p className="text-[10px] text-gray-400 truncate">{act.place.address}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 flex-none">{fmt(act.duration)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Fixed import bar ── */}
      <div className="fixed bottom-0 inset-x-0 pb-safe-bottom bg-white/90 backdrop-blur border-t border-gray-100">
        <div className="w-full max-w-[480px] mx-auto px-4 py-3">
          <button
            onClick={handleImport}
            disabled={imported}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white active:scale-[0.98] transition-all disabled:opacity-60"
            style={{ backgroundColor: imported ? '#47BB8E' : '#3D5568' }}
          >
            {imported ? '✓ 已导入，即将跳转…' : '⬇ 导入此行程到 YoteiTrip'}
          </button>
          <p className="text-center text-[10px] text-gray-400 mt-1.5">
            导入后可在 YoteiTrip 中自由编辑规划
          </p>
        </div>
      </div>
    </div>
  );
}
