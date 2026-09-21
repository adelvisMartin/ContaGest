import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('17/51 BackendApi preserves binary bodies and does not JSON stringify Blob/File uploads',()=>{
  const source=read('frontend/src/services/backendApi.js');
  for(const token of ['isBinaryBody','Blob','ArrayBuffer','ArrayBuffer.isView'])assert.ok(source.includes(token),token);
  assert.match(source,/!isBinaryBody/);
});

test('17/51 media route accepts private dental images and PDFs through bounded raw upload',()=>{
  const source=read('backend/src/modules/media/media.routes.ts');
  for(const token of ['CLINICAL_MAX_BYTES','application/pdf','clinicalAttachmentSchema','express.raw','validateClinicalMagic','dental-attachments','dental-attachment','DENTAL_BUCKET'])assert.ok(source.includes(token),token);
  assert.match(source,/DENTAL_BUCKET\s*=\s*'contagest-clinical-media'/);
  assert.match(source,/15\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source,/image\/jpeg/);
  assert.match(source,/image\/png/);
  assert.match(source,/image\/webp/);
});

test('17/51 attachment authority is tenant scoped health.manage and immutable CareEncounter',()=>{
  const source=read('backend/src/modules/media/media.routes.ts');
  for(const token of ['health.manage','CarePatient','CareEncounter',"type:'dental-attachment'",'confidential','status','signed','sha256','storagePath','uploadedBy'])assert.ok(source.includes(token),token);
  assert.match(source,/"tenantId"\s*=\s*\$2|"tenantId"=\$1/);
  assert.doesNotMatch(source,/UPDATE public\."CareEncounter"[\s\S]{0,500}dental-attachment/);
});

test('17/51 optional encounter tooth and treatment-plan links are validated in same patient tenant',()=>{
  const source=read('backend/src/modules/media/media.routes.ts');
  for(const token of ['linkedEncounterId','treatmentPlanEncounterId','tooth','dental-treatment-plan'])assert.ok(source.includes(token),token);
  assert.match(source,/patientId/);
});

test('17/51 generic media signing and deletion cannot bypass clinical media boundary',()=>{
  const source=read('backend/src/modules/media/media.routes.ts');
  assert.match(source,/dental-attachment/);
  assert.match(source,/health\.manage/);
  assert.match(source,/adjuntos clínicos|adjunto clínico/i);
});

test('17/51 storage migration isolates clinical PDF/15 MB from generic media bucket',()=>{
  const source=read('backend/prisma/migrations/20260918222000_dental_clinical_media_v1751/migration.sql');
  assert.match(source,/contagest-clinical-media/);
  assert.match(source,/15728640/);
  assert.match(source,/application\/pdf/);
  assert.match(source,/public\s*=\s*false|public=false/);
  assert.doesNotMatch(source,/UPDATE storage\.buckets[\s\S]{0,300}WHERE id = 'contagest-media'/);
});

test('17/51 clinical storage is server-only with no authenticated direct policies',()=>{
  const source=read('backend/prisma/migrations/20260918222000_dental_clinical_media_v1751/migration.sql');
  for(const policy of ['clinical media tenant read','clinical media tenant insert','clinical media tenant update','clinical media tenant delete']){
    assert.ok(source.includes(`DROP POLICY IF EXISTS "ContaGest ${policy}"`),policy);
    assert.ok(!source.includes(`CREATE POLICY "ContaGest ${policy}"`),policy);
  }
});

test('17/51 clinical metadata stays out of upload URLs',()=>{
  const service=read('frontend/src/services/mediaService.js');
  const backend=read('backend/src/modules/media/media.routes.ts');
  assert.match(service,/x-clinical-metadata/);
  assert.match(backend,/x-clinical-metadata/);
  assert.match(service,/BackendApi\.request\('\/media\/dental-attachments',\{/);
  assert.doesNotMatch(service,/uploadDentalAttachment[\s\S]{0,1800}BackendApi\.request\(`\/media\/dental-attachments\?/);
  assert.doesNotMatch(backend,/clinicalAttachmentSchema\.parse\(req\.query/);
});

test('17/51 MediaService uploads binary dental attachments and lists signed records',()=>{
  const source=read('frontend/src/services/mediaService.js');
  for(const token of ['uploadDentalAttachment','dentalAttachments','application/pdf','15 * 1024 * 1024','content-type'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/readAsDataURL\(file\)[\s\S]{0,300}uploadDentalAttachment/);
});

test('17/51 dentistry composes one document/media panel in patient context',()=>{
  const page=read('frontend/src/pages/DentistryPracticePage.jsx');
  const panel=read('frontend/src/components/dentistry/DentalMediaPanel.jsx');
  assert.equal((page.match(/<DentalMediaPanel/g)||[]).length,1);
  for(const token of ['MediaService.dentalAttachments(','MediaService.uploadDentalAttachment(','dentalAttachments','DentalMediaPanel'])assert.ok(page.includes(token),token);
  for(const token of ['Radiografía','Foto clínica','Estudio / informe','Documento','Pieza','Encuentro relacionado','Plan relacionado','SHA-256','Abrir archivo'])assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/innerHTML|querySelector|addEventListener/);
});
