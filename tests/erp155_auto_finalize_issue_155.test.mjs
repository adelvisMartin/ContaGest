import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/erp-system-auto-finalize-v155.yml', 'utf8');
const script = fs.readFileSync('scripts/erp-system-auto-finalize-v155.mjs', 'utf8');
const campaign = fs.readFileSync('.github/workflows/erp-system-qa-campaign-v155.yml', 'utf8');

test('#155 auto-finalizer waits for Actions recovery or explicit/periodic execution', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Actions Recovery #134/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
});

test('#155 dispatches the canonical exhaustive campaign instead of replacing it with a smoke test', () => {
  assert.match(script, /erp-system-qa-campaign-v155\.yml/);
  assert.match(script, /workflow', 'run'/);
  assert.match(campaign, /role: \[admin, operator, read-only\]/);
  assert.match(campaign, /phone-360/);
  assert.match(campaign, /desktop-1920/);
  assert.match(campaign, /Aggregate evidence and fail closed/);
});

test('#155 closes only when the dispatched campaign completed successfully on the same main SHA', () => {
  assert.match(script, /completed\.conclusion === 'success'/);
  assert.match(script, /completed\.head_sha === candidateSha/);
  assert.match(script, /if \(report\.verdict === 'PASS' && closeIssue\)/);
  assert.match(script, /issue', 'close'/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
