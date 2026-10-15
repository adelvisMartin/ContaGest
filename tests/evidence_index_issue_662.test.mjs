import test from 'node:test';
import assert from 'node:assert/strict';
import {generateIndex,validateIndex,digest,toRelease647,DIMENSIONS} from '../scripts/evidence-index-v662.mjs';
const a='a'.repeat(40), b='b'.repeat(40);
const input={schemaVersion:662,rootIssue:624,observedBaselineSha:b,observedAt:'2026-10-14T15:33:44Z',
  sourceUrl:'https://github.com/adelvisMartin/ContaGest/issues',
  issueIds:[624,662,667],openIssueIds:[624,662],unresolvedParentReferences:[619]};
const copy=(v)=>structuredClone(v);
const reseal=(v)=>{v.manifestSha256=digest(v);return v;};

test('#662 defaults to NOT_EXECUTED and keeps old closed children unverified',()=>{
  const i=generateIndex(input,a), result=validateIndex(i,{sha:a,inventory:input});
  assert.deepEqual(i.expectedIssueIds,[624,662,667]);
  assert.ok(i.entries.every(e=>e.status==='NOT_EXECUTED'&&!e.evidence.length));
  assert.equal(i.entries.find(e=>e.issue===667).issueState,'UNKNOWN');
  assert.equal(result.validation,'PASS');
  assert.equal(result.releaseCoverage,'NO_GO');
  assert.deepEqual(result.counts,{PASS:0,FAIL:0,BLOCKED:0,NOT_EXECUTED:3,NOT_APPLICABLE:0});
});
test('#662 exact SHA, source coverage and integrity are fail-closed',()=>{
  const i=generateIndex(input,a);
  assert.ok(validateIndex(i,{sha:b}).errors.includes('EVIDENCE_SHA_MISMATCH'));
  const missing=copy(i);missing.entries.pop();reseal(missing);
  assert.ok(validateIndex(missing).errors.some(s=>s.startsWith('INDEX_MISSING_ENTRY')));
  const stale=copy(i);stale.entries[0].reason='Changed without digest';
  assert.ok(validateIndex(stale).errors.includes('INDEX_HASH_INVALID'));
  const drift={...input,issueIds:[624,662]};
  assert.ok(validateIndex(i,{inventory:drift}).errors.includes('INDEX_INVENTORY_DRIFT'));
});
test('#662 completion needs accepted merge and exact-SHA executable evidence',()=>{
  const i=generateIndex(input,a),e=i.entries[2];
  e.status='PASS';e.reason='';
  assert.ok(validateIndex(reseal(i)).errors.includes('INDEX_CLOSE_NO_EVIDENCE:667'));
  e.issueState='CLOSED';e.acceptanceComplete=true;e.pr=123;e.mergeSha=b;
  e.evidence=[{dimension:'LOCAL_UNIT',status:'PASS',sha:a,command:'node --test tests/x.test.mjs',
    environment:'Node 22 Linux',artifacts:['artifacts/qa/x.json']}];
  assert.equal(validateIndex(reseal(i)).errors.length,0);
  e.evidence[0].sha=b;
  assert.ok(validateIndex(reseal(i)).errors.some(s=>s.startsWith('EVIDENCE_SHA_MISMATCH')));
  e.evidence[0].sha=a;e.evidence[0].artifacts=['../secrets.env'];
  assert.ok(validateIndex(reseal(i)).errors.includes('INDEX_PASS_NO_PROOF:667'));
});
test('#662 provider BLOCKED remains separate from PASS and requires cause',()=>{
  const i=generateIndex(input,a),e=i.entries[1];
  e.status='BLOCKED';e.reason='Runner quota prevents GitHub Actions execution';
  e.evidence=[{dimension:'REMOTE_CI',status:'BLOCKED',sha:a,blockerKind:'EXTERNAL_PROVIDER',reason:'quota exhausted'}];
  assert.equal(validateIndex(reseal(i)).validation,'PASS');
  assert.equal(validateIndex(i).releaseCoverage,'NO_GO');
  delete e.evidence[0].reason;
  assert.ok(validateIndex(reseal(i)).errors.includes('INDEX_BLOCKER_CAUSE_MISSING:662'));
});
test('#662 conflicting or duplicated gate evidence cannot certify PASS',()=>{
  const i=generateIndex(input,a),e=i.entries[2];
  e.status='PASS';e.reason='';e.issueState='CLOSED';e.acceptanceComplete=true;e.pr=123;e.mergeSha=b;
  const proof={dimension:'LOCAL_UNIT',status:'PASS',sha:a,command:'node --test tests/x.test.mjs',
    environment:'Node 22',artifacts:['artifacts/test-report.json']};
  e.evidence=[proof,{...proof}];
  assert.ok(validateIndex(reseal(i)).errors.some(s=>s.startsWith('INDEX_DUPLICATE_DIMENSION')));
  e.evidence=[proof,{dimension:'REMOTE_CI',status:'BLOCKED',sha:a,reason:'Runner quota',blockerKind:'EXTERNAL_PROVIDER'}];
  assert.ok(validateIndex(reseal(i)).errors.includes('INDEX_PASS_WITH_UNRESOLVED_GATE:667'));
});
test('#662 canonical dimensions, strict issue states and unique IDs',()=>{
  assert.equal(DIMENSIONS.length,10);
  assert.throws(()=>generateIndex({...input,issueIds:[624,624]},a),/INDEX_DUPLICATE_IDS/);
  assert.throws(()=>generateIndex({...input,openIssueIds:[999]},a),/INDEX_OPEN_NOT_TRACKED/);
  const i=generateIndex(input,a);i.entries[0].issueState='ASSUMED_DONE';
  assert.ok(validateIndex(reseal(i)).errors.includes('INDEX_BAD_ISSUE_STATE:624'));
});
test('#662 digest is time-independent, but SHA and status sensitive',()=>{
  const i=generateIndex(input,a),next=copy(i);
  next.generatedAt='2050-01-01';assert.equal(digest(next),digest(i));
  next.candidateSha=b;assert.notEqual(digest(next),digest(i));
});
test('#662 #647 directly consumes evidence but never self-certifies production',()=>{
  const i=generateIndex(input,a),r=toRelease647(i,{sha:a,inventory:input});
  assert.equal(r.schemaVersion,647);assert.equal(r.decision,'NO_GO');
  assert.ok(r.blockers.some(v=>v.startsWith('ISSUE_MISSING:')));
  assert.ok(r.blockers.some(v=>v.startsWith('PARENT_REF_UNREVIEWED:')));
});
