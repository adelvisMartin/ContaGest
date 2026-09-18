import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const store = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
const metricsStore = readFileSync(new URL('./automation-metrics.store.ts', import.meta.url), 'utf8');
const metricsSource = readFileSync(new URL('./shadow-metrics.ts', import.meta.url), 'utf8');

test('AutomationStore metrics remain server-measured and include historical/recent/per-intent dimensions', () => {
  assert.match(metricsStore, /metric_schema_version\s*=\s*'v7'/i);
  assert.match(metricsStore, /reviewed_at\s*>=\s*now\(\)\s*-\s*interval\s*'30 days'/i);
  assert.match(metricsStore, /actual_intent\s+AS\s+"actualIntent"/i);
  assert.match(metricsStore, /race_context_error/i);
  assert.match(metricsStore, /abstained/i);
  assert.match(metricsStore, /buildAutomationMetrics/);
  assert.match(metricsSource, /metricsSignature/);
  assert.match(metricsSource, /canonicalMetricsSignature/);
});

test('new evaluations are tagged with the canonical v7 schema and abstention comes from unknown intent', () => {
  assert.match(store, /metric_schema_version/);
  assert.match(store, /SHADOW_METRIC_SCHEMA_VERSION/);
  assert.match(metricsSource, /SHADOW_METRIC_SCHEMA_VERSION\s*=\s*'v7'/);
  assert.match(store, /candidate\.intent\s*===\s*'unknown'/);
});

test('promotion idempotency replays persisted metrics rather than recomputing them', () => {
  const priorIndex = store.indexOf('if (prior[0])');
  const metricsReadIndex = store.indexOf('readMetricsSnapshot', priorIndex);
  assert.ok(priorIndex >= 0);
  assert.ok(metricsReadIndex > priorIndex, 'metrics should be read only after prior transition replay is checked');
  const replayBlock = store.slice(priorIndex, metricsReadIndex);
  assert.match(replayBlock, /metrics:\s*event\.metrics/);
});
