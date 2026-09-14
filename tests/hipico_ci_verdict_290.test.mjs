import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyJob, summarizeBlocker } from '../scripts/hipico-ci-verdict-v290.mjs';

const executedSteps = [{ name: 'Checkout', status: 'completed', conclusion: 'success' }];

test('runner-aware verdict distinguishes executed failures from failures before runner assignment', () => {
  assert.equal(classifyJob({ conclusion: 'success', runner_id: 42, steps: executedSteps }), 'PASS');
  assert.equal(classifyJob({ conclusion: 'failure', runner_id: 42, steps: executedSteps }), 'FAIL');
  assert.equal(classifyJob({ conclusion: 'failure', runner_id: 0, steps: [] }), 'BLOCKED');
  assert.equal(classifyJob({ conclusion: 'failure', runner_id: 0, steps: executedSteps }), 'FAIL');
  assert.equal(classifyJob({ conclusion: 'skipped', runner_id: null, steps: [] }), 'NOT_EXECUTED');
  assert.equal(classifyJob({ conclusion: null, runner_id: 0, steps: [] }), 'NOT_EXECUTED');
});

test('infrastructure blocker is emitted only when runner blockage exists and no executed failure exists', () => {
  assert.equal(summarizeBlocker(['PASS', 'PASS', 'NOT_EXECUTED']), '');
  assert.equal(summarizeBlocker(['PASS', 'BLOCKED', 'NOT_EXECUTED']), 'BLOCKED_INFRASTRUCTURE');
  assert.equal(summarizeBlocker(['PASS', 'BLOCKED', 'FAIL']), '');
  assert.equal(summarizeBlocker(['FAIL']), '');
});
