import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('Clean Code batch 2 gives Gym one request-schema authority',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const schemas=read('backend/src/modules/verticals/gym.schemas.ts');

  assert.match(routes,/from '\.\/gym\.schemas\.js'/);
  assert.doesNotMatch(routes,/const memberSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const routineSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const completeNutritionSchema\s*=\s*z\./);

  for(const contract of [
    'memberSchema',
    'routineSchema',
    'progressionEvaluationSchema',
    'periodizationProgramSchema',
    'workoutSetSchema',
    'ingredientNutritionProfileSchema',
    'completeNutritionSchema',
    'mealAdherenceSchema'
  ]) assert.match(schemas,new RegExp(`export const ${contract}\\b`),contract);

  for(const route of [
    '/gym/members',
    '/gym/routines',
    '/gym/progression/evaluate',
    '/gym/periodization/programs',
    '/gym/workout-sessions',
    '/gym/nutrition',
    '/gym/adherence'
  ]) assert.ok(routes.includes(route),route);
});

test('Clean Code batch 2 gives Veterinary one request-schema authority',()=>{
  const routes=read('backend/src/modules/verticals/veterinary.routes.ts');
  const schemas=read('backend/src/modules/verticals/veterinary.schemas.ts');

  assert.match(routes,/from '\.\/veterinary\.schemas\.js'/);
  assert.doesNotMatch(routes,/const labOrderSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const hospitalizationSchema\s*=\s*z\./);
  assert.doesNotMatch(routes,/const veterinaryFinancialCaseSchema\s*=\s*z\./);

  for(const contract of [
    'labOrderSchema',
    'labResultSchema',
    'hospitalizationSchema',
    'treatmentSheetEntrySchema',
    'veterinaryMedicationPrescriptionSchema',
    'clinicalInventoryConsumptionSchema',
    'veterinaryFinancialCaseSchema',
    'veterinaryGuardianPortalGrantSchema',
    'veterinaryBoardingStaySchema'
  ]) assert.match(schemas,new RegExp(`export const ${contract}\\b`),contract);

  // Preserve the wider veterinary validation bounds instead of silently
  // changing them to verticals.shared limits.
  assert.match(schemas,/max\(4000\)/);
  assert.match(schemas,/max\(50\)/);

  for(const route of [
    '/lab-orders',
    '/hospitalizations',
    '/hospitalizations/:id/treatment-sheet',
    '/medications/prescriptions',
    '/clinical-inventory/consume',
    '/financial-cases',
    '/guardian-portal/grants',
    '/boarding/stays'
  ]) assert.ok(routes.includes(route),route);
});

test('batch 2 extraction keeps persistence and authorization in route modules',()=>{
  const gym=read('backend/src/modules/verticals/gym.routes.ts');
  const veterinary=read('backend/src/modules/verticals/veterinary.routes.ts');
  const gymSchemas=read('backend/src/modules/verticals/gym.schemas.ts');
  const veterinarySchemas=read('backend/src/modules/verticals/veterinary.schemas.ts');

  assert.match(gym,/requirePermission\('gym\.manage'\)/);
  assert.match(veterinary,/requireTenant, requirePermission\('health\.manage'\)/);
  assert.match(gym,/prisma\.\$transaction/);
  assert.match(veterinary,/prisma\.\$transaction/);

  for(const schemas of [gymSchemas,veterinarySchemas]){
    assert.doesNotMatch(schemas,/\bprisma\b/);
    assert.doesNotMatch(schemas,/Router\(/);
    assert.doesNotMatch(schemas,/requirePermission|requireTenant/);
    assert.doesNotMatch(schemas,/\$queryRawUnsafe|\$executeRawUnsafe/);
  }
});
