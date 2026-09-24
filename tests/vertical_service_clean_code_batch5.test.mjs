import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('batch 5 centralizes vertical client query id and photo helpers',()=>{
  const service=read('frontend/src/services/verticalService.js');
  const helpers=read('frontend/src/services/verticalService.helpers.js');
  assert.match(service,/from '\.\/verticalService\.helpers\.js'/);
  for(const token of ['query','pathId','createWithPhoto']) assert.match(helpers,new RegExp(`export (?:const|async function) ${token}\\b`),token);
  assert.doesNotMatch(service,/encodeURIComponent\(/);
  assert.doesNotMatch(service,/const query\s*=|function createWithPhoto/);
  assert.match(helpers,/encodeURIComponent\(String\(value\?\?''\)\)/);
});

test('batch 5 preserves vertical service public authorities',()=>{
  const service=read('frontend/src/services/verticalService.js');
  for(const exported of ['HealthVerticalService','VeterinaryService','GymVerticalService','CommunicationTemplateService']){
    assert.match(service,new RegExp(`export const ${exported}\\b`),exported);
  }
  for(const method of [
    'createDentalFinancialLink',
    'createVeterinaryVitalMeasurements',
    'createMedicationPrescription',
    'createClinicalInventoryLot',
    'createGuardianPortalGrant',
    'createBoardingStay',
    'evaluateProgression',
    'createPeriodizationProgram',
    'startWorkoutSession',
    'suggestExerciseSubstitutions',
    'createIngredientNutritionProfile',
    'recordMealAdherence'
  ]) assert.match(service,new RegExp(`\\b${method}\\(`),method);
});

test('batch 5 keeps endpoint literals and BackendApi ownership in verticalService',()=>{
  const service=read('frontend/src/services/verticalService.js');
  const helpers=read('frontend/src/services/verticalService.helpers.js');
  for(const endpoint of [
    '/api/v1/verticals/health/encounters/',
    '/api/v1/verticals/veterinary/financial-cases',
    '/api/v1/verticals/veterinary/boarding/stays',
    '/api/v1/verticals/gym/progression/evaluate',
    '/api/v1/verticals/gym/workout-sessions',
    '/api/v1/verticals/gym/nutrition',
    '/api/v1/verticals/gym/adherence/meals'
  ]) assert.ok(service.includes(endpoint),endpoint);
  assert.match(service,/BackendApi/);
  assert.doesNotMatch(helpers,/BackendApi|AuthSession|fetch\(/);
});

test('batch 5 query helper omits empty undefined and null values by contract',()=>{
  const helpers=read('frontend/src/services/verticalService.helpers.js');
  assert.match(helpers,/item!==undefined&&item!==null&&item!==''/);
  assert.match(helpers,/URLSearchParams/);
});

test('implementation audit records client review without overwriting prior batches',()=>{
  const manifest=JSON.parse(read('config/implementation-roadmap-1-58.json'));
  const reviewed=manifest.implementations
    .filter((row)=>(row.reviewBatches||[]).includes('CLEAN_CODE_BATCH_5_VERTICAL_CLIENT'))
    .map((row)=>row.id);
  assert.deepEqual(reviewed,Array.from({length:38},(_,i)=>10+i));
  assert.ok((manifest.implementations.find((row)=>row.id===38).reviewBatches||[]).includes('CLEAN_CODE_BATCH_4_FRONTEND_HELPERS'));
  assert.equal(manifest.implementations.find((row)=>row.id===38).reviewStatus,'CLEAN_CODE_BATCH_1');
});
