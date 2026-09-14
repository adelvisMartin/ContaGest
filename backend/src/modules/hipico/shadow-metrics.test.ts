import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutomationMetrics,
  canonicalMetricsSignature,
  metricRates,
  normalizeMetricWindow
} from './shadow-metrics.js';

const row = {
  reviewed: 100,
  matched: 98,
  highRiskFalsePositive: 0,
  unauthorizedAction: 0,
  conflicts: 1,
  abstentions: 3,
  raceContextErrors: 2
};

test('metricRates computes deterministic rates and fails closed on zero reviewed', () => {
  assert.deepEqual(metricRates(row), {
    accuracy: .98,
    conflictRate: .01,
    abstentionRate: .03,
    raceContextErrorRate: .02
  });
  assert.deepEqual(metricRates(normalizeMetricWindow({})), {
    accuracy: 0,
    conflictRate: 1,
    abstentionRate: 1,
    raceContextErrorRate: 1
  });
});

test('normalizeMetricWindow coerces bigint/string-like aggregate values into safe non-negative numbers', () => {
  assert.deepEqual(normalizeMetricWindow({
    reviewed: 5n,
    matched: '4',
    highRiskFalsePositive: -1,
    unauthorizedAction: null,
    conflicts: '2',
    abstentions: 1n,
    raceContextErrors: undefined
  }), {
    reviewed: 5,
    matched: 4,
    highRiskFalsePositive: 0,
    unauthorizedAction: 0,
    conflicts: 2,
    abstentions: 1,
    raceContextErrors: 0
  });
});

test('canonicalMetricsSignature is independent of object key insertion order', () => {
  const left = { gateVersion: 'v7', historical: row, recent: { reviewed: 75, matched: 75 }, byIntent: { b: { reviewed: 2 }, a: { reviewed: 1 } } };
  const right = { byIntent: { a: { reviewed: 1 }, b: { reviewed: 2 } }, recent: { matched: 75, reviewed: 75 }, historical: { ...row }, gateVersion: 'v7' };
  assert.match(canonicalMetricsSignature(left), /^[a-f0-9]{64}$/);
  assert.equal(canonicalMetricsSignature(left), canonicalMetricsSignature(right));
});

test('buildAutomationMetrics preserves historical top-level compatibility and attaches recent/byIntent/window/signature', () => {
  const result = buildAutomationMetrics({
    historical: row,
    recent: { ...row, reviewed: 75, matched: 74 },
    byIntent: {
      'query:NEXT_RACE': { reviewed: 50, matched: 50, highRiskFalsePositive: 0, unauthorizedAction: 0, conflicts: 0, abstentions: 0, raceContextErrors: 0 }
    },
    recentSince: '2026-08-15T00:00:00.000Z'
  });
  assert.equal(result.reviewed, 100);
  assert.equal(result.recent?.reviewed, 75);
  assert.equal(result.window?.recentDays, 30);
  assert.equal(result.window?.metricSchemaVersion, 'v7');
  assert.equal(result.byIntent?.['query:NEXT_RACE']?.matched, 50);
  assert.match(String(result.metricsSignature), /^[a-f0-9]{64}$/);
});
