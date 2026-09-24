import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const runner=fs.readFileSync('scripts/run-authoritative-contracts.mjs','utf8');
const manifest=JSON.parse(fs.readFileSync('config/implementation-roadmap-1-58.json','utf8'));

test('59/75 root tests execute the authoritative implementation matrix instead of a legacy glob',()=>{
  assert.equal(pkg.scripts['test:contracts:current'],'node scripts/run-authoritative-contracts.mjs');
  assert.match(pkg.scripts.test,/test:contracts:current/);
  assert.doesNotMatch(pkg.scripts.test,/tests\/\*\.test\.mjs/);
  assert.doesNotMatch(pkg.scripts.lint,/tests\/\*\.test\.mjs/);
});

test('59/75 authoritative runner derives regressions from all 58 implementations',()=>{
  assert.equal(manifest.implementations.length,58);
  assert.match(runner,/flatMap\(\(row\)=>row\.regressionPaths/);
  assert.match(runner,/implementations\.length!==58/);
  assert.match(runner,/SUPERSEDED_VERSION_TEST_IN_AUTHORITY/);
  for(const row of manifest.implementations){
    for(const file of row.regressionPaths) assert.ok(fs.existsSync(file),file);
  }
});

test('59/75 keeps recovery contracts in the authoritative suite',()=>{
  for(const file of [
    'tests/vercel_build_recovery_59_75.test.mjs',
    'tests/exact_sha_workflow_recovery_59_75.test.mjs',
    'tests/prisma_ephemeral_baseline_contract.test.mjs',
    'tests/security_audit_surface_boundary.test.mjs'
  ]) assert.ok(runner.includes(file),file);
});
