import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/actions-recovery-v134.yml', 'utf8');
const probe = fs.readFileSync('.github/workflows/runner-probe-v134.yml', 'utf8');
const script = fs.readFileSync('scripts/actions-recovery-orchestrator-v134.mjs', 'utf8');

test('recovery #134 is periodic, manual and requires real hosted-runner execution', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /test -n "\$\{RUNNER_NAME:-\}"/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('recovery #134 dispatches canonical CI and real PostgreSQL on current main SHA', () => {
  assert.match(script, /ci\.yml/);
  assert.match(script, /postgres-tenant-rules-v28\.yml/);
  assert.match(script, /workflow', 'run'/);
  assert.match(script, /commits\/main/);
  assert.match(script, /head_sha === candidateSha/);
});

test('#134 hardening requires job-level runner steps and logs before workflow evidence is valid', () => {
  for (const token of [
    'collectJobEvidence',
    'runnerAssigned',
    'completedStepCount',
    'logsAvailable',
    'hasRealExecutionEvidence',
    'verifiedExecution',
    '/actions/jobs/${job.id}/logs',
  ]) assert.ok(script.includes(token), token);
  assert.match(script, /job\.runnerAssigned\s*&&\s*job\.completedStepCount > 0\s*&&\s*job\.logsAvailable/);
  assert.match(script, /report\.workflows\.every\(\(entry\) => entry\.verifiedExecution\)/);
});

test('issue #134 closes only after both workflows have exact-SHA success plus real execution evidence', () => {
  assert.match(script, /report\.workflows\.length === workflows\.length/);
  assert.match(script, /completed\.conclusion === 'success'/);
  assert.match(script, /completed\.head_sha === candidateSha/);
  assert.match(script, /if \(allPass && closeIssue\)/);
  assert.match(script, /issue', 'close'/);
  assert.doesNotMatch(script, /continue-on-error/);
});

test('#134 hardening runner probe is exact PR-SHA observable for recovery changes', () => {
  for (const path of [
    'scripts/actions-recovery-orchestrator-v134.mjs',
    'tests/actions_recovery_issue_134.test.mjs',
    'docs/qa/GITHUB-ACTIONS-RECOVERY-134-HARDENING.md',
  ]) assert.ok(probe.includes(path), path);
  assert.match(probe, /actions\/checkout@v7/);
  assert.match(probe, /RUNNER_PROBE_EXECUTED=true/);
});

test('workflow has only the permissions needed to dispatch workflows and close the issue', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(workflow, /contents: write/);
});
