import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
const transitionSource = readFileSync(new URL('./automation-transition.repository.ts', import.meta.url), 'utf8');

test('promotion decision, metric snapshot and transition insert share one locked transaction', () => {
  const setModeStart = source.indexOf('async setMode(input:');
  const setModeEnd = source.indexOf('async recordEvaluation(input:', setModeStart);
  assert.ok(setModeStart >= 0 && setModeEnd > setModeStart);
  const setMode = source.slice(setModeStart, setModeEnd);

  assert.match(setMode, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(setMode, /await lockAutomationScope\(tx,/);
  assert.match(setMode, /readTransitionByIdempotency\(tx,/);
  assert.match(setMode, /readCurrentAutomationModeForUpdate\(tx,/);
  assert.match(setMode, /readAutomationMetricsSnapshot\(tx,/);
  assert.match(setMode, /canPromoteAutomation\(current, input\.target, metrics, input\.ownerApproved\)/);
  assert.match(setMode, /insertAutomationTransition\(tx,/);
  assert.match(transitionSource, /INSERT INTO public\.hipico_automation_transition_events/);
  assert.match(transitionSource, /\$\{JSON\.stringify\(input\.metrics\)\}::jsonb/);
  assert.match(transitionSource, /\$\{JSON\.stringify\(input\.decision\)\}::jsonb/);
});

test('idempotent transition replay returns the persisted snapshot without recomputing current metrics', () => {
  const priorStart = source.indexOf('if (prior)');
  const currentRead = source.indexOf('readCurrentAutomationModeForUpdate', priorStart);
  assert.ok(priorStart >= 0 && currentRead > priorStart);
  const replayBranch = source.slice(priorStart, currentRead);

  assert.match(replayBranch, /metrics: prior\.metrics/);
  assert.match(replayBranch, /decision: prior\.decision/);
  assert.doesNotMatch(replayBranch, /readAutomationMetricsSnapshot/);
  assert.doesNotMatch(replayBranch, /canPromoteAutomation/);
});

test('SOURCE promotion remains fail-closed after scope extraction', () => {
  const setModeStart = source.indexOf('async setMode(input:');
  const setModeEnd = source.indexOf('async recordEvaluation(input:', setModeStart);
  const setMode = source.slice(setModeStart, setModeEnd);
  assert.match(setMode, /sourceMayTargetAutomation/);
  assert.match(setMode, /SOURCE_SHADOW_ONLY/);
});
