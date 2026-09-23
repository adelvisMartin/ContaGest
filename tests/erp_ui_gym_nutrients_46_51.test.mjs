import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('46/51 persists canonical ingredient nutrient composition with provenance',()=>{
  const migration=read('backend/prisma/migrations/20260923213000_gym_nutrient_persistence_46_51/migration.sql');
  for(const token of [
    'nutrientBasisQuantity','nutrientBasisUnit','energyKcal','proteinG','carbsG','fatG','fiberG',
    'micronutrients','nutritionSource','nutritionSourceRef','GymIngredient_nutrients_nonnegative'
  ]) assert.ok(migration.includes(token),token);
  assert.match(migration,/source-provided micronutrients only/i);
});

test('46/51 ingredient write contracts require explicit basis and source when composition exists',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of [
    'micronutrientValueSchema','micronutrientMapSchema',
    'La composición nutricional requiere una cantidad base explícita.',
    'La composición nutricional requiere una unidad base explícita.',
    'La composición nutricional requiere procedencia explícita.',
    '"nutrientBasisQuantity","nutrientBasisUnit","energyKcal","proteinG","carbsG","fatG","fiberG"'
  ]) assert.ok(source.includes(token),token);
});

test('46/51 persists explicit plan macro fiber and micronutrient targets',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const migration=read('backend/prisma/migrations/20260923213000_gym_nutrient_persistence_46_51/migration.sql');
  for(const token of ['fiberG','micronutrientTargets']) assert.ok(source.includes(token)&&migration.includes(token),token);
  assert.match(source,/JSON\.stringify\(b\.micronutrientTargets\|\|\{\}\)/);
});

test('46/51 derives composition only for exact matching basis units and surfaces unresolved items',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.get('/gym/nutrition/:id/composition'");
  const end=source.indexOf("router.get('/gym/nutrition/:id/shopping-list'",start);
  const block=source.slice(start,end);
  assert.ok(start>=0&&end>start,'composition endpoint must exist before shopping list');
  for(const token of [
    'p."unit"=i."nutrientBasisUnit"',
    'jsonb_each(i."micronutrients")',
    'unresolvedItems',
    "conversionPolicy:'exact-basis-unit-only'"
  ]) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/convertUnit|unitConversion|gramsPer|millilitersPer/i);
});

test('46/51 UI edits persisted composition and explicit daily targets',()=>{
  const ingredients=read('frontend/src/components/fitness/IngredientLibraryPanel.jsx');
  const targets=read('frontend/src/components/fitness/NutritionTargetFields.jsx');
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  for(const token of ['Cantidad base','Unidad nutricional','Energía kcal','Proteína g','Carbohidratos g','Grasa g','Fibra g','Procedencia','Micronutrientes disponibles en la fuente']) assert.ok(ingredients.includes(token),token);
  for(const token of ['Objetivos nutricionales diarios','Agregar objetivo micronutricional','No se calculan ni recomiendan automáticamente']) assert.ok(targets.includes(token),token);
  for(const token of ['NutritionTargetFields','proteinG','carbsG','fatG','fiberG','micronutrientTargets']) assert.ok(page.includes(token),token);
  assert.doesNotMatch(ingredients+targets,/querySelector|addEventListener|innerHTML|document\./);
});

test('46/51 service exposes canonical derived composition read',()=>{
  const service=read('frontend/src/services/verticalService.js');
  assert.match(service,/nutritionComposition\(planId\)/);
  assert.match(service,/\/verticals\/gym\/nutrition\/\$\{encodeURIComponent\(planId\)\}\/composition/);
});

test('46/51 does not automate clinical nutrition rules or invent micronutrient names',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const targets=read('frontend/src/components/fitness/NutritionTargetFields.jsx');
  const ingredients=read('frontend/src/components/fitness/IngredientLibraryPanel.jsx');
  assert.doesNotMatch(routes+targets+ingredients,/diagnos|clinicalRuleEngine|autoRecommend|recommendedMicronutrient|inferNutrient/i);
  assert.ok(ingredients.includes('Micronutrientes disponibles en la fuente'));
});
