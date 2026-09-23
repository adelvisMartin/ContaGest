import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const routes=()=>fs.readFileSync('backend/src/modules/verticals/gym.routes.ts','utf8');
const migration=()=>fs.readFileSync('backend/prisma/migrations/20260923190000_gym_ingredient_model_43_51/migration.sql','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/fitness/NutritionIngredientLibrary.jsx','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/GymManagementPage.jsx','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');

test('43/51 persists tenant foods and recipes without pre-implementing plans',()=>{
  const sql=migration();
  for(const token of ['GymFood','GymRecipe','GymRecipeIngredient','caloriesPer100g','proteinGPer100g','carbsGPer100g','fatGPer100g','fiberGPer100g','sourceRef','grams']) assert.ok(sql.includes(token),token);
  assert.doesNotMatch(sql,/GymMealPlanDay|GymNutritionAdherence|restriction|micronutrient/i);
});

test('43/51 backend exposes tenant-scoped food and recipe catalog routes',()=>{
  const source=routes();
  for(const token of ["router.get('/gym/foods'","router.post('/gym/foods'","router.patch('/gym/foods/:id'","router.get('/gym/recipes'","router.post('/gym/recipes'",'foodSchema','recipeSchema','GymRecipeIngredient']) assert.ok(source.includes(token),token);
  assert.match(source,/"tenantId"=\$1/);
  assert.match(source,/pg_advisory_xact_lock/);
});

test('43/51 recipe macros are derived server-side from ingredient grams',()=>{
  const source=routes();
  for(const token of ['caloriesPer100g','proteinGPer100g','carbsGPer100g','fatGPer100g','fiberGPer100g','grams','perServing']) assert.ok(source.includes(token),token);
  assert.match(source,/\/100/);
  assert.doesNotMatch(source,/b\.totalCalories|b\.totalProtein|b\.totalCarbs|b\.totalFat/);
});

test('43/51 UI provides foods ingredients recipes and macro summaries declaratively',()=>{
  const source=panel();
  for(const token of ['Alimentos','Ingredientes','Recetas','Calorías','Proteína','Carbohidratos','Grasas','Fibra','USDA','Agregar ingrediente','Por porción']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML|document\./);
});

test('43/51 integration has one owner and no complete meal-plan builder yet',()=>{
  const ui=page();
  const svc=service();
  assert.equal((ui.match(/<NutritionIngredientLibrary/g)||[]).length,1);
  for(const token of ['foods(','createFood(','updateFood(','recipes(','createRecipe(']) assert.ok(svc.includes(token),token);
  assert.doesNotMatch(panel(),/plan semanal|adherencia|restricciones médicas|micronutrientes/i);
});
