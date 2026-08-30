import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script=fs.readFileSync('scripts/github-main-protection-v97.mjs','utf8');
const structural=JSON.parse(fs.readFileSync('ops/github/main-branch-protection-v97.json','utf8'));
const governance=JSON.parse(fs.readFileSync('ops/github/main-release-governance-v97.json','utf8'));

test('canonical structural policy requires PR and blocks destructive branch operations',()=>{
  assert.ok(structural.required_pull_request_reviews);
  assert.equal(structural.enforce_admins,true);
  assert.equal(structural.required_conversation_resolution,true);
  assert.equal(structural.allow_force_pushes,false);
  assert.equal(structural.allow_deletions,false);
});

test('apply helper consumes canonical ops policy instead of duplicating configuration',()=>{
  assert.match(script,/ops\/github\/main-branch-protection-v97\.json/);
  assert.match(script,/ops\/github\/main-release-governance-v97\.json/);
  assert.doesNotMatch(script,/GITHUB_TOKEN\s*=/);
});

test('full profile cannot activate required CI check while #134 is unresolved',()=>{
  assert.match(script,/FULL_PROFILE_REQUIRES_--issue-134-recovered/);
  assert.match(script,/ContaGest CI \/ validate/);
  assert.equal(governance.requiredChecks.active.length,0);
});

test('verification checks PR, admins, force push, deletion and conversations',()=>{
  for(const marker of ['PR_NOT_REQUIRED','FORCE_PUSH_NOT_BLOCKED','DELETE_NOT_BLOCKED','ADMINS_NOT_ENFORCED','CONVERSATION_RESOLUTION_NOT_REQUIRED'])assert.match(script,new RegExp(marker));
});
