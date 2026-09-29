import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = fs.readFileSync('.github/workflows/release-governance-auto-finalize-v97.yml', 'utf8');
const script = fs.readFileSync('scripts/github-main-protection-v97.mjs', 'utf8');
const applyHelper = fs.readFileSync('scripts/apply-main-protection-v97.ps1', 'utf8');
const governance = JSON.parse(fs.readFileSync('ops/github/main-release-governance-v97.json', 'utf8'));

test('#97 requires a dedicated administrative token and never embeds one', () => {
  assert.match(workflow, /secrets\.CONTAGEST_GOVERNANCE_TOKEN/);
  assert.match(workflow, /falta el secret CONTAGEST_GOVERNANCE_TOKEN/);
  assert.doesNotMatch(workflow, /gh[pousr]_[A-Za-z0-9_]{20,}/);
});

test('#97 auto-apply is structural only and cannot promote checks from issue state', () => {
  assert.match(workflow, /github-main-protection-v97\.mjs plan/);
  assert.match(workflow, /github-main-protection-v97\.mjs apply/);
  assert.match(workflow, /github-main-protection-v97\.mjs verify/);
  assert.doesNotMatch(workflow, /gh issue view 134/);
  assert.doesNotMatch(workflow, /--full/);
  assert.doesNotMatch(workflow, /gh issue close 97/);
  assert.doesNotMatch(workflow, /issues:\s*write/);
});

test('#97 Phase B remains disabled until a required check is versioned as active', () => {
  assert.deepEqual(governance.requiredChecks.active, []);
  assert.match(script, /governance\.requiredChecks\?\.active/);
  assert.match(script, /FULL_PROFILE_REQUIRES_VERSIONED_ACTIVE_CHECK/);
  assert.doesNotMatch(script, /issue-134-recovered/);
  assert.doesNotMatch(applyHelper, /Issue134Recovered|issue-134-recovered/);
  assert.match(applyHelper, /\$argsCommon \+= '--full'/);

  const result = spawnSync(process.execPath, ['scripts/github-main-protection-v97.mjs', 'plan', '--full'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /FULL_PROFILE_REQUIRES_VERSIONED_ACTIVE_CHECK/);
});

test('#97 structural automation preserves honest evidence without auto-closing the ticket', () => {
  assert.match(workflow, /"profile":"structural"/);
  assert.match(workflow, /"remoteCi":"NOT_EXECUTED"/);
  assert.match(workflow, /"remoteDeploy":"NOT_EXECUTED"/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
