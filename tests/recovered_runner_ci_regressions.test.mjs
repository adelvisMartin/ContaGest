import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('51/51 checks out the exact PR head SHA in all automated release jobs',()=>{
  const workflow=read('.github/workflows/release-candidate-v5151.yml');
  const checkouts=(workflow.match(/actions\/checkout@v7/g)||[]).length;
  const exactRefs=(workflow.match(/ref:\s*\$\{\{ env\.CANDIDATE_SHA \}\}/g)||[]).length;
  assert.equal(checkouts,5);
  assert.equal(exactRefs,checkouts);
});

test('48/51 PostgreSQL E2E checks out the exact candidate before comparing SHA',()=>{
  const workflow=read('.github/workflows/erp-verticals-real-e2e-v4851.yml');
  assert.match(workflow,/uses: actions\/checkout@v7\n\s+with:\n\s+ref:\s*\$\{\{ env\.CANDIDATE_SHA \}\}\n\s+fetch-depth:\s*0/);
  assert.match(workflow,/test "\$ACTUAL_SHA" = "\$CANDIDATE_SHA"/);
});

test('Hípico Android gate does not enable Gradle cache before generated wrapper files exist',()=>{
  const workflow=read('.github/workflows/hipico-production-gates-v290.yml');
  const android=workflow.slice(workflow.indexOf('android-debug:'),workflow.indexOf('browser-matrix:'));
  assert.match(android,/actions\/setup-java@v6/);
  assert.doesNotMatch(android,/cache:\s*gradle/);
  assert.match(android,/npm run sync:web/);
  assert.match(android,/npm run android:qa/);
});

test('physical QA remains SHA-bound evidence rather than a workflow_dispatch boolean',()=>{
  const workflow=read('.github/workflows/hipico-production-gates-v290.yml');
  const verifier=read('scripts/hipico-verify-evidence-v290.mjs');
  assert.doesNotMatch(workflow,/physical_qa_status:/);
  assert.match(verifier,/physical-qa-evidence\.json/);
  assert.match(verifier,/releasePhysicalGate === 'PASS'/);
});
