import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/runner-pool-probe-v134.yml','utf8');

test('#134 pool probe is manual, multi-runner and diagnostic-only',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/ubuntu-22\.04/);
  assert.match(workflow,/ubuntu-24\.04/);
  assert.match(workflow,/windows-2022/);
  assert.match(workflow,/RUNNER_POOL_PROBE_EXECUTED=true/);
  assert.doesNotMatch(workflow,/schedule:/);
  assert.doesNotMatch(workflow,/push:/);
  assert.doesNotMatch(workflow,/pull_request:/);
});

test('#134 pool probe cannot close issue or fake a pass',()=>{
  assert.doesNotMatch(workflow,/gh issue close/);
  assert.doesNotMatch(workflow,/issues:\s*write/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
  assert.doesNotMatch(workflow,/\|\|\s*true/);
  assert.match(workflow,/BLOCKED_INFRA/);
});
