import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('Clean Code batch 3 gives Health one request-schema authority',()=>{
  const routes=read('backend/src/modules/verticals/health.routes.ts');
  const schemas=read('backend/src/modules/verticals/health.schemas.ts');

  assert.match(routes,/from '\.\/health\.schemas\.js'/);
  assert.doesNotMatch(routes,/const patientSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const dentalClinicalDataSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const encounterSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const immunizationSchema\s*=\s*z\./);

  for(const contract of [
    'patientSchema',
    'appointmentSchema',
    'dentalClinicalDataSchema',
    'periodontalClinicalDataSchema',
    'dentalTreatmentPlanClinicalDataSchema',
    'acceptedDentalTreatmentPlanClinicalDataSchema',
    'dentalEncounterWorkflowSchema',
    'encounterSchema',
    'dentalEncounterAmendmentSchema',
    'veterinaryVitalBatchSchema',
    'immunizationSchema'
  ]) assert.match(schemas,new RegExp(`export const ${contract}\\b`),contract);
});

test('Health schema module stays pure and route module keeps operational authority',()=>{
  const routes=read('backend/src/modules/verticals/health.routes.ts');
  const schemas=read('backend/src/modules/verticals/health.schemas.ts');

  for(const forbidden of [/\bprisma\b/,/\$queryRawUnsafe/,/\$executeRawUnsafe/,/Router\(/,/requirePermission/]){
    assert.doesNotMatch(schemas,forbidden);
  }

  for(const operational of [
    'lockAppointmentSchedule',
    'assertAppointmentSlotAvailable',
    'normalizeDentalTreatmentPlan',
    'buildDentalFinancialAnalytics',
    'dentalFinancialLinkSelect',
    'prisma.$transaction',
    "requirePermission('health.manage')"
  ]) assert.ok(routes.includes(operational),operational);
});

test('Health public route surface remains intact after schema extraction',()=>{
  const routes=read('backend/src/modules/verticals/health.routes.ts');
  const expected=[
    '/health/summary',
    '/health/patients',
    '/health/professionals',
    '/health/appointments',
    '/health/encounters',
    '/health/encounters/:id/amend',
    '/health/encounters/:id/workflow',
    '/health/encounters/:id/treatment-plan-decision',
    '/health/dental/financial',
    '/health/encounters/:id/financial-link',
    '/health/measurements',
    '/health/measurements/veterinary-vitals',
    '/health/immunizations'
  ];
  for(const route of expected) assert.ok(routes.includes(route),route);
  const count=(routes.match(/\brouter\.(?:get|post|patch|put|delete)\(/g)||[]).length;
  assert.equal(count,20);
});

test('implementation matrix traces the dentistry schema-authority review precisely',()=>{
  const manifest=JSON.parse(read('config/implementation-roadmap-1-58.json'));
  const reviewed=manifest.implementations
    .filter((row)=>row.reviewStatus==='CLEAN_CODE_BATCH_3_SCHEMA_AUTHORITY')
    .map((row)=>row.id);
  assert.deepEqual(reviewed,[11,12,13,14,15,18,19,20]);
});
