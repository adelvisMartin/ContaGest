import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rootVercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const frontendVercel=JSON.parse(fs.readFileSync('frontend/vercel.json','utf8'));
const freeze=JSON.parse(fs.readFileSync('ops/release/deployment-freeze-v97.json','utf8'));

test('#97 deployment freeze disables every automatic Vercel Git deployment in both repo and configured rootDirectory',()=>{
  for (const [name,config] of [['repo',rootVercel],['frontend',frontendVercel]]) {
    assert.equal(config.git?.deploymentEnabled,false,`${name} vercel.json must disable Git deployments`);
    assert.equal(config.ignoreCommand,'exit 0',`${name} vercel.json must ignore builds while frozen`);
  }
  assert.equal(freeze.state,'FROZEN');
  assert.equal(freeze.gitDeployments,'disabled-all-branches');
});

test('#97 freeze cannot be lifted implicitly or while required evidence is blocked/not executed',()=>{
  assert.equal(freeze.productionDeploy,'manual-release-only-after-freeze-lift');
  assert.match(freeze.releaseCandidatePattern,/release\/candidate-/);
  assert.ok(Array.isArray(freeze.liftRequirements)&&freeze.liftRequirements.length>=10);
  assert.match(freeze.unfreezeRule,/dedicated reviewed PR/i);
  assert.match(freeze.unfreezeRule,/every applicable lift requirement has verifiable evidence/i);
  const requirements=freeze.liftRequirements.join('\n');
  for(const marker of ['#134','Checkout executes','BLOCKED/SKIPPED/NOT_EXECUTED','#221','#155','#157','#97','#29','#119','#120','#154','NO_GO']){
    assert.ok(requirements.includes(marker),`missing strict freeze requirement: ${marker}`);
  }
  assert.doesNotMatch(requirements,/or explicitly BLOCKED|exception documented/i);
});
