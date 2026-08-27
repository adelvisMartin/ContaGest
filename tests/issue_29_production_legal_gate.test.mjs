import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const gate=path.join(root,'scripts','legal-production-gate.mjs');
const version=read('backend/src/shared/legal/legalCatalog.ts').match(/LEGAL_DOCUMENT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const evidenceSha='a'.repeat(64);

const providerEnv={
  LEGAL_PROVIDER_NAME:'Proveedor QA C.A.',
  LEGAL_PROVIDER_RIF:'J-12345678-9',
  LEGAL_PROVIDER_ADDRESS:'Domicilio QA verificable',
  LEGAL_CONTACT_EMAIL:'legal@contagest.test',
  LEGAL_SUPPORT_EMAIL:'support@contagest.test',
  LEGAL_REVIEW_APPROVED_VERSION:version,
  LEGAL_REVIEW_EVIDENCE_SHA256:evidenceSha
};
const approvalKeys=[
  'professionalReview','providerIdentity','terms','privacy','cookies','acceptableUse',
  'suspensionTermination','jurisdictionDisputes','billingTaxCurrency','accountingTaxRetention',
  'subprocessorsTransfers','cancellationRefundDelinquency','ipEvidencePolicy','humanHealthAddendum'
];
const approvedAttestation=()=>({
  schemaVersion:1,
  status:'approved',
  reviewedAt:'2026-08-27T12:00:00.000Z',
  legalDocumentVersion:version,
  reviewer:{name:'Profesional QA',jurisdiction:'VE'},
  evidence:{reference:'qa://issue-29/professional-review',sha256:evidenceSha},
  approvals:Object.fromEntries(approvalKeys.map((key)=>[key,true]))
});

function runGate(attestationPath,extraEnv={}){
  return spawnSync(process.execPath,[gate],{
    cwd:root,
    env:{...process.env,...providerEnv,...extraEnv,LEGAL_RELEASE_ATTESTATION_PATH:attestationPath},
    encoding:'utf8'
  });
}

test('issue #29 production legal gate fails closed when professional attestation is missing',()=>{
  const missing=path.join(os.tmpdir(),`contagest-legal-missing-${process.pid}-${Date.now()}.json`);
  const result=runGate(missing);
  assert.notEqual(result.status,0);
  assert.match(`${result.stdout}\n${result.stderr}`,/VERDICT: BLOCKED/);
  assert.match(result.stdout,/attestation\.exists/);
});

test('issue #29 production legal gate accepts only a complete attestation for the canonical version',()=>{
  assert.ok(version,'LEGAL_DOCUMENT_VERSION must be discoverable');
  const file=path.join(os.tmpdir(),`contagest-legal-approved-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file,JSON.stringify(approvedAttestation()),'utf8');
  try{
    const result=runGate(file);
    assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout,/VERDICT: PASS/);
    assert.match(result.stdout,/runtime\.evidence\.matches-attestation/);
  }finally{fs.rmSync(file,{force:true});}
});

test('issue #29 production legal gate rejects stale document versions and incomplete approvals',()=>{
  const file=path.join(os.tmpdir(),`contagest-legal-stale-${process.pid}-${Date.now()}.json`);
  const attestation=approvedAttestation();
  attestation.legalDocumentVersion='stale.v0';
  attestation.approvals.billingTaxCurrency=false;
  fs.writeFileSync(file,JSON.stringify(attestation),'utf8');
  try{
    const result=runGate(file);
    assert.notEqual(result.status,0);
    assert.match(result.stdout,/attestation\.legalDocumentVersion/);
    assert.match(result.stdout,/approval\.billingTaxCurrency/);
  }finally{fs.rmSync(file,{force:true});}
});

test('issue #29 production legal gate rejects runtime evidence that does not match the professional attestation',()=>{
  const file=path.join(os.tmpdir(),`contagest-legal-mismatch-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file,JSON.stringify(approvedAttestation()),'utf8');
  try{
    const result=runGate(file,{LEGAL_REVIEW_EVIDENCE_SHA256:'b'.repeat(64)});
    assert.notEqual(result.status,0);
    assert.match(result.stdout,/runtime\.evidence\.matches-attestation/);
  }finally{fs.rmSync(file,{force:true});}
});

test('public production QA scripts require the legal gate before readiness checks',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['qa:legal:production'],'node scripts/legal-production-gate.mjs');
  assert.match(pkg.scripts['qa:production'],/^npm run qa:legal:production && /);
  assert.match(pkg.scripts['qa:production:full'],/^npm run qa:legal:production && /);
});

test('licensed customer runtime fails closed without real provider identity and professional review evidence',()=>{
  const runtimeGate=read('backend/src/shared/legal/legalReleaseRuntimeGate.ts');
  const middleware=read('backend/src/shared/legal/legalAcceptanceMiddleware.ts');
  const routes=read('backend/src/modules/legal/legal.routes.ts');
  assert.match(runtimeGate,/legalProviderIdentityReady/);
  assert.match(runtimeGate,/example\\\.com|example\\\.com/i);
  assert.match(runtimeGate,/emailPattern/);
  assert.match(runtimeGate,/LEGAL_REVIEW_APPROVED_VERSION/);
  assert.match(runtimeGate,/LEGAL_REVIEW_EVIDENCE_SHA256/);
  assert.match(runtimeGate,/approvedVersion===LEGAL_DOCUMENT_VERSION/);
  assert.match(runtimeGate,/legalProviderIdentityReady\(\)&&legalProfessionalReviewReady\(\)/);
  assert.match(middleware,/isProd&&!legalRuntimeProductionReady\(\)/);
  assert.match(middleware,/new HttpError\(503/);
  assert.match(routes,/productionReady:legalRuntimeProductionReady\(\)/);
  assert.match(routes,/isProd&&!legalRuntimeProductionReady\(\)/);
});

test('new contractual acceptance evidence does not retain raw IP or user-agent identifiers',()=>{
  const routes=read('backend/src/modules/legal/legal.routes.ts');
  const policy=read('backend/src/shared/legal/legalEvidencePolicy.ts');
  assert.match(routes,/legalEvidencePrivacyContext/);
  assert.doesNotMatch(routes,/req\.ip/);
  assert.doesNotMatch(routes,/headers\[['"]user-agent['"]\]/);
  assert.match(policy,/authenticated-context-no-network-identifiers\.v1/);
  assert.match(policy,/ipAddress:\s*null/);
  assert.match(policy,/userAgent:\s*null/);
});

test('HTTP 428 invalidates cached legal acceptance and requests re-evaluation',()=>{
  const api=read('frontend/src/services/backendApi.js');
  const enhancer=read('frontend/src/services/legalAcceptanceEnhancer.js');
  assert.match(api,/response\.status === 428/);
  assert.match(api,/cg:legal-required/);
  assert.match(enhancer,/addEventListener\('cg:legal-required',invalidateAcceptanceCache\)/);
  assert.match(enhancer,/sessionStorage\.removeItem\(key\)/);
  assert.match(enhancer,/queueMicrotask\(check\)/);
});
