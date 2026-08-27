import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../scripts/legal-review-evidence-v29.mjs', import.meta.url), 'utf8');
const attestation = JSON.parse(readFileSync(new URL('../backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json', import.meta.url), 'utf8'));
const gate = readFileSync(new URL('../scripts/legal-production-gate.mjs', import.meta.url), 'utf8');

test('issue #29 canonical attestation remains fail-closed until professional approval exists', () => {
  assert.equal(attestation.status, 'pending');
  assert.equal(attestation.approvals.professionalReview, false);
  assert.equal(attestation.reviewer.name, '');
  assert.equal(attestation.evidence.sha256, '');
});

test('issue #29 evidence manifest hashes canonical legal inputs and never fabricates approval', () => {
  for (const path of [
    'backend/src/shared/legal/legalCatalog.ts',
    'backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json',
    'docs/legal/LEGAL_REVIEW_HANDOFF_V1.md',
    'docs/legal/PRODUCTION_LEGAL_CHECKLIST.md',
  ]) assert.match(script, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(script, /professional-attestation-not-approved/);
  assert.match(script, /PASS proves a version\/hash chain only/);
  assert.doesNotMatch(script, /status\s*[:=]\s*['"]approved['"]/);
});

test('issue #29 production gate still requires exact professional evidence SHA and provider identity', () => {
  assert.match(gate, /LEGAL_REVIEW_EVIDENCE_SHA256/);
  assert.match(gate, /LEGAL_PROVIDER_NAME/);
  assert.match(gate, /runtime\.evidence\.matches-attestation/);
  assert.match(gate, /attestation\.status/);
});
