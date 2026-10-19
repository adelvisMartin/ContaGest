// @ts-check
/**
 * Gym performance buckets use workout-session start timestamps, the same
 * owner field used by /gym/performance SQL period filters. Set record time
 * remains provenance metadata and must not migrate volume between periods.
 * @param {unknown} startedAt
 */
export function gymPerformanceSessionDay(startedAt) {
  const value=startedAt instanceof Date ? startedAt : typeof startedAt==='string' ? new Date(startedAt) : null;
  if(!value||!Number.isFinite(value.getTime()))throw new TypeError('GYM_PERFORMANCE_SESSION_DATE_INVALID');
  return value.toISOString().slice(0,10);
}
