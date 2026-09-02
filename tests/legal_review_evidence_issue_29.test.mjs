import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../scripts/legal-review-evidence-v29.mjs', import.meta.url), 'utf8');
const attestation = JSON.parse(readFileSync(new URL('../backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json', import.meta.url), 'utf8'));
const gate = readFileSync(new URL('../scripts/legal-production-gate.mjs', import.meta.url), 'utf8');
const requiredApprovals = [
  'professionalReview','providerIdentity','terms','privacy','cookies','acceptableUse','suspensionTermination','jurisdictionDisputes','billingTaxCurrency','accountingTaxRetention','subprocessorsTransfers','cancellationRefundDelinquency','ipEvidencePolicy','humanHealthAddendum'
];

test('issue #29 canonical attestation remains fail-closed until professional approval exists', () => {
  assert.equal(attestation.status, 'pending');
  assert.equal(attestation.reviewedAt, null);
  assert.equal(attestation.approvals.professionalReview, false);
  assert.equal(attestation.approvals.providerIdentity, false);
  assert.equal(attestation.reviewer.name, '');
  assert.equal(attestation.evidence.sha256, '');
});

test('issue #29 evidence manifest hashes canonical inputs and requires all legal approvals', () => {
  for (const path of [
    'backend/src/shared/legal/legalCatalog.ts',
    'backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json',
    'docs/legal/LEGAL_REVIEW_HANDOFF_V1.md',
    'docs/legal/PRODUCTION_LEGAL_CHECKLIST.md',
  ]) assert.match(script, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(script, /professional-attestation-not-approved/);
  assert.match(script, /professional-reviewed-at-missing/);
  assert.match(script, /provider-identity-incomplete/);
  assert.match(script, /candidate-sha-unknown/);
  assert.match(script, /working-tree-dirty/);
  assert.match(script, /contentSetSha256/);
  assert.match(script, /approvalsComplete/);
  for (const approval of requiredApprovals) assert.match(script, new RegExp(approval));
  assert.match(script, /PASS proves a candidate-bound version\/hash chain only/);
  assert.doesNotMatch(script, /status\s*[:=]\s*['"]approved['"]/);
});

test('review evidence and production gate require the same approval taxonomy', () => {
  for (const approval of requiredApprovals) {
    assert.match(script, new RegExp(approval));
    assert.match(gate, new RegExp(approval));
  }
  assert.match(gate, /LEGAL_REVIEW_EVIDENCE_SHA256/);
  assert.match(gate, /LEGAL_PROVIDER_NAME/);
  assert.match(gate, /runtime\.evidence\.matches-attestation/);
  assert.match(gate, /attestation\.status/);
});
