import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../../../../.github/workflows/hipico-provider-live-probe.yml', import.meta.url),
  'utf8'
);

test('provider live probe is scheduled/manual and never part of pull-request CI', () => {
  assert.match(workflow, /schedule\s*:/);
  assert.match(workflow, /cron\s*:/);
  assert.match(workflow, /workflow_dispatch\s*:/);
  assert.doesNotMatch(workflow, /pull_request\s*:/);
});

test('provider live probe fails closed and never masks or echoes provider secrets', () => {
  assert.match(workflow, /HIPICO_SPORTRADAR_UOF_TOKEN/);
  assert.match(workflow, /HIPICO_LIVE_PROBE_STAGE_ID/);
  assert.match(workflow, /probe:hipico:provider/);
  assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/i);
  assert.doesNotMatch(workflow, /\|\|\s*true/);
  assert.doesNotMatch(workflow, /echo\s+.*HIPICO_SPORTRADAR_UOF_TOKEN/i);
});
