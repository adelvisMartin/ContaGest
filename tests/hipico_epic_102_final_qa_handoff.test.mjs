import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const handoff=JSON.parse(fs.readFileSync('ops/roadmap/hipico-final-qa-handoff-v102.json','utf8'));
const compliance=JSON.parse(fs.readFileSync('products/hipico-control/whatsapp-production-evidence.json','utf8'));

test('EPIC #102 implementation handoff never implies release readiness',()=>{
  assert.equal(handoff.issue,102);
  assert.equal(handoff.implementationHandoffReady,true);
  assert.equal(handoff.epicComplete,false);
  assert.equal(handoff.releaseReady,false);
  assert.equal(handoff.productionWriteAllowed,false);
  assert.equal(handoff.sourceMode,'READ_ONLY');
});

test('only Physical QA and soak remain open child execution gates in snapshot',()=>{
  assert.deepEqual(handoff.openChildIssuesAtSnapshot,[119,120]);
  assert.deepEqual(handoff.finalExecutionGates.map((gate)=>gate.issue),[119,120]);
  const expected=new Map([[119,207],[120,208]]);
  for(const gate of handoff.finalExecutionGates){
    assert.equal(gate.pullRequest,expected.get(gate.issue));
    assert.equal(gate.canCloseFromMergeAlone,false);
    assert.ok(gate.remaining.length>0);
  }
});

test('current production compliance NO_GO remains an independent hard gate',()=>{
  assert.equal(compliance.decision,'NO_GO');
  assert.equal(handoff.productionComplianceGate.decision,compliance.decision);
  assert.equal(handoff.productionComplianceGate.reviewedAt,compliance.reviewedAt);
  assert.equal(handoff.productionComplianceGate.nextMandatoryPolicyReview,compliance.nextMandatoryPolicyReview);
  assert.match(handoff.productionComplianceGate.effect,/remains disabled/i);
});

test('closing rule requires real candidate evidence and no unresolved P0/P1',()=>{
  assert.match(handoff.closureRule,/real evidence/i);
  assert.match(handoff.closureRule,/P0\/P1/i);
  assert.match(handoff.closureRule,/NO_GO/i);
});
