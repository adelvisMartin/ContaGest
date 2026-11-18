/**
 * Serialize the same user's Gym workout outbox flush across PWA tabs.
 * The server's eventKey remains the authoritative deduplication boundary,
 * including clients without Web Locks and requests that outlive a tab.
 */
export async function withGymWorkoutSyncLock(scopeToken, flush, locks = globalThis.navigator?.locks) {
  if (typeof scopeToken !== 'string' || !/^[a-z0-9]+-[a-z0-9]+$/.test(scopeToken)) {
    throw new Error('OFFLINE_WORKOUT_SYNC_SCOPE_INVALID');
  }
  if (typeof flush !== 'function') throw new TypeError('La sincronización debe ser una función.');
  if (typeof locks?.request !== 'function') return flush();
  return locks.request('contagest:gym-workout-sync:' + scopeToken, { mode: 'exclusive' }, flush);
}
