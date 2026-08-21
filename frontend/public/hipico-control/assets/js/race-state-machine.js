export const RACE_STATE = Object.freeze({
  PREPARING: 'PREPARING', OPEN: 'OPEN', CLOSED: 'CLOSED', RESULT_RECEIVED: 'RESULT_RECEIVED',
  SETTLEMENT_READY: 'SETTLEMENT_READY', SETTLED: 'SETTLED', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED'
});

const TRANSITIONS = Object.freeze({
  [RACE_STATE.PREPARING]: new Set([RACE_STATE.OPEN, RACE_STATE.CLOSED]),
  [RACE_STATE.OPEN]: new Set([RACE_STATE.CLOSED]),
  [RACE_STATE.CLOSED]: new Set([RACE_STATE.RESULT_RECEIVED]),
  [RACE_STATE.RESULT_RECEIVED]: new Set([RACE_STATE.SETTLEMENT_READY]),
  [RACE_STATE.SETTLEMENT_READY]: new Set([RACE_STATE.SETTLED]),
  [RACE_STATE.SETTLED]: new Set([RACE_STATE.PUBLISHED]),
  [RACE_STATE.PUBLISHED]: new Set([RACE_STATE.ARCHIVED]),
  [RACE_STATE.ARCHIVED]: new Set()
});

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function transitionRace(state, to, evidence = {}) {
  const from = state?.status || RACE_STATE.PREPARING;
  if (from === to) return { ...state, status: to };
  if (!canTransition(from, to)) {
    return { ...state, status: from, rejectedTransition: { from, to, reason: 'INVALID_TRANSITION', evidence } };
  }
  return {
    ...state,
    status: to,
    stateVersion: Number(state?.stateVersion || 0) + 1,
    lastTransitionAt: evidence.timestamp || new Date().toISOString(),
    lastTransitionSource: evidence.source || 'system'
  };
}

export function classifyTemporalEligibility(race, messageTimestamp) {
  if (!race?.closedAt) return { eligible: true, reason: 'OPEN_WINDOW' };
  const message = new Date(messageTimestamp || 0).getTime();
  const close = new Date(race.closedAt).getTime();
  if (!Number.isFinite(message) || !Number.isFinite(close)) return { eligible: false, reason: 'TIME_UNKNOWN' };
  return message <= close ? { eligible: true, reason: 'BEFORE_CLOSE' } : { eligible: false, reason: 'AFTER_CLOSE' };
}
