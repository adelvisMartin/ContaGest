import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATOR_DOCUMENT_AUTHORITIES,
  documentStatusApprovable,
  operatorDocumentAuthorityAllowed
} from './document-policy.js';

test('operator upload API cannot self-declare trusted or official document authority', () => {
  assert.deepEqual(OPERATOR_DOCUMENT_AUTHORITIES, ['operator', 'group_evidence', 'unknown']);
  assert.equal(operatorDocumentAuthorityAllowed('operator'), true);
  assert.equal(operatorDocumentAuthorityAllowed('group_evidence'), true);
  assert.equal(operatorDocumentAuthorityAllowed('unknown'), true);
  assert.equal(operatorDocumentAuthorityAllowed('trusted'), false);
  assert.equal(operatorDocumentAuthorityAllowed('official'), false);
});

test('only successfully extracted or review-required documents are approvable', () => {
  assert.equal(documentStatusApprovable('extracted'), true);
  assert.equal(documentStatusApprovable('review'), true);
  for (const status of ['uploaded', 'failed', 'processing', 'approved', '', 'unknown']) {
    assert.equal(documentStatusApprovable(status), false, `${status} must not be approvable`);
  }
});
