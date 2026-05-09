'use client';

import { forwardRef } from 'react';
import type { Trip } from '@/types';
import { ACTIVITY_META } from '@/lib/constants';
import { buildStaticMapUrl } from '@/lib/staticMap';

interface Props {
  trip: Trip;
  qrDataUrl: string | null;
}

const GRADIENT = [
  ['#47BB8E', '#3DAF80'],  // brand green
  ['#3D5568', '#2E4254'],  // brand dark
  ['#6366f1', '#4f46e5'],
  ['#f59e0b', '#d97706'],
  ['#ec4899', '#db2777'],
  ['#8b5cf6', '#7c3aed'],
];

export const ShareCard = forwardRef<HTMLDivElement, Props>(({ trip, qrDataUrl }, ref) => {
  const mapUrl    = buildStaticMapUrl(trip); // key added server-side via /api/staticmap
  const [c1, c2]  = GRADIENT[Math.max(0, trip.days.length - 1) % GRADIENT.length];

  const primaryActivities = trip.days.flatMap((d) =>
    d.activities.filter((a) => !a.isBackup),
  );

  const totalDays      = trip.days.length;
  const placesCount    = primaryActivities.filter((a) => a.place?.name).length;
  const totalDriveKm   = Math.round(
    primaryActivities.reduce((s, a) => s + (a.commuteDrivingMeters ?? 0), 0) / 1000,
  );

  return (
    // Off-screen container — captured by html2canvas
    <div
      ref={ref}
      style={{
        position: 'fixed', left: '-9999px', top: '0',
        width: '390px', background: '#ffffff', fontFamily: 'sans-serif',
        zIndex: -1,
      }}
    >
      {/* ── Header gradient ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          padding: '28px 24px 20px',
          color: '#fff',
        }}
      >
        <p style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          YoteiTrip
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>
          {trip.name}
        </h1>
        {trip.baseLocation && (
          <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
            📍 {trip.baseLocation.name}
          </p>
        )}
        <div style={{ display: 'flex', gap: 16, fontSize: 12, opacity: 0.9 }}>
          <span>📅 {totalDays} 天</span>
          <span>📌 {placesCount} 景点</span>
          {totalDriveKm > 0 && <span>🚗 {totalDriveKm} km</span>}
        </div>
      </div>

      {/* ── Static map ── */}
      {mapUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapUrl}
          alt="Route map"
          crossOrigin="anonymous"
          style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }}
        />
      )}

      {/* ── Days ── */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {trip.days.map((day, di) => {
          const dayPrimary = day.activities.filter((a) => !a.isBackup);
          if (dayPrimary.length === 0) return null;

          // Build a map of primary-id → backup activities for the Plan B sidebar
          const backupsOf = new Map<string, typeof day.activities>();
          for (const a of day.activities) {
            if (a.isBackup && a.linkedToId) {
              const existing = backupsOf.get(a.linkedToId) ?? [];
              backupsOf.set(a.linkedToId, [...existing, a]);
            }
          }

          return (
            <div key={day.id}>
              {/* Day header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  background: c1, color: '#fff',
                  borderRadius: 8, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                }}>
                  {day.label}
                </span>
                {day.date && (
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{day.date}</span>
                )}
              </div>

              {/* Activities (70% primary + 30% Plan B sidebar) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayPrimary.map((act) => {
                  const meta    = ACTIVITY_META[act.type];
                  const backups = backupsOf.get(act.id) ?? [];
                  const hasBackups = backups.length > 0;

                  return (
                    <div key={act.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>

                      {/* ── Primary card (70%) ── */}
                      <div style={{
                        flex: hasBackups ? '0 0 68%' : '1',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        background: '#f8fafc', borderRadius: 12, padding: '8px 10px',
                      }}>
                        {/* Cover photo */}
                        {act.place?.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={act.place.photoUrl}
                            alt=""
                            crossOrigin="anonymous"
                            style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 12 }}>{meta.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {act.place?.name ?? (act.title || '未设置地点')}
                            </span>
                            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, marginLeft: 4 }}>
                              {act.startTime}
                            </span>
                          </div>
                          {act.place?.editorialSummary && (
                            <p style={{ fontSize: 10, color: '#6b7280', margin: 0, lineHeight: 1.4,
                              overflow: 'hidden', display: '-webkit-box',
                              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {act.place.editorialSummary}
                            </p>
                          )}
                          {!act.place?.editorialSummary && act.description && (
                            <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>
                              {act.description}
                            </p>
                          )}
                        </div>
                      </div>{/* end primary card */}

                      {/* ── Plan B sidebar (30%) ── */}
                      {hasBackups && (
                        <div style={{
                          flex: '0 0 29%', borderLeft: '1.5px dashed #d1d5db',
                          paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                          <p style={{ fontSize: 8, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                            方案 B
                          </p>
                          {backups.map((b) => (
                            <div key={b.id} style={{
                              background: '#f9fafb', borderRadius: 8,
                              padding: '5px 7px', border: '1px solid #f3f4f6',
                            }}>
                              <p style={{ fontSize: 10, fontWeight: 600, color: '#374151', margin: 0,
                                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {b.place?.name ?? (b.title || '备选')}
                              </p>
                              {b.place?.editorialSummary && (
                                <p style={{ fontSize: 9, color: '#9ca3af', margin: '2px 0 0', lineHeight: 1.3,
                                  overflow: 'hidden', display: '-webkit-box',
                                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                  {b.place.editorialSummary}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    </div>/* end activity row */
                  );
                })}
              </div>

              {/* Day divider */}
              {di < trip.days.length - 1 && (
                <div style={{ height: 1, background: '#e5e7eb', marginTop: 12 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer: QR + branding ── */}
      <div style={{
        background: '#f8fafc', borderTop: '1px solid #e5e7eb',
        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="QR Code" style={{ width: 72, height: 72, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 72, height: 72, background: '#e5e7eb', borderRadius: 8, flexShrink: 0 }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logoyt.jpeg"
            alt="YoteiTrip"
            crossOrigin="anonymous"
            style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
          />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: '#3D5568' }}>Yotei</span>
              <span style={{ color: '#47BB8E' }}>trip</span>
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9ca3af', lineHeight: 1.4 }}>
              扫描二维码导入此行程<br />
              模块化旅游日程规划工具
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
