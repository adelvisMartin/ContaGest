import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/release-governance-auto-finalize-v97.yml', 'utf8');
const script = fs.readFileSync('scripts/github-main-protection-v97.mjs', 'utf8');

test('#97 requires a dedicated administrative token and never embeds one', () => {
  assert.match(workflow, /secrets\.CONTAGEST_GOVERNANCE_TOKEN/);
  assert.match(workflow, /falta el secret CONTAGEST_GOVERNANCE_TOKEN/);
  assert.doesNotMatch(workflow, /gh[pousr]_[A-Za-z0-9_]{20,}/);
});

test('#97 promotes required CI only after #134 is closed', () => {
  assert.match(workflow, /gh issue view 134/);
  assert.match(workflow, /if \[ "\$STATE" = "CLOSED" \]/);
  assert.match(workflow, /apply --full --issue-134-recovered/);
  assert.match(script, /FULL_PROFILE_REQUIRES_--issue-134-recovered/);
});

test('#97 closes only from the full verified branch', () => {
  assert.match(workflow, /verify --full/);
  assert.match(workflow, /if: steps\.apply\.outputs\.profile == 'full'/);
  assert.match(workflow, /gh issue close 97/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('structural protection remains useful while Actions is blocked but cannot close #97', () => {
  assert.match(workflow, /profile=structural/);
  assert.match(workflow, /BLOCKED_FULL_PROFILE/);
  assert.doesNotMatch(workflow, /profile == 'structural'[\s\S]*gh issue close 97/);
});
