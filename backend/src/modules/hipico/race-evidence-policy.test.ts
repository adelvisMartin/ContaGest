import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATOR_EVIDENCE_AUTHORITIES,
  operatorEvidenceAuthorityAllowed
} from './race-evidence-policy.js';

test('operator HTTP evidence cannot self-declare trusted or official authority', () => {
  assert.deepEqual(OPERATOR_EVIDENCE_AUTHORITIES, ['operator', 'group_evidence', 'unknown']);
  assert.equal(operatorEvidenceAuthorityAllowed('operator'), true);
  assert.equal(operatorEvidenceAuthorityAllowed('group_evidence'), true);
  assert.equal(operatorEvidenceAuthorityAllowed('unknown'), true);
  assert.equal(operatorEvidenceAuthorityAllowed('trusted'), false);
  assert.equal(operatorEvidenceAuthorityAllowed('official'), false);
});

test('only canonical internal integrations may supply trusted/official evidence to the lifecycle evaluator', () => {
  for (const authority of ['trusted', 'official', '', 'system', 'provider']) {
    assert.equal(operatorEvidenceAuthorityAllowed(authority), false);
  }
});
