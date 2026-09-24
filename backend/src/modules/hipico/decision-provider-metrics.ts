import crypto from 'node:crypto';
import type { DecisionProviderPublicStatus } from './decision-provider.js';

export const DECISION_PROVIDER_METRIC_SCHEMA_VERSION = 'jev-shadow-v1';
export const DECISION_PROVIDER_RECENT_WINDOW_DAYS = 30;
export const DECISION_PROVIDER_READINESS_GATE_VERSION = 'jev-shadow-readiness-v1';

export const JEV_INTENT_CLASSES = [
  'query_race_status',
  'query_next_race',
  'query_last_result',
  'query_schedule',
  'query_scratches',
  'lifecycle',
  'monetary',
  'security',
  'greeting_help',
  'unknown'
] as const;

export type JevIntentClass = typeof JEV_INTENT_CLASSES[number];

export type DecisionProviderMetricWindow = {
  evaluations: number;
  observed: number;
  unavailable: number;
  skipped: number;
  reviewedObserved: number;
  intentClassMatched: number;
  safetyDisagreements: number;
};

export type DecisionProviderIntentMetrics = {
  reviewedObserved: number;
  intentClassMatched: number;
};

export type DecisionProviderMetrics = {
  providerId: string;
  historical: DecisionProviderMetricWindow;
  recent: DecisionProviderMetricWindow;
  byIntentClass: Record<string, DecisionProviderIntentMetrics>;
  window: {
    recentDays: number;
    recentSince: string;
    metricSchemaVersion: string;
  };
  metricsSignature: string;
};

export type DecisionProviderMetricRates = {
  intentClassAccuracy: number;
  availabilityRate: number;
  safetyDisagreementRate: number;
};

export type DecisionProviderReadiness = {
  eligibleForAssistedRanking: boolean;
  authoritative: false;
  reason: string;
  gateVersion: string;
  historical: DecisionProviderMetricRates;
  recent: DecisionProviderMetricRates;
  thresholds: {
    historicalReviewedObserved: number;
    recentReviewedObserved: number;
    intentClassAccuracy: number;
    availabilityRate: number;
    safetyDisagreements: 0;
  };
};

const READINESS_THRESHOLDS = Object.freeze({
  historicalReviewedObserved: 200,
  recentReviewedObserved: 75,
  intentClassAccuracy: .98,
  availabilityRate: .99,
  safetyDisagreements: 0 as const
});

const MONETARY_INTENTS = new Set([
  'balance_snapshot',
  'settlement_snapshot',
  'plan_snapshot',
  'pending_confirmation',
  'cancel_or_correction',
  'offer_confirmation',
  'offer_receiver',
  'offer_player',
  'polla_or_parley',
  'betting_or_balance'
]);

const LIFECYCLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'day_close']);

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function canonicalIntentToJevClass(intent: unknown): JevIntentClass {
  const value = String(intent || '').trim();
  if (value === 'query:RACE_STATUS' || value === 'status_non_monetary') return 'query_race_status';
  if (value === 'query:NEXT_RACE') return 'query_next_race';
  if (value === 'query:LAST_RESULT') return 'query_last_result';
  if (value === 'query:SCHEDULE') return 'query_schedule';
  if (value === 'query:SCRATCHES') return 'query_scratches';
  if (LIFECYCLE_INTENTS.has(value)) return 'lifecycle';
  if (MONETARY_INTENTS.has(value)) return 'monetary';
  if (value === 'security_review') return 'security';
  if (value === 'greeting' || value === 'help') return 'greeting_help';
  return 'unknown';
}

export function normalizeDecisionProviderMetricWindow(value: Partial<Record<keyof DecisionProviderMetricWindow, unknown>> = {}): DecisionProviderMetricWindow {
  const evaluations = nonNegativeInteger(value.evaluations);
  const observed = Math.min(evaluations, nonNegativeInteger(value.observed));
  const unavailable = Math.min(evaluations, nonNegativeInteger(value.unavailable));
  const skipped = Math.min(evaluations, nonNegativeInteger(value.skipped));
  const reviewedObserved = Math.min(observed, nonNegativeInteger(value.reviewedObserved));
  return {
    evaluations,
    observed,
    unavailable,
    skipped,
    reviewedObserved,
    intentClassMatched: Math.min(reviewedObserved, nonNegativeInteger(value.intentClassMatched)),
    safetyDisagreements: Math.min(observed, nonNegativeInteger(value.safetyDisagreements))
  };
}

export function decisionProviderMetricRates(value: DecisionProviderMetricWindow): DecisionProviderMetricRates {
  const row = normalizeDecisionProviderMetricWindow(value);
  const attempted = row.observed + row.unavailable;
  return {
    intentClassAccuracy: row.reviewedObserved ? row.intentClassMatched / row.reviewedObserved : 0,
    availabilityRate: attempted ? row.observed / attempted : 0,
    safetyDisagreementRate: row.observed ? row.safetyDisagreements / row.observed : 0
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function buildDecisionProviderMetrics(input: {
  providerId: string;
  historical: Partial<Record<keyof DecisionProviderMetricWindow, unknown>>;
  recent: Partial<Record<keyof DecisionProviderMetricWindow, unknown>>;
  byIntentClass?: Record<string, Partial<Record<keyof DecisionProviderIntentMetrics, unknown>>>;
  recentSince: string;
}): DecisionProviderMetrics {
  const historical = normalizeDecisionProviderMetricWindow(input.historical);
  const recent = normalizeDecisionProviderMetricWindow(input.recent);
  const byIntentClass = Object.fromEntries(Object.entries(input.byIntentClass || {})
    .filter(([key]) => (JEV_INTENT_CLASSES as readonly string[]).includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const reviewedObserved = nonNegativeInteger(value.reviewedObserved);
      return [key, {
        reviewedObserved,
        intentClassMatched: Math.min(reviewedObserved, nonNegativeInteger(value.intentClassMatched))
      }];
    }));
  const window = {
    recentDays: DECISION_PROVIDER_RECENT_WINDOW_DAYS,
    recentSince: input.recentSince,
    metricSchemaVersion: DECISION_PROVIDER_METRIC_SCHEMA_VERSION
  };
  const signaturePayload = {
    gateVersion: DECISION_PROVIDER_READINESS_GATE_VERSION,
    providerId: input.providerId,
    historical,
    recent,
    byIntentClass,
    window
  };
  return {
    providerId: input.providerId,
    historical,
    recent,
    byIntentClass,
    window,
    metricsSignature: crypto.createHash('sha256').update(JSON.stringify(stableValue(signaturePayload))).digest('hex')
  };
}

function windowPassesQuality(window: DecisionProviderMetricWindow) {
  const rates = decisionProviderMetricRates(window);
  return rates.intentClassAccuracy >= READINESS_THRESHOLDS.intentClassAccuracy
    && rates.availabilityRate >= READINESS_THRESHOLDS.availabilityRate
    && window.safetyDisagreements === READINESS_THRESHOLDS.safetyDisagreements;
}

export function decisionProviderReadiness(
  status: DecisionProviderPublicStatus,
  metrics: DecisionProviderMetrics
): DecisionProviderReadiness {
  const historical = decisionProviderMetricRates(metrics.historical);
  const recent = decisionProviderMetricRates(metrics.recent);
  const base = {
    authoritative: false as const,
    gateVersion: DECISION_PROVIDER_READINESS_GATE_VERSION,
    historical,
    recent,
    thresholds: READINESS_THRESHOLDS
  };

  if (!status.enabled || status.mode !== 'SHADOW') {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_DISABLED' };
  }
  if (metrics.historical.reviewedObserved < READINESS_THRESHOLDS.historicalReviewedObserved) {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_SHADOW_SAMPLE_INSUFFICIENT' };
  }
  if (metrics.recent.reviewedObserved < READINESS_THRESHOLDS.recentReviewedObserved) {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_RECENT_SAMPLE_INSUFFICIENT' };
  }
  if (metrics.historical.safetyDisagreements > 0 || metrics.recent.safetyDisagreements > 0) {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_SAFETY_DISAGREEMENT' };
  }
  if (historical.intentClassAccuracy < READINESS_THRESHOLDS.intentClassAccuracy
    || recent.intentClassAccuracy < READINESS_THRESHOLDS.intentClassAccuracy) {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_ACCURACY_BELOW_GATE' };
  }
  if (historical.availabilityRate < READINESS_THRESHOLDS.availabilityRate
    || recent.availabilityRate < READINESS_THRESHOLDS.availabilityRate) {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_AVAILABILITY_BELOW_GATE' };
  }
  if (!windowPassesQuality(metrics.historical) || !windowPassesQuality(metrics.recent)) {
    return { ...base, eligibleForAssistedRanking: false, reason: 'PROVIDER_READINESS_INSUFFICIENT' };
  }
  return { ...base, eligibleForAssistedRanking: true, reason: 'PROVIDER_SHADOW_GATE_PASSED' };
}

export const __test__ = {
  READINESS_THRESHOLDS,
  MONETARY_INTENTS,
  LIFECYCLE_INTENTS,
  stableValue,
  windowPassesQuality
};
