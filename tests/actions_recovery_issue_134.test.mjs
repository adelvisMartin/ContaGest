import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/actions-recovery-v134.yml', 'utf8');
const script = fs.readFileSync('scripts/actions-recovery-orchestrator-v134.mjs', 'utf8');

test('recovery #134 is periodic, manual and requires real hosted-runner execution', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /test -n "\$\{RUNNER_NAME:-\}"/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('recovery #134 dispatches the canonical CI and real PostgreSQL workflows', () => {
  assert.match(script, /ci\.yml/);
  assert.match(script, /postgres-tenant-rules-v28\.yml/);
  assert.match(script, /workflow', 'run'/);
  assert.match(script, /headSha === candidateSha/);
});

test('issue #134 is closed only after both dispatched workflows complete successfully', () => {
  assert.match(script, /report\.workflows\.length === workflows\.length/);
  assert.match(script, /entry\.conclusion === 'success'/);
  assert.match(script, /if \(allPass && closeIssue\)/);
  assert.match(script, /issue', 'close'/);
  assert.doesNotMatch(script, /conclusion.*failure.*issue', 'close'/s);
});

test('workflow has only the permissions needed to dispatch workflows and close the issue', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(workflow, /contents: write/);
});
