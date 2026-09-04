import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/legal-auto-finalize-v29.yml', 'utf8');
const evidence = fs.readFileSync('scripts/legal-review-evidence-v29.mjs', 'utf8');
const productionGate = fs.readFileSync('scripts/legal-production-gate.mjs', 'utf8');

test('#29 receives provider identity and professional evidence only from repository configuration/attestation', () => {
  for (const key of [
    'LEGAL_PROVIDER_NAME', 'LEGAL_PROVIDER_RIF', 'LEGAL_PROVIDER_ADDRESS',
    'LEGAL_CONTACT_EMAIL', 'LEGAL_SUPPORT_EMAIL',
    'LEGAL_REVIEW_APPROVED_VERSION', 'LEGAL_REVIEW_EVIDENCE_SHA256'
  ]) assert.match(workflow, new RegExp(`vars\\.${key}`));
  assert.doesNotMatch(workflow, /example\.com|placeholder|changeme/i);
});

test('#29 requires approved professional attestation and all mandatory approvals', () => {
  assert.match(evidence, /attestation\?\.status !== 'approved'/);
  assert.match(evidence, /professionalReview/);
  assert.match(evidence, /providerIdentity/);
  assert.match(evidence, /humanHealthAddendum/);
  assert.match(productionGate, /runtime\.evidence\.matches-attestation/);
});

test('#29 closes only after evidence and production gates execute without failure', () => {
  const evidenceIndex = workflow.indexOf('node scripts/legal-review-evidence-v29.mjs');
  const productionIndex = workflow.indexOf('node scripts/legal-production-gate.mjs');
  const closeIndex = workflow.indexOf('gh issue close 29');
  assert.ok(evidenceIndex >= 0 && productionIndex > evidenceIndex && closeIndex > productionIndex);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /\|\|\s*true/);
});
