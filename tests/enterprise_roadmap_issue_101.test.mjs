import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roadmap = JSON.parse(readFileSync(new URL('../ops/roadmap/enterprise-hardening-v101.json', import.meta.url), 'utf8'));
const docs = readFileSync(new URL('../docs/roadmap/ENTERPRISE_HARDENING_STATUS_V101.md', import.meta.url), 'utf8');

const allowed = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED', 'SOURCE_REVIEW']);

test('issue #101 snapshot is bound to a concrete main SHA and is not production-ready', () => {
  assert.match(roadmap.snapshot.mainSha, /^[0-9a-f]{40}$/);
  assert.equal(roadmap.snapshot.mainSha, 'a24bec379f9cf9121dcd8164d04f63dc332a608e');
  assert.equal(roadmap.snapshot.evidenceState, 'SOURCE_REVIEW');
  assert.equal(roadmap.snapshot.productionReady, false);
  assert.equal(roadmap.snapshot.epicComplete, false);
});

test('issue #101 keeps exact evidence states and never promotes unexecuted work', () => {
  assert.deepEqual(new Set(roadmap.deliveryContract.allowedEvidenceStates), allowed);
  assert.equal(roadmap.deliveryContract.notExecutedIsNeverPass, true);
  assert.equal(roadmap.deliveryContract.closedIssueIsNotRuntimePass, true);
  for (const gate of roadmap.verifiedCurrentGates) assert.ok(allowed.has(gate.status), `${gate.area} has unsupported status ${gate.status}`);
});

test('issue #101 closed child lifecycle does not become runtime PASS', () => {
  for (const issue of [98, 99]) {
    const gate = roadmap.verifiedCurrentGates.find((entry) => entry.issue === issue);
    assert.equal(gate?.lifecycleState, 'closed-completed');
    assert.equal(gate?.status, 'SOURCE_REVIEW');
    assert.equal(gate?.runtimeEvidence, 'NOT_EXECUTED');
  }
  assert.match(docs, /lifecycle state is not candidate-SHA browser evidence|Issue lifecycle is useful roadmap metadata/);
});

test('issue #101 records live governance and legal blockers explicitly', () => {
  const governance = roadmap.verifiedCurrentGates.find((gate) => gate.issue === 97);
  const legal = roadmap.verifiedCurrentGates.find((gate) => gate.issue === 29);
  const ci = roadmap.verifiedCurrentGates.find((gate) => gate.issue === 134);
  assert.equal(governance?.status, 'BLOCKED');
  assert.match(governance?.evidence || '', /protected=false/);
  assert.equal(legal?.status, 'BLOCKED');
  assert.match(legal?.evidence || '', /professional Venezuelan review/);
  assert.equal(ci?.status, 'BLOCKED');
});

test('issue #101 preserves Control Hipico as a separate product roadmap', () => {
  assert.equal(roadmap.productBoundary.hipicoAuthority, false);
  assert.equal(roadmap.productBoundary.controlHipicoEpic, 102);
  assert.match(docs, /outside the architectural authority of Epic #101/);
  assert.doesNotMatch(JSON.stringify(roadmap.wave2Verification), /103|hipico-control|whatsapp/i);
});

test('issue #101 cannot be closed by merging the snapshot or child issues alone', () => {
  assert.ok(roadmap.epicExitCriteria.length >= 10);
  assert.match(roadmap.closureRule, /remains open until every exit criterion is evidenced/);
  assert.match(docs, /never converted into a generic “100% ready” statement/);
  assert.doesNotMatch(roadmap.closureRule, /close.*when.*child issues.*closed/i);
});
