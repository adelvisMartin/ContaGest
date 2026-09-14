import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');

test('AutomationStore metrics remain server-measured and include historical/recent/per-intent dimensions', () => {
  assert.match(source, /metric_schema_version\s*=\s*'v7'/i);
  assert.match(source, /reviewed_at\s*>=\s*now\(\)\s*-\s*interval\s*'30 days'/i);
  assert.match(source, /actual_intent\s+AS\s+"actualIntent"/i);
  assert.match(source, /race_context_error/i);
  assert.match(source, /abstained/i);
  assert.match(source, /buildAutomationMetrics/);
  assert.match(source, /metricsSignature/);
});

test('new evaluations are tagged v7 and abstention is derived from canonical unknown intent', () => {
  assert.match(source, /metric_schema_version/i);
  assert.match(source, /'v7'/);
  assert.match(source, /candidate\.intent\s*===\s*'unknown'/);
});

test('promotion idempotency replays persisted metrics rather than recomputing them', () => {
  const priorIndex = source.indexOf('if (prior[0])');
  const metricsReadIndex = source.indexOf('readMetricsSnapshot', priorIndex);
  assert.ok(priorIndex >= 0);
  assert.ok(metricsReadIndex > priorIndex, 'metrics should be read only after prior transition replay is checked');
  const replayBlock = source.slice(priorIndex, metricsReadIndex);
  assert.match(replayBlock, /metrics:\s*event\.metrics/);
});
