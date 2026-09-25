import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { healthBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/health-extended.routes.ts','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/dentistry/DentalConsentPanel.jsx','utf8');

test('16/51 signs dental consent only through the specialized server-authoritative route',()=>{
  const source=backend();
  const start=source.indexOf("router.post('/health/consents/dental-treatment'");
  const end=source.indexOf("router.post('/health/consents/:id/revoke'",start);
  assert.ok(start>=0&&end>start,'specialized dental consent route');
  const route=source.slice(start,end);
  assert.match(route,/requirePermission\('health\.manage'\)/);
  assert.match(route,/DENTAL_CONSENT_KIND/);
  assert.match(route,/typed-attestation/);
  assert.match(route,/createHash\('sha256'\)/);
  assert.match(route,/stableJson/);
  assert.match(route,/treatmentPlanFingerprint/);
  assert.match(route,/consentSha256/);
  assert.match(route,/previousConsentId/);
  assert.match(route,/revision/);
  assert.match(route,/actorUserId/);
  assert.match(route,/actorEmail/);
  assert.match(route,/signedAt/);
  assert.match(route,/pg_advisory_xact_lock/);
  assert.match(route,/hashtextextended/);
  assert.match(route,/DENTAL_CONSENT_TEMPLATE_VERSION/);
  assert.doesNotMatch(route,/body\.actorUserId|body\.actorEmail|body\.signedAt|body\.revision|body\.previousConsentId|body\.documentVersion/);
});
test('16/51 consent requires an accepted signed treatment plan for the same tenant and patient',()=>{
  const source=backend();
  assert.match(source,/CareEncounter/);
  assert.match(source,/"tenantId"=\$1 AND "id"=\$2 AND "patientId"=\$3/);
  assert.match(source,/plan\.type!=='dental-treatment-plan'/);
  assert.match(source,/plan\.status!=='signed'/);
  assert.match(source,/treatmentPlan\?\.status!=='accepted'/);
  assert.match(source,/acceptance\?\.status!=='accepted'/);
  assert.match(source,/CarePatient/);
});

test('16/51 consent versions are append-only and block a second active signed consent',()=>{
  const source=backend();
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/latest\?\.status==='signed'/);
  assert.match(source,/revision=Number\(latestMetadata\.revision\|\|0\)\+1/);
  assert.match(source,/INSERT INTO public\."CareConsent"/);
  assert.doesNotMatch(source,/UPDATE public\."CareConsent"[\s\S]{0,500}SET[^;]*"signerName"/);
});

test('16/51 revocation is server-authored and preserves signed evidence metadata',()=>{
  const source=backend();
  assert.match(source,/router\.post\('\/health\/consents\/:id\/revoke'/);
  assert.match(source,/previous\.status!=='signed'/);
  assert.match(source,/status"='revoked'|status\"='revoked'/);
  for(const token of ['revokedAt','revocation','reason','actorUserId','actorEmail','revocationSha256']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/body\.revokedAt|body\.actorUserId|body\.actorEmail/);
});

test('16/51 generic consent endpoint cannot forge the dentistry consent kind',()=>{
  const source=backend();
  assert.match(source,/body\.kind===DENTAL_CONSENT_KIND/);
  assert.match(source,/flujo especializado/);
});

test('16/51 backend and panel share the same dental consent kind',()=>{
  const api=backend();
  const ui=panel();
  assert.match(api,/DENTAL_CONSENT_KIND\s*=\s*'dental-treatment-consent'/);
  assert.match(ui,/item\.kind==='dental-treatment-consent'/);
  assert.match(ui,/signerRole/);
});

test('16/51 frontend loads, signs and revokes consent through canonical services',()=>{
  const svc=service();
  const ui=page();
  assert.match(svc,/signDentalConsent\(payload\)/);
  assert.match(svc,/consents\/dental-treatment/);
  assert.match(svc,/revokeConsent\(id,\s*payload\)/);
  assert.match(svc,/consents\\/\\$\\{pathId\\(id\\)\\}\\/revoke/);
  assert.match(ui,/HealthVerticalService\.consents\(/);
  assert.match(ui,/HealthVerticalService\.signDentalConsent\(/);
  assert.match(ui,/HealthVerticalService\.revokeConsent\(/);
  assert.match(ui,/DentalConsentPanel/);
});

test('16/51 consent UI is explicit about typed attestation versus cryptographic/legal signature',()=>{
  const source=panel();
  for(const token of ['Firma declarativa','No es un certificado criptográfico','attestation','Nombre del firmante','Texto del consentimiento','Revocar consentimiento','SHA-256','Revisión']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/signaturePad|canvas|getContext\(/);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML/);
});
