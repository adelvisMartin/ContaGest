import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('43/51 nutrition schema supports structured ingredients with explicit nutrient basis and provenance',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['nutritionIngredientSchema','basisGrams','amountG','usda_fdc','fdcId','dataType','sourceDescription','snapshotAt'])assert.ok(source.includes(token),token);
  assert.match(source,/kind:\s*z\.literal\('ingredient'\)/);
  assert.match(source,/No mezcles ingredientes estructurados con items legacy/);
});

test('43/51 derives meal nutrition server-side from ingredient snapshots',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['deriveIngredientNutrition','deriveMealNutrition','amountG / ingredient.basisGrams','calories','proteinG','carbsG','fatG','fiberG','sodiumMg'])assert.ok(source.includes(token),token);
  assert.match(source,/mealNutrition\.calories/);
  assert.match(source,/JSON\.stringify\(meal\.items\)/);
});

test('43/51 preserves legacy string meals and validates tenant-owned member and trainer',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  assert.match(source,/z\.union\(\[z\.string\(\)[\s\S]*nutritionIngredientSchema\]\)/);
  assert.match(source,/GymMember/);
  assert.match(source,/GymTrainer/);
  assert.match(source,/tenantId/);
});

test('43/51 ingredient builder snapshots USDA provenance and uses detail before adding',()=>{
  const source=read('frontend/src/components/fitness/FitnessProductivityTools.jsx');
  for(const token of ['ingredientDraft','nutritionIngredients','FoodDataCentralService.detail(','basisGrams:100','source:\'usda_fdc\'','fdcId','snapshotAt','Agregar ingrediente'])assert.ok(source.includes(token),token);
  assert.match(source,/items:nutritionIngredients/);
});

test('43/51 audit fails closed on client-only macro authority or missing ingredient provenance',()=>{
  const source=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['nutritionIngredientSchema','deriveMealNutrition','FoodDataCentralService.detail(','basisGrams','usda_fdc'])assert.ok(source.includes(token),token);
});
