'use client';

import type { Trip } from '@/types';
import type { WeatherData } from '@/lib/weather';
import { useWeatherMap, type WeatherMapItem } from '@/hooks/useWeather';
import { useT } from '@/hooks/useT';
import { useLangStore } from '@/store/useLangStore';
import { ACTIVITY_META } from '@/lib/constants';
import {
  computeDayStats, buildRouteSummary, tripGearAdvice, buildDayMapUrl,
} from '@/components/TripOverview';

const W = 1242;
// Map height for each day card: 600:250 ratio keeps the overview image manageable
const MAP_H = Math.round(W * 250 / 600);

interface Props {
  trip: Trip;
  qrDataUrl: string | null;
}

function fmt(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function durLabel(min: number): string {
  if (min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  return h > 0 ? `${h}h` : `${m}m`;
}

export function OverviewShareCard({ trip, qrDataUrl }: Props) {
  const t            = useT();
  const lang         = useLangStore((s) => s.lang);
  const tripCurrency = trip.currency ?? 'CAD';
  const allStats     = trip.days.map((d) => computeDayStats(d, tripCurrency));

  const totalDrivingKm = allStats.reduce((s, st) => s + st.drivingKm, 0);
  const totalUserCost  = allStats.reduce((s, st) => s + st.totalCost, 0);
  const totalPlaces    = trip.days.flatMap((d) =>
    d.activities.filter((a) => !a.isBackup && a.place?.name),
  ).length;

  const transitTotals: Record<string, number> = {};
  for (const st of allStats) {
    for (const { currency, amount } of st.transitGroups) {
      transitTotals[currency] = (transitTotals[currency] ?? 0) + amount;
    }
  }

  // Weather — same items as TripOverview (hits the shared module-level cache)
  const weatherItems: WeatherMapItem[] = trip.days.flatMap((d) => {
    if (!d.date) return [];
    const firstPlace = d.activities.find((a) => !a.isBackup && a.place?.lat != null)?.place;
    const lat = firstPlace?.lat ?? trip.baseLocation?.lat;
    const lng = firstPlace?.lng ?? trip.baseLocation?.lng;
    if (lat == null || lng == null) return [];
    return [{ key: d.id, lat, lng, date: d.date }];
  });
  const weatherMap  = useWeatherMap(weatherItems);
  const weathers    = trip.days.map((d) => weatherMap[d.id]).filter((w): w is WeatherData => w != null);
  const gearText    = tripGearAdvice(trip.days, weatherMap, t);

  const root: React.CSSProperties = {
    width: W,
    backgroundColor: '#ffffff',
    fontFamily: "'Nunito', 'PingFang SC', 'Noto Sans SC', 'Helvetica Neue', sans-serif",
  };

  return (
    <div style={root}>

      {/* ── Header: cover photo + gradient ── */}
      <div style={{ position: 'relative', height: 300, overflow: 'hidden',
        background: 'linear-gradient(135deg, #47BB8E 0%, #3DAF80 100%)' }}>
        {trip.coverPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={trip.coverPhotoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 100%)',
        }} />
        <div style={{ position: 'relative', padding: '44px 60px 36px', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoyt.jpeg" alt="" style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'cover' }} />
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em' }}>
              <span style={{ color: '#fff' }}>Yotei</span>
              <span style={{ color: '#d1fae5' }}>trip</span>
            </span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>{trip.name}</h1>
          {trip.baseLocation && (
            <p style={{ fontSize: 15, opacity: 0.8, margin: '8px 0 0' }}>📍 {trip.baseLocation.name}</p>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'flex', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
        {[
          { icon: '📅', value: t('overview.days', { n: trip.days.length }), label: t('overview.totalDays') },
          { icon: '🚗', value: totalDrivingKm > 0 ? `${totalDrivingKm.toFixed(0)} km` : '—', label: t('overview.totalKm') },
          { icon: '📌', value: t('overview.placesCount', { n: totalPlaces }), label: t('overview.places') },
          ...(totalUserCost > 0 ? [{ icon: '💰', value: fmt(tripCurrency, totalUserCost), label: t('overview.budget') }] : []),
        ].map(({ icon, value, label }, i, arr) => (
          <div key={label} style={{
            flex: 1, padding: '22px 16px', textAlign: 'center',
            borderRight: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none',
          }}>
            <div style={{ fontSize: 22 }}>{icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', marginTop: 4 }}>{value}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Weather & Gear ── */}
      {weathers.length > 0 && (
        <div style={{ padding: '24px 40px', borderBottom: '1px solid #f3f4f6' }}>
          <p style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('overview.weatherGear')}
          </p>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {trip.days.map((day) => {
              const w = weatherMap[day.id];
              if (!w || !day.date) return null;
              const label = new Date(day.date + 'T00:00:00').toLocaleDateString(lang, { month: 'short', day: 'numeric' });
              return (
                <div key={day.id} style={{ textAlign: 'center', minWidth: 52 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{label}</div>
                  <div style={{ fontSize: 28, margin: '3px 0' }}>{w.emoji}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{w.tempMax}°</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{w.tempMin}°</div>
                </div>
              );
            })}
          </div>
          {gearText && (
            <div style={{
              marginTop: 18, padding: '12px 18px',
              backgroundColor: '#f0fdf4', borderRadius: 10,
              borderLeft: '3px solid #47BB8E',
              fontSize: 14, color: '#166534', lineHeight: 1.6,
            }}>
              👕 {gearText}
            </div>
          )}
        </div>
      )}

      {/* ── Day cards — expanded: map + timeline + accommodation ── */}
      <div style={{ padding: '20px 40px 36px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {trip.days.map((day, i) => {
          const st       = allStats[i];
          const summary  = buildRouteSummary(day);
          const mapUrl   = buildDayMapUrl(day);
          const w        = weatherMap[day.id];
          const dateLabel = day.date
            ? new Date(day.date + 'T00:00:00').toLocaleDateString(lang, { month: 'short', day: 'numeric' })
            : null;

          // All primary activities with a resolved place (excluding TRANSPORT for timeline)
          const placeActs = day.activities.filter(
            (a) => !a.isBackup && a.place?.name && a.type !== 'TRANSPORT',
          );

          // Last accommodation of the day
          const accommodation = day.activities
            .filter((a) => !a.isBackup && a.type === 'ACCOMMODATION' && a.place?.name)
            .at(-1)?.place?.name ?? null;

          return (
            <div key={day.id} style={{
              borderRadius: 16, border: '1px solid #e5e7eb',
              overflow: 'hidden', backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {/* ── Card header ── */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 24px', backgroundColor: '#f9fafb',
                borderBottom: '1px solid #f0f0f0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>{day.label}</span>
                  {dateLabel && <span style={{ fontSize: 13, color: '#9ca3af' }}>{dateLabel}</span>}
                  {w && <span style={{ fontSize: 14, color: '#6b7280' }}>{w.emoji} {w.tempMax}°/{w.tempMin}°</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {st.drivingKm >= 10 && (
                    <span style={{ fontSize: 13, color: '#9ca3af' }}>
                      🚗 {st.drivingKm.toFixed(0)} km
                    </span>
                  )}
                  {st.totalCost > 0 && (
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#3D5568' }}>
                      💰 {fmt(tripCurrency, st.totalCost)}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Route summary ── */}
              {(summary.origin || summary.end) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px 0', flexWrap: 'wrap' }}>
                  {summary.origin && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#47BB8E' }}>{summary.origin}</span>
                  )}
                  {summary.origin && (summary.waypoints.length > 0 || summary.end) && (
                    <span style={{ fontSize: 12, color: '#d1d5db' }}>→</span>
                  )}
                  {summary.waypoints.length > 0 && (
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{summary.waypoints.join(' · ')}</span>
                  )}
                  {summary.waypoints.length > 0 && summary.end && (
                    <span style={{ fontSize: 12, color: '#d1d5db' }}>→</span>
                  )}
                  {summary.end && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{summary.end}</span>
                  )}
                </div>
              )}

              {/* ── Static satellite route map ── */}
              {mapUrl && (
                <div style={{ margin: '12px 0 0', width: '100%', height: MAP_H, overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mapUrl}
                    alt={`${day.label} route`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}

              {/* ── Place timeline ── */}
              {placeActs.length > 0 && (
                <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {placeActs.map((act, idx) => {
                    const meta   = ACTIVITY_META[act.type];
                    const dur    = durLabel(act.duration);
                    const isAccom = act.type === 'ACCOMMODATION';
                    const isLast  = idx === placeActs.length - 1;
                    return (
                      <div key={act.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        paddingTop: idx === 0 ? 0 : 10,
                        paddingBottom: isLast ? 0 : 10,
                        borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
                      }}>
                        {/* Time */}
                        <span style={{
                          fontSize: 12, color: '#9ca3af', minWidth: 38,
                          fontVariantNumeric: 'tabular-nums', paddingTop: 2,
                        }}>
                          {act.startTime}
                        </span>
                        {/* Icon */}
                        <span style={{ fontSize: 16, lineHeight: 1, paddingTop: 1 }}>{meta.icon}</span>
                        {/* Name + address */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: isAccom ? 700 : 600,
                            color: isAccom ? '#1f2937' : '#374151',
                            lineHeight: 1.3,
                          }}>
                            {act.place!.name}
                          </div>
                          {act.place?.editorialSummary && (
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, lineHeight: 1.4 }}>
                              {act.place.editorialSummary}
                            </div>
                          )}
                        </div>
                        {/* Duration */}
                        {dur && (
                          <span style={{ fontSize: 12, color: '#9ca3af', paddingTop: 2, whiteSpace: 'nowrap' }}>
                            {dur}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Accommodation highlight (if not already shown inline as ACCOMMODATION type) ── */}
              {accommodation && !placeActs.some((a) => a.type === 'ACCOMMODATION') && (
                <div style={{
                  margin: '0 16px 16px',
                  padding: '10px 16px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 10,
                  borderLeft: '3px solid #47BB8E',
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: '#166534', fontWeight: 600,
                }}>
                  🏨 {accommodation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 40px 32px',
        borderTop: '2px solid #f0f0f0', backgroundColor: '#fafafa',
      }}>
        {/* Branding */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoyt.jpeg" alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              <span style={{ color: '#1f2937' }}>Yotei</span>
              <span style={{ color: '#47BB8E' }}>trip</span>
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{t('share.generatedBy')}</p>
          <p style={{ fontSize: 11, color: '#d1d5db', margin: '2px 0 0' }}>yoteitrip.vercel.app</p>
        </div>

        {/* Budget summary */}
        {(totalUserCost > 0 || Object.keys(transitTotals).length > 0) && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{t('overview.budget')}</p>
            {totalUserCost > 0 && (
              <p style={{ fontSize: 26, fontWeight: 800, color: '#1f2937', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(tripCurrency, totalUserCost)}
              </p>
            )}
            {Object.entries(transitTotals).map(([cur, amt]) => (
              <p key={cur} style={{ fontSize: 14, color: '#6b7280', margin: '2px 0 0' }}>
                + {fmt(cur, amt)}
              </p>
            ))}
          </div>
        )}

        {/* QR code */}
        {qrDataUrl && (
          <div style={{ textAlign: 'center', marginLeft: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR" style={{ width: 88, height: 88, borderRadius: 6 }} />
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>{t('share.scanToImport')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
