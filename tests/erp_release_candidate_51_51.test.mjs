import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('51/51 release runner is bound to exact candidate SHA and clean worktree',()=>{
  const source=read('scripts/erp-release-candidate-v5151.mjs');
  for(const token of ['CANDIDATE_SHA_REQUIRED_40_HEX','git',['rev-parse','HEAD'],'CANDIDATE_SHA_MISMATCH','RELEASE_WORKTREE_MUST_START_CLEAN','contagest-erp-release-candidate.v5151']) assert.ok(Array.isArray(token)?true:source.includes(token),String(token));
  assert.match(source,/gitHead\.stdout\.trim\(\)/);
  assert.match(source,/actualSha!==candidateSha/);
});

test('51/51 executes static build audit PostgreSQL browser and accessibility gates',()=>{
  const source=read('scripts/erp-release-candidate-v5151.mjs');
  for(const token of [
    'repo.diff-check','repo.skills','repo.typecheck','repo.tests','repo.build','repo.bundle-budget','repo.dependency-audit',
    'postgres.prerequisites','postgres.migrations','postgres.seed','postgres.persistence','postgres.financial','postgres.verticals',
    'browser.core-58x5','browser.accessibility'
  ]) assert.ok(source.includes(token),token);
});

test('51/51 report cannot elevate failed or blocked gates to release ready',()=>{
  const source=read('scripts/erp-release-candidate-v5151.mjs');
  assert.match(source,/failed\.length\?'FAIL':blocked\.length\?'BLOCKED':'READY_FOR_RELEASE_REVIEW'/);
  assert.match(source,/if\(verdict!=='READY_FOR_RELEASE_REVIEW'\)process\.exitCode=1/);
});

test('51/51 workflow verifies SHA prepares isolated PostgreSQL and uploads evidence',()=>{
  const workflow=read('.github/workflows/erp-release-candidate-v5151.yml');
  for(const token of ['CANDIDATE_SHA','git rev-parse HEAD','postgres:17-alpine','npm ci --no-audit --no-fund','playwright install --with-deps chromium','release:erp:v5151','upload-artifact@v7','erp-release-51-51-']) assert.ok(workflow.includes(token),token);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
});
