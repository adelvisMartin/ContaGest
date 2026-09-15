import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');

test('promotion decision, metric snapshot and transition insert share one locked transaction', () => {
  const setModeStart = source.indexOf('async setMode(input:');
  const setModeEnd = source.indexOf('async recordEvaluation(input:', setModeStart);
  assert.ok(setModeStart >= 0 && setModeEnd > setModeStart);
  const setMode = source.slice(setModeStart, setModeEnd);

  assert.match(setMode, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(setMode, /await lockScope\(tx,/);
  assert.match(setMode, /readMetricsSnapshot\(tx,/);
  assert.match(setMode, /canPromoteAutomation\(current, input\.target, metrics, input\.ownerApproved\)/);
  assert.match(setMode, /INSERT INTO public\.hipico_automation_transition_events/);
  assert.match(setMode, /\$\{JSON\.stringify\(metrics\)\}::jsonb/);
  assert.match(setMode, /\$\{JSON\.stringify\(decision\)\}::jsonb/);
});

test('idempotent transition replay returns the persisted snapshot without recomputing current metrics', () => {
  const priorStart = source.indexOf('if (prior[0])');
  const currentRead = source.indexOf('const rows = await tx.$queryRaw<Array<{ mode: AutomationState }>>', priorStart);
  assert.ok(priorStart >= 0 && currentRead > priorStart);
  const replayBranch = source.slice(priorStart, currentRead);

  assert.match(replayBranch, /metrics: event\.metrics/);
  assert.match(replayBranch, /decision: event\.decision/);
  assert.doesNotMatch(replayBranch, /readMetricsSnapshot/);
  assert.doesNotMatch(replayBranch, /canPromoteAutomation/);
});
