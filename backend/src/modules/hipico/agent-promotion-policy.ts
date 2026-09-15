import type {
  AutomationMetricRates,
  AutomationMetrics,
  AutomationMetricWindow,
  AutomationState,
  PromotionDecision
} from './agent-policy.js';

type PromotionTarget = Exclude<AutomationState, 'DISABLED' | 'SHADOW'>;
type PromotionGate = {
  historicalReviewed: number;
  recentReviewed: number;
  accuracy: number;
  conflictRate: number;
  abstentionRate: number;
  raceContextErrorRate: number;
  passReason: string;
  historicalFailureReason: string;
};

const AUTOMATION_STATES_INTERNAL: readonly AutomationState[] = [
  'DISABLED',
  'SHADOW',
  'ASSISTED',
  'AUTOMATIC_LOW_RISK',
  'AUTOMATIC'
];
const RECENT_WINDOW_DAYS = 30;
const METRIC_SCHEMA_VERSION = 'v7';

const PROMOTION_GATES: Record<PromotionTarget, PromotionGate> = {
  ASSISTED: {
    historicalReviewed: 200,
    recentReviewed: 75,
    accuracy: .98,
    conflictRate: .02,
    abstentionRate: .05,
    raceContextErrorRate: .02,
    passReason: 'SHADOW_GATE_PASSED',
    historicalFailureReason: 'SHADOW_METRICS_INSUFFICIENT'
  },
  AUTOMATIC_LOW_RISK: {
    historicalReviewed: 500,
    recentReviewed: 200,
    accuracy: .99,
    conflictRate: .005,
    abstentionRate: .03,
    raceContextErrorRate: .005,
    passReason: 'LOW_RISK_GATE_PASSED',
    historicalFailureReason: 'LOW_RISK_METRICS_INSUFFICIENT'
  },
  AUTOMATIC: {
    historicalReviewed: 1000,
    recentReviewed: 400,
    accuracy: .995,
    conflictRate: .002,
    abstentionRate: .02,
    raceContextErrorRate: .002,
    passReason: 'AUTOMATIC_GATE_PASSED',
    historicalFailureReason: 'AUTOMATIC_METRICS_INSUFFICIENT'
  }
};

function nonNegative(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function metricRates(metrics: AutomationMetricWindow): AutomationMetricRates {
  const reviewed = nonNegative(metrics.reviewed);
  const matched = Math.min(reviewed, nonNegative(metrics.matched));
  const conflicts = nonNegative(metrics.conflicts);
  const abstentions = nonNegative(metrics.abstentions);
  const raceContextErrors = nonNegative(metrics.raceContextErrors);
  return {
    accuracy: reviewed ? matched / reviewed : 0,
    conflictRate: reviewed ? conflicts / reviewed : 1,
    abstentionRate: reviewed ? abstentions / reviewed : 1,
    raceContextErrorRate: reviewed ? raceContextErrors / reviewed : 1
  };
}

function metricWindowPasses(window: AutomationMetricWindow, gate: PromotionGate, minimumReviewed: number) {
  const calculated = metricRates(window);
  return nonNegative(window.reviewed) >= minimumReviewed
    && calculated.accuracy >= gate.accuracy
    && calculated.conflictRate <= gate.conflictRate
    && calculated.abstentionRate <= gate.abstentionRate
    && calculated.raceContextErrorRate <= gate.raceContextErrorRate
    && nonNegative(window.highRiskFalsePositive) === 0
    && nonNegative(window.unauthorizedAction) === 0;
}

function recentWindowValid(metrics: AutomationMetrics) {
  return Boolean(metrics.recent)
    && metrics.window?.recentDays === RECENT_WINDOW_DAYS
    && metrics.window?.metricSchemaVersion === METRIC_SCHEMA_VERSION;
}

function decisionMetrics(metrics: AutomationMetrics) {
  const historical = metricRates(metrics);
  return metrics.recent
    ? { ...historical, recent: metricRates(metrics.recent) }
    : historical;
}

export function evaluateAutomationPromotion(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  const calculated = decisionMetrics(metrics);
  const currentIndex = AUTOMATION_STATES_INTERNAL.indexOf(current);
  const targetIndex = AUTOMATION_STATES_INTERNAL.indexOf(target);

  if (currentIndex < 0 || targetIndex < 0) {
    return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  }
  if (targetIndex <= currentIndex) {
    return { allowed: true, reason: 'DOWNGRADE_OR_SAME_STATE', metrics: calculated };
  }
  if (targetIndex !== currentIndex + 1) {
    return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  }
  if (target === 'SHADOW') {
    return { allowed: true, reason: 'SHADOW_SAFE_DEFAULT', metrics: calculated };
  }
  if (target === 'AUTOMATIC' && !ownerApproved) {
    return { allowed: false, reason: 'OWNER_APPROVAL_REQUIRED', metrics: calculated };
  }

  const gate = PROMOTION_GATES[target as PromotionTarget];
  if (!gate) {
    return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  }
  if (!metricWindowPasses(metrics, gate, gate.historicalReviewed)) {
    return { allowed: false, reason: gate.historicalFailureReason, metrics: calculated };
  }
  if (!recentWindowValid(metrics) || !metricWindowPasses(metrics.recent!, gate, gate.recentReviewed)) {
    return { allowed: false, reason: 'RECENT_METRICS_INSUFFICIENT', metrics: calculated };
  }
  return { allowed: true, reason: gate.passReason, metrics: calculated };
}
