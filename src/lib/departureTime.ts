/**
 * Builds a local-time Date from a "HH:mm" string and an optional ISO date,
 * always guaranteed to be in the future so Google's transit API accepts it.
 *
 * - If isoDate is set, build the Date for that calendar day. If the result is
 *   already in the past, advance by multiples of 7 days so the same weekday
 *   and time-of-day are preserved (weekday matters for transit schedules).
 * - If isoDate is absent, use today; if the time has passed, use tomorrow.
 */
export function buildDepartureDate(timeHHMM: string, isoDate?: string): Date {
  const [h, m] = timeHHMM.split(':').map(Number);
  const now     = new Date();

  if (isoDate) {
    const [y, mo, d] = isoDate.split('-').map(Number);
    const planned    = new Date(y, mo - 1, d, h, m, 0, 0);

    if (planned.getTime() > now.getTime()) return planned;

    // Past date: advance by the minimum number of full weeks to make it future.
    // This preserves the original weekday so transit patterns are representative.
    const MS_WEEK   = 7 * 24 * 60 * 60 * 1000;
    const weeksNeeded = Math.ceil((now.getTime() - planned.getTime()) / MS_WEEK);
    return new Date(planned.getTime() + weeksNeeded * MS_WEEK);
  }

  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}
