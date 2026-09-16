const STATUS_VALUES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);

function normalizeStatus(value) {
  const normalized = String(value || 'NOT_EXECUTED').trim().toUpperCase();
  return STATUS_VALUES.has(normalized) ? normalized : 'NOT_EXECUTED';
}

function capScore(state, value, reason) {
  if (state.score <= value) return;
  state.score = value;
  state.appliedCaps.push({ max: value, reason });
}

export function computeReadinessScore({
  statuses = [],
  p0Open = null,
  codeReviewStatus = 'NOT_EXECUTED',
  securityCritical = null,
  raceContextVerified = false
} = {}) {
  const normalized = Array.isArray(statuses) ? statuses.map(normalizeStatus) : [];
  const passed = normalized.filter((value) => value === 'PASS').length;
  const state = {
    score: normalized.length ? Math.round((passed / normalized.length) * 100) : 0,
    appliedCaps: []
  };

  if (p0Open === true) capScore(state, 60, 'P0_OPEN');
  if (normalizeStatus(codeReviewStatus) === 'FAIL') capScore(state, 79, 'REQUIRED_CODE_CI_RED');
  if (securityCritical === true) capScore(state, 69, 'SECURITY_CRITICAL');
  if (raceContextVerified !== true) capScore(state, 70, 'RACE_CONTEXT_NOT_VERIFIED');

  return {
    ...state,
    passed,
    total: normalized.length,
    statuses: normalized
  };
}

export function deriveAutomationReadiness({
  evidenceStatus = 'NOT_EXECUTED',
  agentShadowStatus = 'NOT_EXECUTED',
  raceContextStatus = 'NOT_EXECUTED'
} = {}) {
  return [evidenceStatus, agentShadowStatus, raceContextStatus].every((value) => normalizeStatus(value) === 'PASS')
    ? 'VERIFIED'
    : 'NOT_VERIFIED';
}

export function deriveProductionReadinessState({
  stablePromotionStatus = 'NOT_EXECUTED',
  p0Open = null,
  securityCritical = null,
  automationReadiness = 'NOT_VERIFIED'
} = {}) {
  const stable = normalizeStatus(stablePromotionStatus);
  if (stable === 'FAIL' || p0Open === true || securityCritical === true) return 'FAIL';
  if (stable === 'BLOCKED') return 'BLOCKED';
  if (stable !== 'PASS') return 'NOT_EXECUTED';
  if (p0Open !== false || securityCritical !== false) return 'NOT_EXECUTED';
  if (automationReadiness !== 'VERIFIED') return 'NOT_EXECUTED';
  return 'PASS';
}

export const __test__ = { normalizeStatus };
