import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {auditRetiredAdapter} from '../scripts/deprecation-consumer-proof-v657.mjs';
const retired='frontend/src/components/enterprise.js';
const owner='frontend/src/components/ui/kit.js';
const policy=()=>({firstRefactorBatch:{
  candidate:retired,requiredConsumerCount:0,status:'RETIRED',
  canonicalOwners:[owner],retirementOwnerIssue:622,
  retirementEvidence:['tests/clean_code_refactor_authority_issue_622.test.mjs']
}});
function fixture(fn){
  const root=mkdtempSync(join(tmpdir(),'contagest657-'));
  const put=(name,content='export default 1;')=>{
    mkdirSync(dirname(join(root,name)),{recursive:true});
    writeFileSync(join(root,name),content);
  };
  try {
    put(owner);put('tests/clean_code_refactor_authority_issue_622.test.mjs');
    return fn({root,put});
  }finally{rmSync(root,{recursive:true,force:true});}
}
test('retired adapter absent: static PASS does not authorize deletion',()=>fixture(({root})=>{
  const r=auditRetiredAdapter(root,policy());
  assert.equal(r.sourceStatus,'PASS');assert.equal(r.automaticallyDeletable,false);
  assert.equal(r.releaseVerified,false);
}));
test('retired adapter reappearance is blocked',()=>fixture(({root,put})=>{
  put(retired);assert.ok(auditRetiredAdapter(root,policy()).errors.includes('RETIRED_ADAPTER_REAPPEARED'));
}));
test('a static consumer of the retired adapter blocks the gate',()=>fixture(({root,put})=>{
  put('frontend/src/pages/SalesPage.jsx',"import a from '../components/enterprise.js';");
  const r=auditRetiredAdapter(root,policy());
  assert.deepEqual(r.references,['frontend/src/pages/SalesPage.jsx']);
  assert.ok(r.errors.includes('RETIRED_ADAPTER_HAS_CONSUMERS'));
}));
test('computed dynamic imports require review, no fabricated runtime PASS',()=>fixture(({root,put})=>{
  put('frontend/src/pages/SalesPage.jsx',"const p=import('./'+name);");
  const r=auditRetiredAdapter(root,policy());
  assert.ok(r.computedImportsToReview.includes('frontend/src/pages/SalesPage.jsx'));
  assert.equal(r.sourceStatus,'REVIEW_REQUIRED');
  assert.equal(r.releaseVerified,false);
}));
test('missing owners and regression evidence fail closed',()=>fixture(({root})=>{
  const p=policy();
  p.firstRefactorBatch.canonicalOwners.push('frontend/src/components/ui/missing.js');
  p.firstRefactorBatch.retirementEvidence=['tests/missing.test.mjs'];
  const r=auditRetiredAdapter(root,p);
  assert.ok(r.errors.includes('CANONICAL_OWNER_MISSING'));
  assert.ok(r.errors.includes('RETIREMENT_EVIDENCE_MISSING'));
}));
test('invalid candidate traversal and missing owner issue reject policy',()=>fixture(({root})=>{
  const p=policy();p.firstRefactorBatch.candidate='../outside';
  assert.throws(()=>auditRetiredAdapter(root,p),/DEPRECATION_POLICY_INVALID/);
  p.firstRefactorBatch.candidate=retired;
  delete p.firstRefactorBatch.retirementOwnerIssue;
  assert.throws(()=>auditRetiredAdapter(root,p),/DEPRECATION_EVIDENCE_INVALID/);
}));
test('an active candidate with zero imports still needs manual review',()=>fixture(({root,put})=>{
  const p=policy();p.firstRefactorBatch.status='ACTIVE';
  put(retired);
  const r=auditRetiredAdapter(root,p);
  assert.equal(r.sourceStatus,'REVIEW_REQUIRED');
  assert.equal(r.automaticallyDeletable,false);
}));

test('#657 scans public HTML/CSS before declaring zero consumers',()=>fixture(({root,put})=>{
  put('frontend/public/entry.html','<script src="/src/components/enterprise.js"></script>');
  put('frontend/public/site.css','@import url("/src/components/enterprise.js");');
  const r=auditRetiredAdapter(root,policy());
  assert.deepEqual(r.references,['frontend/public/entry.html','frontend/public/site.css']);
  assert.ok(r.errors.includes('RETIRED_ADAPTER_HAS_CONSUMERS'));
}));
test('#657 recognizes extensionless import and require.resolve consumers',()=>fixture(({root,put})=>{
  put('frontend/src/pages/HelpPage.jsx',"import deprecated from '../components/enterprise';");
  put('frontend/src/components/caller.js',"require.resolve('./enterprise')");
  const r=auditRetiredAdapter(root,policy());
  assert.deepEqual(r.references,['frontend/src/components/caller.js','frontend/src/pages/HelpPage.jsx']);
}));
test('#657 computed template import is unresolved, not zero-consumer proof',()=>fixture(({root,put})=>{
  const tick=String.fromCharCode(96);
  put('frontend/src/data/pageRegistry.js','const loader = import('+tick+'../components/'+ '$' + '{name}.js'+tick+');');
  const r=auditRetiredAdapter(root,policy());
  assert.deepEqual(r.computedImportsToReview,['frontend/src/data/pageRegistry.js']);
  assert.equal(r.sourceStatus,'REVIEW_REQUIRED');
}));
test('#657 reference-only test fixture is not a shipped runtime consumer',()=>fixture(({root,put})=>{
  put('tests/reference-only.test.mjs','const removed = "/enterprise.js";');
  assert.equal(auditRetiredAdapter(root,policy()).sourceStatus,'PASS');
}));
