import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const freeze=JSON.parse(fs.readFileSync('ops/release/deployment-freeze-v97.json','utf8'));

test('#97 deployment freeze disables every automatic Vercel Git deployment',()=>{
  assert.equal(vercel.git?.deploymentEnabled,false);
  assert.equal(vercel.ignoreCommand,'exit 0');
  assert.equal(freeze.state,'FROZEN');
  assert.equal(freeze.gitDeployments,'disabled-all-branches');
});

test('#97 freeze cannot be lifted implicitly by a normal feature PR',()=>{
  assert.equal(freeze.productionDeploy,'manual-release-only-after-freeze-lift');
  assert.match(freeze.releaseCandidatePattern,/release\/candidate-/);
  assert.ok(Array.isArray(freeze.liftRequirements)&&freeze.liftRequirements.length>=7);
  assert.match(freeze.unfreezeRule,/dedicated reviewed PR/i);
  assert.ok(freeze.liftRequirements.some((item)=>item.includes('#154')&&item.includes('NO_GO')));
});
