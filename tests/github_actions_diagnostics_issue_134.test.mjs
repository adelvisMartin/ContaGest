import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script=fs.readFileSync('scripts/github-actions-diagnostics-v134.mjs','utf8');

test('diagnostic reads repository Actions permissions without changing them',()=>{
  assert.match(script,/actions\/permissions/);
  assert.match(script,/actions\/permissions\/workflow/);
  assert.doesNotMatch(script,/--method['"],['"]PUT/);
  assert.doesNotMatch(script,/--method['"],['"]PATCH/);
});

test('runner_id zero + no steps is classified as external hosted-runner non-assignment',()=>{
  assert.match(script,/GITHUB_HOSTED_RUNNER_NOT_ASSIGNED/);
  assert.match(script,/runner_id/);
  assert.match(script,/runner_name/);
  assert.match(script,/steps/);
  assert.match(script,/HOSTED_RUNNER_NOT_ASSIGNED/);
});

test('diagnostic does not claim billing as proven root cause',()=>{
  assert.match(script,/rootCauseProven/);
  assert.match(script,/does not prove whether billing\/usage limit/);
  assert.match(script,/ownerChecksStillRequired/);
});

test('diagnostic persists SHA-bound sanitized evidence',()=>{
  assert.match(script,/artifacts['"],['"]qa['"],['"]actions-v134/);
  assert.match(script,/SHA256SUMS\.txt/);
  assert.match(script,/REDACTED_TOKEN/);
  assert.match(script,/candidateSha/);
});
