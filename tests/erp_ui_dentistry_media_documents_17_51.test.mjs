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
  for(const token of ['CLINICAL_MAX_BYTES','application/pdf','clinicalAttachmentSchema','express.raw','validateClinicalMagic','dental-attachments','dental-attachment'])assert.ok(source.includes(token),token);
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

test('17/51 storage migration permits clinical PDF and 15 MB without weakening bucket privacy',()=>{
  const source=read('backend/prisma/migrations/20260918222000_dental_clinical_media_v1751/migration.sql');
  assert.match(source,/contagest-media/);
  assert.match(source,/15728640/);
  assert.match(source,/application\/pdf/);
  assert.match(source,/public\s*=\s*false|public=false/);
});

test('17/51 direct authenticated storage policies exclude the clinical dental folder',()=>{
  const source=read('backend/prisma/migrations/20260918222000_dental_clinical_media_v1751/migration.sql');
  assert.match(source,/dental-attachments/);
  assert.ok((source.match(/<> 'dental-attachments'/g)||[]).length>=4);
  for(const policy of ['tenant read','tenant insert','tenant update','tenant delete']) assert.ok(source.includes(policy),policy);
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
