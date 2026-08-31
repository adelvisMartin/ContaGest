import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const handoff=JSON.parse(fs.readFileSync('ops/roadmap/enterprise-final-handoff-v101.json','utf8'));

test('EPIC #101 final handoff never equates implementation with production readiness',()=>{
  assert.equal(handoff.issue,101);
  assert.equal(handoff.implementationHandoffReady,true);
  assert.equal(handoff.epicComplete,false);
  assert.equal(handoff.productionReady,false);
  assert.equal(handoff.closedIssueIsNotRuntimePass,true);
});

test('only current ERP final-gate issues are represented in snapshot',()=>{
  assert.deepEqual(handoff.openChildIssuesAtSnapshot,[29,97,134,155,157]);
  assert.deepEqual(handoff.finalGates.map((gate)=>gate.issue).sort((a,b)=>a-b),[29,97,134,155,157]);
});

test('each final gate points to its dedicated follow-up PR and cannot close from merge alone',()=>{
  const expected=new Map([[29,209],[97,211],[134,210],[155,205],[157,206]]);
  for(const gate of handoff.finalGates){
    assert.equal(gate.pullRequest,expected.get(gate.issue));
    assert.equal(gate.canCloseFromMergeAlone,false);
    assert.ok(Array.isArray(gate.remaining)&&gate.remaining.length>0);
  }
});

test('external blockers stay explicit instead of becoming fake PASS',()=>{
  const byIssue=new Map(handoff.finalGates.map((gate)=>[gate.issue,gate]));
  assert.equal(byIssue.get(134).observedExternalState,'HOSTED_RUNNER_NOT_ASSIGNED');
  assert.equal(byIssue.get(97).observedExternalState,'MAIN_UNPROTECTED');
  assert.equal(byIssue.get(29).observedExternalState,'PROFESSIONAL_REVIEW_AND_PROVIDER_IDENTITY_PENDING');
  assert.match(handoff.closureRule,/remains open/i);
});
