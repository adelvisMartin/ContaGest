/** Calendar-day input authority for Gym reporting and non-clinical plans.
 * Reject normalized impossible dates and locale-dependent date strings. */
export function validGymCalendarDay(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
