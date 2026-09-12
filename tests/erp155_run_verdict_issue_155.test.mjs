import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWorkflowOutcome } from '../scripts/erp-system-run-verdict-v155.mjs';

const candidateSha = 'a'.repeat(40);

test('#155 classifies a failure before runner/steps as BLOCKED instead of product FAIL', () => {
  const run = { status:'completed', conclusion:'failure', head_sha:candidateSha };
  const jobs = [
    { runner_id:0, steps:null },
    { runner_id:0, steps:[] },
  ];
  assert.equal(classifyWorkflowOutcome(run, jobs, candidateSha), 'BLOCKED');
});

test('#155 keeps an actually executed failing test as FAIL', () => {
  const run = { status:'completed', conclusion:'failure', head_sha:candidateSha };
  const jobs = [{ runner_id:42, steps:[{ name:'Run tests', conclusion:'failure' }] }];
  assert.equal(classifyWorkflowOutcome(run, jobs, candidateSha), 'FAIL');
});

test('#155 only returns PASS for successful completion on the exact candidate SHA', () => {
  const success = { status:'completed', conclusion:'success', head_sha:candidateSha };
  assert.equal(classifyWorkflowOutcome(success, [], candidateSha), 'PASS');
  assert.equal(classifyWorkflowOutcome({ ...success, head_sha:'b'.repeat(40) }, [], candidateSha), 'FAIL');
  assert.equal(classifyWorkflowOutcome({ ...success, status:'in_progress' }, [], candidateSha), 'NOT_EXECUTED');
});
