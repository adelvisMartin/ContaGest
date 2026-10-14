import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditTestPyramid,discoverTests,inferredTestLevel,inferredTestOwner} from '../scripts/test-pyramid-audit-v655.mjs';

const CORE='qa/tenant-isolation-adversarial-v641.test.ts';
const JOURNEY='qa/erp-system-campaign-v155.spec.mjs';
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cg-pyramid-655-'));
 for(const name of [CORE,JOURNEY,'tests/example_contract.test.mjs','backend/src/modules/auth/boundary.test.ts']){
  const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'// synthetic test fixture\n');
 }
 const manifest={schemaVersion:655,baselineTestFiles:4,scanRoots:['backend/src','qa','tests'],criticalBehaviors:[
  {id:'tenant-isolation',file:CORE,level:'POSTGRES_INTEGRATION',owner:'appsec-iam',environment:'postgresql17-isolated',command:'npm --workspace backend exec -- tsx --test ../'+CORE,evidenceStatus:'NOT_EXECUTED',supersededBy:null},
  {id:'erp-main-journey',file:JOURNEY,level:'BROWSER_E2E',owner:'qa-release',environment:'chromium-postgres-isolated',command:'npx playwright test '+JOURNEY+' --project=chromium',evidenceStatus:'NOT_EXECUTED',supersededBy:null}
 ]};
 try{return run({root,manifest});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('discovery maps each observed test to a provisional owner and level',()=>fixture(({root,manifest})=>{
 const result=auditTestPyramid({root,manifest});
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.count,4);assert.equal(result.explicit,2);assert.equal(result.inferred,2);
 assert.equal(result.tests.find(x=>x.file===CORE).level,'POSTGRES_INTEGRATION');
 assert.equal(result.tests.find(x=>x.file===JOURNEY).level,'BROWSER_E2E');
 assert.equal(result.tests.find(x=>x.file==='tests/example_contract.test.mjs').classification,'INFERRED');
 assert.equal(result.tests.every(x=>x.evidenceStatus==='NOT_EXECUTED'),true);
}));
test('critical PostgreSQL test removed cannot be hidden by a replacement',()=>fixture(({root,manifest})=>{
 fs.rmSync(path.join(root,CORE));
 fs.writeFileSync(path.join(root,'qa/another.test.ts'),'');
 const r=auditTestPyramid({root,manifest});assert.equal(r.count,4);
 assert.match(r.errors.join(' '),/PYRAMID_CRITICAL_BEHAVIOR_ORPHAN/);
}));
test('no test may silently disappear below the recorded baseline',()=>fixture(({root,manifest})=>{
 fs.rmSync(path.join(root,'tests/example_contract.test.mjs'));
 assert.match(auditTestPyramid({root,manifest}).errors.join(' '),/PYRAMID_TEST_COUNT_REGRESSION/);
}));
test('financial, tenant and browser boundaries never downgrade to mocked unit checks',()=>fixture(({root,manifest})=>{
 manifest.criticalBehaviors[0].level='UNIT';
 manifest.criticalBehaviors[1].level='CONTRACT';
 const errors=auditTestPyramid({root,manifest}).errors.join(' ');
 assert.match(errors,/PYRAMID_PROTECTED_DB_DOWNGRADE/);
 assert.match(errors,/PYRAMID_BROWSER_JOURNEY_DOWNGRADE/);
}));
test('source manifest cannot masquerade as an executed PASS',()=>fixture(({root,manifest})=>{
 manifest.criticalBehaviors[0].evidenceStatus='PASS';
 assert.match(auditTestPyramid({root,manifest}).errors.join(' '),/PYRAMID_STATIC_EVIDENCE_CANNOT_CLAIM_PASS/);
}));
test('superseded suite requires consumer proof',()=>fixture(({root,manifest})=>{
 manifest.criticalBehaviors[0].supersededBy='tests/new.test.mjs';
 assert.match(auditTestPyramid({root,manifest}).errors.join(' '),/PYRAMID_SUPERSESSION_PROOF_REQUIRED/);
}));
test('duplicate behavior identifiers and unsafe paths fail closed',()=>fixture(({root,manifest})=>{
 manifest.criticalBehaviors.push({...manifest.criticalBehaviors[0]});
 manifest.scanRoots=['../../'];
 const result=auditTestPyramid({root,manifest});
 assert.equal(result.ok,false);
 assert.match(result.errors.join(' '),/PYRAMID_DISCOVERY_FAILED/);
}));
test('misconfigured command does not silently orphan executable evidence',()=>fixture(({root,manifest})=>{
 manifest.criticalBehaviors[0].command='npm test';
 assert.match(auditTestPyramid({root,manifest}).errors.join(' '),/PYRAMID_COMMAND_NOT_LINKED/);
}));
test('nested tools and backend tests infer owners without claiming runtime verification',()=>{
 assert.equal(inferredTestLevel('qa/erp-ui.spec.mjs'),'BROWSER_E2E');
 assert.equal(inferredTestOwner('tools/hipico-whatsapp-bridge/test/agent.test.mjs'),'hipico-reliability');
 assert.equal(inferredTestOwner('backend/src/modules/accounting/ledger.test.ts'),'backend-api');
});
