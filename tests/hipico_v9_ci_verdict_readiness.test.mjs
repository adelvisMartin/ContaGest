import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as verdict from '../scripts/hipico-ci-verdict-v290.mjs';
import * as readiness from '../scripts/hipico-release-readiness-v9.mjs';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('CI verdict aggregates browser matrix jobs using GitHub matrix suffixes', () => {
  assert.equal(typeof verdict.classifyNamedJobs, 'function');
  const jobs = [
    { name: 'browser-matrix (chromium)', conclusion: 'success', runner_id: 11, steps: [{ conclusion: 'success' }] },
    { name: 'browser-matrix (firefox)', conclusion: 'success', runner_id: 12, steps: [{ conclusion: 'success' }] },
    { name: 'browser-matrix (webkit)', conclusion: 'success', runner_id: 13, steps: [{ conclusion: 'success' }] }
  ];
  assert.equal(verdict.classifyNamedJobs(jobs, 'browser-matrix'), 'PASS');

  const failed = jobs.map((job) => ({ ...job }));
  failed[1] = { ...failed[1], conclusion: 'failure' };
  assert.equal(verdict.classifyNamedJobs(failed, 'browser-matrix'), 'FAIL');
});

test('production readiness state never reports PASS while release blockers remain', () => {
  assert.equal(typeof readiness.deriveProductionReadinessState, 'function');
  assert.equal(readiness.deriveProductionReadinessState({
    stablePromotionStatus: 'PASS', p0Open: true, securityCritical: false, automationReadiness: 'VERIFIED'
  }), 'FAIL');
  assert.equal(readiness.deriveProductionReadinessState({
    stablePromotionStatus: 'PASS', p0Open: false, securityCritical: true, automationReadiness: 'VERIFIED'
  }), 'FAIL');
  assert.equal(readiness.deriveProductionReadinessState({
    stablePromotionStatus: 'PASS', p0Open: false, securityCritical: false, automationReadiness: 'NOT_VERIFIED'
  }), 'NOT_EXECUTED');
  assert.equal(readiness.deriveProductionReadinessState({
    stablePromotionStatus: 'BLOCKED', p0Open: false, securityCritical: false, automationReadiness: 'VERIFIED'
  }), 'BLOCKED');
  assert.equal(readiness.deriveProductionReadinessState({
    stablePromotionStatus: 'PASS', p0Open: false, securityCritical: false, automationReadiness: 'VERIFIED'
  }), 'PASS');
});

test('release report does not substitute PostgreSQL PASS for explicit shadow or race-context evidence', async () => {
  const report = await read('scripts/hipico-release-report-v290.mjs');
  assert.doesNotMatch(report, /HIPICO_GATE_AGENT_SHADOW\s*\|\|\s*gates\.postgres/);
  assert.doesNotMatch(report, /HIPICO_GATE_RACE_CONTEXT\s*\|\|\s*gates\.postgres/);
  assert.match(report, /deriveProductionReadinessState/);
});

test('manual release report waits for browser matrix completion before classifying the run', async () => {
  const workflow = await read('.github/workflows/hipico-production-gates-v290.yml');
  assert.match(workflow, /needs:\s*\[[^\]]*browser-matrix[^\]]*\]/s);
});
