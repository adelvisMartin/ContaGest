import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('14/51 backend stores one transactional periodontal exam as six structured CareMeasurement sites',()=>{
  const source=read('backend/src/modules/verticals/health.routes.ts');
  for(const token of ['PERIODONTAL_SITES','periodontalExamSchema',"/health/periodontal-exams","periodontal-site",'CareMeasurement','prisma.$transaction','actorUserId'])assert.ok(source.includes(token),token);
  assert.match(source,/sites:\s*z\.array\([\s\S]*?\.length\(6\)/);
  assert.match(source,/new Set\([\s\S]*?site/);
});

test('14/51 validates canonical six-site periodontal measurements and tenant-owned patient/professional',()=>{
  const source=read('backend/src/modules/verticals/health.routes.ts');
  for(const token of ['mesiobuccal','buccal','distobuccal','mesiolingual','lingual','distolingual','probingDepth','gingivalMargin','clinicalAttachmentLevel','bleeding','suppuration','plaque','mobility','furcation'])assert.ok(source.includes(token),token);
  assert.match(source,/CarePatient/);
  assert.match(source,/CareProfessional/);
  assert.match(source,/tenantId/);
});

test('14/51 service exposes periodontal read and batch-create contracts',()=>{
  const source=read('frontend/src/services/verticalService.js');
  assert.match(source,/periodontalExams\(patientId\)/);
  assert.match(source,/createPeriodontalExam\(payload\)/);
  assert.match(source,/health\/periodontal-exams/);
});

test('14/51 dentistry UI captures six sites and renders evolution without auto-diagnosis',()=>{
  const source=read('frontend/src/pages/DentistryPracticePage.jsx');
  for(const token of ['Periodontograma','PERIODONTAL_SITES','probingDepth','gingivalMargin','clinicalAttachmentLevel','bleeding','suppuration','plaque','mobility','furcation','buildPeriodontalEvolution','HealthVerticalService.periodontalExams(','HealthVerticalService.createPeriodontalExam(','CgDataTable'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/autoDiagnosis|periodontitisStage|diagnosePeriodontitis/);
});

test('14/51 Wave A audit fails closed on periodontal contract regression',()=>{
  const source=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['PERIODONTAL_SITES','buildPeriodontalEvolution','periodontalExams','createPeriodontalExam','clinicalAttachmentLevel'])assert.ok(source.includes(token),token);
});
