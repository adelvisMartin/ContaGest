import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const storeUrl = new URL('./automation.store.ts', import.meta.url);
const scopeUrl = new URL('./automation-scope.ts', import.meta.url);
const metricsUrl = new URL('./automation-metrics.repository.ts', import.meta.url);
const transitionUrl = new URL('./automation-transition.repository.ts', import.meta.url);
const evaluationUrl = new URL('./automation-evaluation.repository.ts', import.meta.url);

test('v8 AutomationStore delegates scope and metrics reads to focused modules', () => {
  assert.equal(existsSync(scopeUrl), true, 'automation-scope.ts must exist');
  assert.equal(existsSync(metricsUrl), true, 'automation-metrics.repository.ts must exist');

  const source = readFileSync(storeUrl, 'utf8');
  assert.match(source, /assertAutomationScope/);
  assert.match(source, /lockAutomationScope/);
  assert.match(source, /readAutomationMetricsSnapshot/);
});

test('v8 metrics repository preserves v7 recent-window and per-intent SQL semantics', () => {
  assert.equal(existsSync(metricsUrl), true, 'automation-metrics.repository.ts must exist');
  const source = readFileSync(metricsUrl, 'utf8');
  assert.match(source, /metric_schema_version\s*=\s*'v7'/i);
  assert.match(source, /reviewed_at\s*>=\s*now\(\)\s*-\s*interval\s*'30 days'/i);
  assert.match(source, /actual_intent\s+AS\s+"actualIntent"/i);
  assert.match(source, /GROUP BY actual_intent/i);
  assert.match(source, /buildAutomationMetrics/);
});

test('v8 AutomationStore delegates transition and evaluation SQL without moving orchestration decisions', () => {
  assert.equal(existsSync(transitionUrl), true, 'automation-transition.repository.ts must exist');
  assert.equal(existsSync(evaluationUrl), true, 'automation-evaluation.repository.ts must exist');

  const source = readFileSync(storeUrl, 'utf8');
  assert.match(source, /readTransitionByIdempotency/);
  assert.match(source, /readCurrentAutomationModeForUpdate/);
  assert.match(source, /insertAutomationTransition/);
  assert.match(source, /insertAgentEvaluation/);
  assert.match(source, /readEvaluationForReview/);
  assert.match(source, /updateEvaluationReview/);
  assert.match(source, /listAgentEvaluations/);
  assert.match(source, /listAutomationTransitions/);
  assert.match(source, /HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH/);
  assert.match(source, /HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED/);
});
