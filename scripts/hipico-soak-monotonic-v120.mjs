/**
 * #120: Measure soak duration with a monotonic process clock, never UTC wall
 * time. UTC timestamps remain evidence metadata; a wall-clock adjustment must
 * not shorten the required 24-hour observation window.
 */
export function monotonicElapsedMs(startedAtMs, nowMs) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs) || nowMs < startedAtMs) {
    throw new Error('HIPICO_SOAK_MONOTONIC_CLOCK_INVALID');
  }
  return Math.floor(nowMs - startedAtMs);
}

export function remainingSoakMs(startedAtMs, durationMinutes, nowMs) {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 ||
      !Number.isSafeInteger(Math.ceil(durationMinutes * 60_000))) {
    throw new Error('HIPICO_SOAK_DURATION_INVALID');
  }
  return Math.max(0, Math.ceil(durationMinutes * 60_000 - monotonicElapsedMs(startedAtMs, nowMs)));
}
