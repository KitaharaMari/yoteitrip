'use client';

import type { Day, Trip } from '@/types';
import { useWeather } from '@/hooks/useWeather';
import { useT } from '@/hooks/useT';
import { useLangStore } from '@/store/useLangStore';
import { computeDayStats, buildDayMapUrl } from '@/components/TripOverview';
import { ACTIVITY_META } from '@/lib/constants';

const W = 1242;

interface Props {
  trip: Trip;
  day:  Day;
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function durLabel(min: number): string {
  if (min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  return h > 0 ? `${h}h` : `${m}m`;
}

function fmt(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function DailyShareCard({ trip, day }: Props) {
  const t            = useT();
  const lang         = useLangStore((s) => s.lang);
  const tripCurrency = trip.currency ?? 'CAD';
  const stats        = computeDayStats(day, tripCurrency);
  const mapUrl       = buildDayMapUrl(day);

  // Fetch weather for origin/first activity
  const firstPlace = day.activities.find((a) => !a.isBackup && a.place?.lat != null)?.place;
  const weatherLat = day.originPlace?.lat ?? firstPlace?.lat;
  const weatherLng = day.originPlace?.lng ?? firstPlace?.lng;
  const weather    = useWeather(weatherLat, weatherLng, day.date);
  const weatherData = weather !== 'loading' ? weather : null;

  const primary   = day.activities.filter((a) => !a.isBackup);
  const dateLabel = day.date
    ? new Date(day.date + 'T00:00:00').toLocaleDateString(lang, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      })
    : null;

  const mapHeight = Math.round(W * 300 / 600);  // matches API 600x300 ratio

  return (
    <div style={{
      width: W,
      backgroundColor: '#ffffff',
      fontFamily: "'Nunito', 'PingFang SC', 'Noto Sans SC', 'Helvetica Neue', sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '40px 60px 32px',
        background: 'linear-gradient(135deg, #47BB8E 0%, #3DAF80 100%)',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            {/* Branding */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logoyt.jpeg" alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>
                Yoteitrip · {trip.name}
              </span>
            </div>
            <h1 style={{ fontSize: 38, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>{day.label}</h1>
            {dateLabel && <p style={{ fontSize: 15, opacity: 0.85, margin: '6px 0 0' }}>{dateLabel}</p>}
            {/* Origin badge */}
            {day.originPlace && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginTop: 14, backgroundColor: 'rgba(255,255,255,0.22)',
                borderRadius: 24, padding: '5px 16px',
              }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <span style={{ fontSize: 14 }}>{day.originPlace.name}</span>
                {day.originTime && (
                  <span style={{ fontSize: 13, opacity: 0.75 }}>· {day.originTime}</span>
                )}
              </div>
            )}
          </div>

          {/* Weather widget */}
          {weatherData && (
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 44, lineHeight: 1 }}>{weatherData.emoji}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                {weatherData.tempMax}°/{weatherData.tempMin}°
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Satellite route map ── */}
      {mapUrl && (
        <div style={{ width: W, height: mapHeight, overflow: 'hidden', position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mapUrl}
            alt={day.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      {/* ── Activities timeline ── */}
      <div style={{ padding: '32px 60px' }}>
        {primary.map((act, i) => {
          const prev     = i > 0 ? primary[i - 1] : null;
          const meta     = ACTIVITY_META[act.type];
          const endMin   = (toMin(act.startTime) + act.duration) % 1440;
          const endH     = Math.floor(endMin / 60);
          const endM     = endMin % 60;
          const endTime  = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          const durMin   = act.duration;

          // Commute from previous
          let commuteMin = 0;
          if (prev) {
            const prevEnd = (toMin(prev.startTime) + prev.duration) % 1440;
            commuteMin = Math.max(0, toMin(act.startTime) - prevEnd);
          }
          const commuteKm = act.commuteDrivingMeters ? act.commuteDrivingMeters / 1000 : null;
          const showCommute = i > 0 && commuteMin > 0;

          return (
            <div key={act.id}>
              {/* Commute connector */}
              {showCommute && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '6px 0 6px 60px',
                }}>
                  <div style={{ width: 2, height: 20, backgroundColor: '#e5e7eb' }} />
                  <span style={{ fontSize: 13, color: '#9ca3af' }}>
                    {day.travelMode === 'DRIVING' ? '🚗' : '🚌'}
                    {' '}{durLabel(commuteMin)}
                    {commuteKm && commuteKm >= 1 ? ` · ${commuteKm.toFixed(1)} km` : ''}
                  </span>
                </div>
              )}

              {/* Activity row */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 20,
                padding: '14px 0',
                borderBottom: i < primary.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                {/* Time */}
                <div style={{ width: 60, flexShrink: 0, textAlign: 'right', paddingTop: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                    {act.startTime}
                  </div>
                  {durMin > 0 && (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      –{endTime}
                    </div>
                  )}
                </div>

                {/* Icon bubble */}
                <div style={{
                  width: 42, height: 42, borderRadius: 13,
                  backgroundColor: '#f0fdf4', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {meta.icon}
                </div>

                {/* Name + address + summary */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                    {act.place?.name ?? act.title}
                  </div>
                  {act.place?.address && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 }}>
                      {act.place.address}
                    </div>
                  )}
                  {act.place?.editorialSummary && (
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 1.55 }}>
                      {act.place.editorialSummary}
                    </div>
                  )}
                </div>

                {/* Duration + cost */}
                <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: 2 }}>
                  {durMin > 0 && (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>{durLabel(durMin)}</div>
                  )}
                  {(act.estimatedCost ?? 0) > 0 && (
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#3D5568', marginTop: 2 }}>
                      {fmt(tripCurrency, act.estimatedCost!)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Day stats ── */}
      {(stats.drivingKm >= 10 || stats.transitGroups.length > 0 || stats.totalCost > 0) && (
        <div style={{
          display: 'flex', gap: 24, padding: '18px 60px',
          backgroundColor: '#f9fafb', borderTop: '1px solid #f0f0f0',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          {stats.drivingKm >= 10 && (
            <span style={{ fontSize: 14, color: '#6b7280' }}>
              🚗 {stats.drivingKm.toFixed(0)} km
              {stats.fuelCost > 0 ? ` · ${fmt(tripCurrency, stats.fuelCost)}` : ''}
            </span>
          )}
          {stats.transitGroups.map(({ currency, amount }) => (
            <span key={currency} style={{ fontSize: 14, color: '#6b7280' }}>
              🚌 {fmt(currency, amount)}
            </span>
          ))}
          {stats.totalCost > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: '#1f2937' }}>
              {fmt(tripCurrency, stats.totalCost)}
            </span>
          )}
        </div>
      )}

      {/* ── Branding footer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 60px 28px', borderTop: '1px solid #f0f0f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoyt.jpeg" alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            <span style={{ color: '#1f2937' }}>Yotei</span>
            <span style={{ color: '#47BB8E' }}>trip</span>
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{t('share.generatedBy')}</p>
        <p style={{ fontSize: 12, color: '#d1d5db', margin: 0 }}>yoteitrip.vercel.app</p>
      </div>
    </div>
  );
}
