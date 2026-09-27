import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dataMap = JSON.parse(fs.readFileSync('backend/src/modules/clinical-privacy/clinical-data-map-v567.json', 'utf8'));
const privacy = fs.readFileSync('backend/src/modules/clinical-privacy/clinical-privacy.service.ts', 'utf8');
const media = fs.readFileSync('backend/src/modules/media/media.routes.ts', 'utf8');
const exportsRoute = fs.readFileSync('backend/src/modules/exports/exports.routes.ts', 'utf8');
const logger = fs.readFileSync('backend/src/shared/observability/logger.ts', 'utf8');
const ai = fs.readFileSync('backend/src/modules/ai/ai.routes.ts', 'utf8');
const moduleIndex = fs.readFileSync('backend/src/modules/index.ts', 'utf8');

test('#567 has a versioned clinical data map and explicitly avoids legal certification claims', () => {
  assert.equal(dataMap.schemaVersion, 1);
  assert.equal(dataMap.legalStatus, 'technical-privacy-controls-only-not-a-regulatory-certification');
  assert.equal(dataMap.entities.ClinicalMediaObject.signedUrlTtlSecondsMaximum, 3600);
  assert.equal(dataMap.qa.realSensitiveDataAllowed, false);
});

test('#567 server-side clinical export requires health permission, tenant fetch and audit', () => {
  assert.match(exportsRoute, /clinical-record/);
  assert.match(exportsRoute, /requirePermission\('health\.manage'\)/);
  assert.match(exportsRoute, /buildClinicalExport/);
  assert.match(exportsRoute, /clinical\.export/);
  assert.match(privacy, /WHERE "tenantId" = \$\{tenantId\} AND "id" = \$\{patientId\}/);
});

test('#567 media URLs remain bounded and tenant-scoped and sensitive accesses are audited', () => {
  assert.match(media, /expiresIn: z\.coerce\.number\(\)\.int\(\)\.min\(60\)\.max\(86400\)/);
  assert.match(media, /createSignedUrl\(storagePath,3600\)/);
  assert.match(media, /pathTenantId !== tenantId/);
  assert.match(moduleIndex, /clinical\.media\.access/);
  assert.match(moduleIndex, /clinical\.media\.signed_url/);
  assert.match(privacy, /CLINICAL_MEDIA_TENANT_MISMATCH/);
});

test('#567 logs redact structured clinical content', () => {
  for (const field of ['clinicalData','subjective','objective','assessment','plan','diagnosisCodes','allergies','conditions','medicalNotes']) {
    assert.ok(logger.includes(`'${field}'`), `missing redaction for ${field}`);
    assert.ok(logger.includes(`'body.${field}'`), `missing body redaction for ${field}`);
  }
});

test('#567 external AI is approval-gated and clinical content fails closed to local processing', () => {
  assert.match(privacy, /OPENAI_OPERATIONAL_EXTERNAL_APPROVED/);
  assert.match(privacy, /CLINICAL_EXTERNAL_TRANSFER_BLOCKED/);
  assert.match(ai, /assertExternalClinicalTransferAllowed/);
  assert.match(ai, /se procesó localmente porque la política de privacidad bloqueó/);
});
