import { DateTime } from 'luxon';
import type { PlaceOpeningHours } from '@/types';

export type OpenStatus = 'OPEN' | 'CLOSES_SOON' | 'CLOSED' | 'UNKNOWN';

/**
 * Compare a planned startTime against a place's opening_hours periods.
 *
 * Both startTime and the periods are in local (destination) time, so no
 * timezone conversion is needed — just arithmetic on the HHMM values.
 *
 * @param hours    The stored PlaceOpeningHours (periods in local time)
 * @param dayDate  ISO "YYYY-MM-DD" of the activity; falls back to today
 * @param startTime "HH:mm" planned start time
 */
export function getOpenStatus(
  hours:     PlaceOpeningHours | undefined,
  dayDate:   string | undefined,
  startTime: string,
): OpenStatus {
  if (!hours?.periods?.length) return 'UNKNOWN';

  // luxon weekday: 1 = Mon … 7 = Sun  →  Google day: 0 = Sun … 6 = Sat
  const ldt = dayDate ? DateTime.fromISO(dayDate) : DateTime.now();
  const dow = ldt.weekday % 7; // 1→1 … 6→6, 7→0

  const [hh, mm] = startTime.split(':').map(Number);
  const startNum = hh * 100 + mm;                // e.g. 930

  for (const period of hours.periods) {
    if (!period.close) return 'OPEN';            // 24-hour open

    const openDay  = period.open.day;
    const closeDay = period.close.day;
    const openNum  = parseInt(period.open.time,  10);
    const closeNum = parseInt(period.close.time, 10);

    // ── same-day period ───────────────────────────────────────────────────
    if (openDay === dow && closeDay === dow) {
      if (startNum >= openNum && startNum < closeNum) {
        const closeMinutes = Math.floor(closeNum / 100) * 60 + closeNum % 100;
        const startMinutes = hh * 60 + mm;
        return closeMinutes - startMinutes <= 60 ? 'CLOSES_SOON' : 'OPEN';
      }
      continue;
    }

    // ── overnight: opened today, closes tomorrow ──────────────────────────
    if (openDay === dow && closeDay === (dow + 1) % 7 && startNum >= openNum) {
      return 'OPEN';
    }

    // ── overnight: opened yesterday, closes today ─────────────────────────
    if (closeDay === dow && openDay === (dow + 6) % 7 && startNum < closeNum) {
      const closeMinutes = Math.floor(closeNum / 100) * 60 + closeNum % 100;
      const startMinutes = hh * 60 + mm;
      return closeMinutes - startMinutes <= 60 ? 'CLOSES_SOON' : 'OPEN';
    }
  }

  return 'CLOSED';
}
