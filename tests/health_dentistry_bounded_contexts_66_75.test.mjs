import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const routeSignatures=(source)=>[...source.matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/g)]
  .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);

const routeFiles=[
  'backend/src/modules/verticals/health-core.routes.ts',
  'backend/src/modules/verticals/health-encounters.routes.ts',
  'backend/src/modules/verticals/health-dental-financial.routes.ts',
  'backend/src/modules/verticals/health-measurements.routes.ts'
];

const expected=[
  'GET /health/summary',
  'GET /health/patients','POST /health/patients',
  'GET /health/professionals','POST /health/professionals',
  'GET /health/appointments','POST /health/appointments','PATCH /health/appointments/:id',
  'GET /health/encounters','POST /health/encounters',
  'POST /health/encounters/:id/amend',
  'POST /health/encounters/:id/workflow',
  'POST /health/encounters/:id/treatment-plan-decision',
  'GET /health/dental/financial',
  'POST /health/encounters/:id/financial-link',
  'GET /health/measurements','POST /health/measurements',
  'POST /health/measurements/veterinary-vitals',
  'GET /health/immunizations','POST /health/immunizations'
];

test('66/75 preserves all 20 Health/Dentistry HTTP contracts in registration order',()=>{
  const actual=routeFiles.flatMap((path)=>routeSignatures(read(path)));
  assert.deepEqual(actual,expected);
  assert.equal(actual.length,20);
  assert.equal(new Set(actual).size,20,'health bounded contexts must not duplicate route ownership');
});

test('66/75 preserves endpoint-level authorization and dental sales gates',()=>{
  for(const path of routeFiles){
    const source=read(path);
    const routes=routeSignatures(source);
    const healthGuards=[...source.matchAll(/requirePermission\('health\.manage'\)/g)];
    assert.equal(healthGuards.length,routes.length,`${path} must preserve one health.manage guard per endpoint`);
  }
  const financial=read('backend/src/modules/verticals/health-dental-financial.routes.ts');
  assert.equal((financial.match(/requirePermission\('sales\.view'\)/g)||[]).length,1);
  assert.equal((financial.match(/requirePermission\('sales\.manage'\)/g)||[]).length,1);
});

test('66/75 keeps a persistence-free composition root and one helper authority',()=>{
  const root=read('backend/src/modules/verticals/health.routes.ts');
  assert.equal(routeSignatures(root).length,0);
  assert.doesNotMatch(root,/\$queryRaw|\$executeRaw|prisma\./);
  const order=['coreRoutes','encounterRoutes','dentalFinancialRoutes','measurementRoutes'];
  let previous=-1;
  for(const name of order){
    const current=root.indexOf(`router.use(${name})`);
    assert.ok(current>previous,`invalid health bounded-context mount order for ${name}`);
    previous=current;
  }
  const helpers=read('backend/src/modules/verticals/health.route-helpers.ts');
  assert.doesNotMatch(helpers,/Router\(|router\./);
  for(const name of ['lockAppointmentSchedule','assertAppointmentSlotAvailable','normalizeDentalTreatmentPlan','buildDentalFinancialAnalytics','normalizeDentalTreatmentDraft']){
    assert.match(helpers,new RegExp(`export const ${name}`));
  }
});

test('66/75 preserves schema and financial calculation authorities',()=>{
  const encounters=read('backend/src/modules/verticals/health-encounters.routes.ts');
  const financial=read('backend/src/modules/verticals/health-dental-financial.routes.ts');
  const schemas=read('backend/src/modules/verticals/health.schemas.ts');
  assert.match(encounters,/from '.\/health\.schemas\.js'/);
  assert.match(financial,/from '.\/health\.schemas\.js'/);
  assert.match(financial,/from '..\/..\/shared\/financial\/invoice\.js'/);
  assert.match(financial,/from '..\/..\/shared\/financial\/decimal\.js'/);
  assert.match(schemas,/export const encounterSchema/);
  assert.match(schemas,/export const dentalFinancialQuerySchema/);
  assert.doesNotMatch(encounters,/z\.object\(/);
  assert.doesNotMatch(financial,/z\.object\(/);
});

test('66/75 keeps DentistryPracticePage as the single workspace orchestrator',()=>{
  const page=read('frontend/src/pages/DentistryPracticePage.jsx');
  const primitive=read('frontend/src/components/dentistry/DentistryWorkspacePrimitives.jsx');
  for(const panel of ['DentalSchedulePanel','DentalFinancialPanel','DentalConsentPanel','DentalMediaPanel','DentalLifecycleActions','PeriodontalChartPanel','TreatmentPlanPanel']){
    assert.match(page,new RegExp(panel));
  }
  assert.match(page,/DentistryWorkspacePrimitives/);
  assert.doesNotMatch(page,/function Metric\(/);
  assert.match(primitive,/export function Metric/);
  assert.doesNotMatch(primitive,/useState\(|useEffect\(|HealthVerticalService/);
});

test('66/75 does not introduce validation or browser bypasses',()=>{
  const source=[
    ...routeFiles.map(read),
    read('backend/src/modules/verticals/health.route-helpers.ts'),
    read('backend/src/modules/verticals/health.routes.ts'),
    read('frontend/src/pages/DentistryPracticePage.jsx'),
    read('frontend/src/components/dentistry/DentistryWorkspacePrimitives.jsx')
  ].join('\n');
  assert.doesNotMatch(source,/test\.skip|test\.only|waitForTimeout|force:\s*true/);
});
