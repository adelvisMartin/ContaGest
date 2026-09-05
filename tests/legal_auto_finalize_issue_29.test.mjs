import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/legal-auto-finalize-v29.yml', 'utf8');
const evidence = fs.readFileSync('scripts/legal-review-evidence-v29.mjs', 'utf8');
const productionGate = fs.readFileSync('scripts/legal-production-gate.mjs', 'utf8');
const legalE2E = fs.readFileSync('qa/legal-first-access.spec.mjs', 'utf8');

test('#29 receives provider identity and professional evidence only from repository configuration/attestation', () => {
  for (const key of [
    'LEGAL_PROVIDER_NAME', 'LEGAL_PROVIDER_RIF', 'LEGAL_PROVIDER_ADDRESS',
    'LEGAL_CONTACT_EMAIL', 'LEGAL_SUPPORT_EMAIL',
    'LEGAL_REVIEW_APPROVED_VERSION', 'LEGAL_REVIEW_EVIDENCE_SHA256'
  ]) assert.match(workflow, new RegExp(`vars\\.${key}`));
  assert.doesNotMatch(workflow, /example\.com|placeholder|changeme/i);
});

test('#29 can validate an exact candidate without closing the issue by default',()=>{
  assert.match(workflow,/candidate_sha:/);
  assert.match(workflow,/finalize_issue:/);
  assert.match(workflow,/default: false/);
  assert.match(workflow,/CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \|\| github\.sha \}\}/);
  assert.match(workflow,/git rev-parse HEAD/);
  assert.match(workflow,/inputs\.finalize_issue == true/);
  assert.match(workflow,/validationOnly/);
});

test('#29 performs a redacted configuration preflight before dependency/browser cost',()=>{
  const preflight=workflow.indexOf('Preflight de identidad y evidencia sin imprimir valores');
  const install=workflow.indexOf('npm ci --no-audit --no-fund');
  const browser=workflow.indexOf('playwright install --with-deps chromium');
  assert.ok(preflight>=0&&install>preflight&&browser>install);
  assert.match(workflow,/BLOCKED_LEGAL_CONFIGURATION/);
  assert.match(workflow,/\^\[0-9a-fA-F\]\{64\}\$/);
  assert.doesNotMatch(workflow,/echo\s+"\$LEGAL_PROVIDER_/);
});

test('#29 requires approved professional attestation and all mandatory approvals', () => {
  assert.match(evidence, /attestation\?\.status !== 'approved'/);
  assert.match(evidence, /professionalReview/);
  assert.match(evidence, /providerIdentity/);
  assert.match(evidence, /humanHealthAddendum/);
  assert.match(productionGate, /runtime\.evidence\.matches-attestation/);
});

test('#29 has explicit E2E for first access, rejection and version reacceptance', () => {
  assert.match(legalE2E, /must explicitly accept current legal documents/);
  assert.match(legalE2E, /rejecting required legal documents logs out/);
  assert.match(legalE2E, /forces reacceptance of the new version/);
  assert.match(workflow, /qa\/legal-first-access\.spec\.mjs/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});

test('#29 closes only after professional evidence, production gate and legal E2E all pass', () => {
  const evidenceIndex = workflow.indexOf('node scripts/legal-review-evidence-v29.mjs');
  const productionIndex = workflow.indexOf('node scripts/legal-production-gate.mjs');
  const e2eIndex = workflow.indexOf('npx playwright test qa/legal-first-access.spec.mjs');
  const closeIndex = workflow.indexOf('gh issue close 29');
  assert.ok(evidenceIndex >= 0 && productionIndex > evidenceIndex && e2eIndex > productionIndex && closeIndex > e2eIndex);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /\|\|\s*true/);
});
