import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fitnessWorkspaceSource, gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('46/51 persists immutable versioned ingredient nutrient profiles',()=>{
  const migration=read('backend/prisma/migrations/20260923213000_gym_nutrient_composition_46_51/migration.sql');
  for(const token of ['GymIngredientNutritionProfile','GymIngredientMicronutrient','GymIngredientNutritionProfile_tenant_ingredient_version_unique','basisQuantity','basisUnit','energyKcal','proteinG','carbsG','fatG','fiberG']) assert.ok(migration.includes(token),token);
  assert.match(migration,/GymIngredientMicronutrient_unit_check/);
});

test('46/51 profile API appends versions under a tenant ingredient lock',()=>{
  const source=gymBackendSource();
  for(const token of ["router.get('/gym/ingredients/:id/nutrition-profiles'","router.post('/gym/ingredients/:id/nutrition-profiles'",'ingredientNutritionProfileSchema','gym-nutrient-profile-46:','MAX("version")','GymIngredientMicronutrient']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/UPDATE public\."GymIngredientNutritionProfile"|DELETE FROM public\."GymIngredientNutritionProfile"/);
});

test('46/51 snapshots direct and recipe ingredients at plan creation',()=>{
  const source=gymBackendSource();
  const start=source.indexOf('const createPlanNutrientSnapshot');
  const end=source.indexOf('const classSchema',start);
  const block=source.slice(start,end);
  for(const token of ['GymMealItem','GymRecipeItem','GymIngredientNutritionProfile','GymIngredientMicronutrient','GymNutritionPlanNutrientSnapshot','profileRefs','MISSING_PROFILE','UNIT_MISMATCH']) assert.ok(block.includes(token),token);
  assert.match(block,/String\(occurrence\.unit\)!==String\(profile\.basisUnit\)/);
  assert.doesNotMatch(block,/convertUnit|unitConversion|gramsTo|mlTo/i);
});

test('46/51 plan write freezes one nutrient snapshot transactionally',()=>{
  const source=gymBackendSource();
  const start=source.indexOf("router.post('/gym/nutrition'");
  const end=source.indexOf("router.get('/gym/nutrition/:id/shopping-list'",start);
  const block=source.slice(start,end);
  assert.match(block,/prisma\.\$transaction/);
  assert.match(block,/await createPlanNutrientSnapshot\(tx,tenantId,createdPlan\.id/);
});

test('46/51 nutrient endpoint reads the frozen snapshot and never rebuilds history',()=>{
  const source=gymBackendSource();
  const start=source.indexOf("router.get('/gym/nutrition/:id/nutrients'");
  const end=source.indexOf("router.get('/gym/nutrition-rules'",start);
  const block=source.slice(start,end);
  assert.ok(block.includes('GymNutritionPlanNutrientSnapshot'));
  assert.doesNotMatch(block,/createPlanNutrientSnapshot|INSERT INTO|UPDATE public|DELETE FROM/);
});

test('46/51 UI exposes profile versioning and complete/incomplete snapshot states',()=>{
  const page=fitnessWorkspaceSource();
  const profile=read('frontend/src/components/fitness/IngredientNutritionProfilePanel.jsx');
  const snapshot=read('frontend/src/components/fitness/NutritionSnapshotPanel.jsx');
  assert.equal((page.match(/<IngredientNutritionProfilePanel/g)||[]).length,1);
  assert.equal((page.match(/<NutritionSnapshotPanel/g)||[]).length,1);
  for(const token of ['Composición nutricional por ingrediente','Guardar nueva versión','Micronutrientes','Unidad base']) assert.ok(profile.includes(token),token);
  for(const token of ['Snapshot nutricional del plan','Completo','Incompleto','Plan sin snapshot']) assert.ok(snapshot.includes(token),token);
  assert.doesNotMatch(profile+snapshot,/querySelector|addEventListener|innerHTML|document\./);
});

test('46/51 service uses canonical profile and snapshot endpoints',()=>{
  const service=read('frontend/src/services/verticalService.js');
  for(const token of ['ingredientNutritionProfiles(id)','createIngredientNutritionProfile(id, payload)','nutritionSnapshot(planId)']) assert.ok(service.includes(token),token);
});

test('46/51 does not pre-implement adherence',()=>{
  const migration=read('backend/prisma/migrations/20260923213000_gym_nutrient_composition_46_51/migration.sql');
  const profile=read('frontend/src/components/fitness/IngredientNutritionProfilePanel.jsx');
  const snapshot=read('frontend/src/components/fitness/NutritionSnapshotPanel.jsx');
  assert.doesNotMatch(migration+profile+snapshot,/adherence|compliance|consumedAt|mealCompletion/i);
});

test('46/51 Wave A fails closed on nutrition composition regressions',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['nutrient composition 46','UNIT_MISMATCH','must not silently convert incompatible units','must remain immutable/versioned']) assert.ok(audit.includes(token),token);
});
