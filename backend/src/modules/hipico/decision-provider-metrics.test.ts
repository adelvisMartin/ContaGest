import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDecisionProviderMetrics,
  canonicalIntentToJevClass,
  decisionProviderMetricRates,
  decisionProviderReadiness
} from './decision-provider-metrics.js';

const enabledStatus = {
  providerId: 'typesafe-jev',
  mode: 'SHADOW' as const,
  enabled: true,
  configured: true,
  authoritative: false as const,
  reasons: []
};

function window(overrides: Record<string, number> = {}) {
  return {
    evaluations: 200,
    observed: 200,
    unavailable: 0,
    skipped: 0,
    reviewedObserved: 200,
    intentClassMatched: 200,
    safetyDisagreements: 0,
    ...overrides
  };
}

function metrics(overrides: Record<string, unknown> = {}) {
  return buildDecisionProviderMetrics({
    providerId: 'typesafe-jev',
    historical: window(),
    recent: window({ evaluations: 75, observed: 75, reviewedObserved: 75, intentClassMatched: 75 }),
    byIntentClass: {
      query_next_race: { reviewedObserved: 100, intentClassMatched: 100 },
      monetary: { reviewedObserved: 100, intentClassMatched: 100 }
    },
    recentSince: '2026-08-25T00:00:00.000Z',
    ...overrides
  } as any);
}

test('canonical Jev intent classes cover query, lifecycle, monetary, security and conversational families', () => {
  assert.equal(canonicalIntentToJevClass('query:NEXT_RACE'), 'query_next_race');
  assert.equal(canonicalIntentToJevClass('query:LAST_RESULT'), 'query_last_result');
  assert.equal(canonicalIntentToJevClass('race_open'), 'lifecycle');
  assert.equal(canonicalIntentToJevClass('betting_or_balance'), 'monetary');
  assert.equal(canonicalIntentToJevClass('security_review'), 'security');
  assert.equal(canonicalIntentToJevClass('help'), 'greeting_help');
  assert.equal(canonicalIntentToJevClass('document_reference'), 'unknown');
});

test('provider rates exclude configured-off skips from availability and fail closed without attempts', () => {
  assert.deepEqual(decisionProviderMetricRates(window({
    evaluations: 12,
    observed: 9,
    unavailable: 1,
    skipped: 2,
    reviewedObserved: 8,
    intentClassMatched: 7,
    safetyDisagreements: 1
  })), {
    intentClassAccuracy: 7 / 8,
    availabilityRate: .9,
    safetyDisagreementRate: 1 / 9
  });

  assert.deepEqual(decisionProviderMetricRates(window({
    evaluations: 10,
    observed: 0,
    unavailable: 0,
    skipped: 10,
    reviewedObserved: 0,
    intentClassMatched: 0
  })), {
    intentClassAccuracy: 0,
    availabilityRate: 0,
    safetyDisagreementRate: 0
  });
});

test('readiness is informational only and remains blocked when provider is disabled or samples are insufficient', () => {
  const disabled = decisionProviderReadiness({ ...enabledStatus, mode: 'OFF', enabled: false }, metrics());
  assert.equal(disabled.eligibleForAssistedRanking, false);
  assert.equal(disabled.authoritative, false);
  assert.equal(disabled.reason, 'PROVIDER_DISABLED');

  const insufficient = decisionProviderReadiness(enabledStatus, metrics({
    historical: window({ reviewedObserved: 199, intentClassMatched: 199 })
  }));
  assert.equal(insufficient.eligibleForAssistedRanking, false);
  assert.equal(insufficient.reason, 'PROVIDER_SHADOW_SAMPLE_INSUFFICIENT');
});

test('readiness rejects safety, accuracy and availability degradation in either window', () => {
  const safety = decisionProviderReadiness(enabledStatus, metrics({
    recent: window({ evaluations: 75, observed: 75, reviewedObserved: 75, intentClassMatched: 75, safetyDisagreements: 1 })
  }));
  assert.equal(safety.reason, 'PROVIDER_SAFETY_DISAGREEMENT');

  const accuracy = decisionProviderReadiness(enabledStatus, metrics({
    recent: window({ evaluations: 75, observed: 75, reviewedObserved: 75, intentClassMatched: 73 })
  }));
  assert.equal(accuracy.reason, 'PROVIDER_ACCURACY_BELOW_GATE');

  const availability = decisionProviderReadiness(enabledStatus, metrics({
    recent: window({ evaluations: 76, observed: 75, unavailable: 1, reviewedObserved: 75, intentClassMatched: 75 })
  }));
  assert.equal(availability.reason, 'PROVIDER_AVAILABILITY_BELOW_GATE');
});

test('readiness can pass only as assisted-ranking evidence and never grants authority', () => {
  const result = decisionProviderReadiness(enabledStatus, metrics());
  assert.equal(result.eligibleForAssistedRanking, true);
  assert.equal(result.reason, 'PROVIDER_SHADOW_GATE_PASSED');
  assert.equal(result.authoritative, false);
  assert.equal((result as any).canAuthorize, undefined);
});

test('provider metric signatures are deterministic across intent aggregate key order', () => {
  const left = metrics();
  const right = buildDecisionProviderMetrics({
    providerId: 'typesafe-jev',
    historical: window(),
    recent: window({ evaluations: 75, observed: 75, reviewedObserved: 75, intentClassMatched: 75 }),
    byIntentClass: {
      monetary: { reviewedObserved: 100, intentClassMatched: 100 },
      query_next_race: { reviewedObserved: 100, intentClassMatched: 100 }
    },
    recentSince: '2026-08-25T00:00:00.000Z'
  });
  assert.equal(left.metricsSignature, right.metricsSignature);
  assert.match(left.metricsSignature, /^[a-f0-9]{64}$/);
});
