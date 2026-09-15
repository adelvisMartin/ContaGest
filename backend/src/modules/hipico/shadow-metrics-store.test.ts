import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storeSource = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
const repositorySource = readFileSync(new URL('./automation-metrics.repository.ts', import.meta.url), 'utf8');
const evaluationSource = readFileSync(new URL('./automation-evaluation.repository.ts', import.meta.url), 'utf8');
const scopeSource = readFileSync(new URL('./automation-scope.ts', import.meta.url), 'utf8');
const metricsSource = readFileSync(new URL('./shadow-metrics.ts', import.meta.url), 'utf8');

test('AutomationStore metrics remain server-measured and include historical/recent/per-intent dimensions', () => {
  assert.match(storeSource, /readAutomationMetricsSnapshot/);
  assert.match(storeSource, /lockAutomationScope/);
  assert.match(scopeSource, /pg_advisory_xact_lock/);
  assert.match(repositorySource, /metric_schema_version\s*=\s*'v7'/i);
  assert.match(repositorySource, /reviewed_at\s*>=\s*now\(\)\s*-\s*interval\s*'30 days'/i);
  assert.match(repositorySource, /actual_intent\s+AS\s+"actualIntent"/i);
  assert.match(repositorySource, /race_context_error/i);
  assert.match(repositorySource, /abstained/i);
  assert.match(repositorySource, /GROUP BY actual_intent/i);
  assert.match(repositorySource, /buildAutomationMetrics/);
  assert.match(metricsSource, /metricsSignature/);
  assert.match(metricsSource, /canonicalMetricsSignature/);
});

test('new evaluations retain v7 metric tag and canonical abstention derivation', () => {
  assert.match(evaluationSource, /metric_schema_version/i);
  assert.match(evaluationSource, /SHADOW_METRIC_SCHEMA_VERSION/);
  assert.match(storeSource, /candidate\.intent\s*===\s*'unknown'/);
});

test('promotion replay returns persisted metrics before any new metric read', () => {
  const priorIndex = storeSource.indexOf('if (prior)');
  const metricsReadIndex = storeSource.indexOf('readAutomationMetricsSnapshot', priorIndex);
  assert.ok(priorIndex >= 0);
  assert.ok(metricsReadIndex > priorIndex);
  const replayBlock = storeSource.slice(priorIndex, metricsReadIndex);
  assert.match(replayBlock, /metrics:\s*prior\.metrics/);
});
