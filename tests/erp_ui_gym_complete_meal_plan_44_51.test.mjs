import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const routes=()=>fs.readFileSync('backend/src/modules/verticals/gym.routes.ts','utf8');
const migration=()=>fs.readFileSync('backend/prisma/migrations/20260923193000_gym_complete_meal_plan_44_51/migration.sql','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/GymManagementPage.jsx','utf8');
const builder=()=>fs.readFileSync('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx','utf8');
const recipes=()=>fs.readFileSync('frontend/src/components/fitness/NutritionRecipeLibrary.jsx','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');

test('44/51 persists recipes, real day horizon, portions, preparation and explicit alternatives',()=>{
  const sql=migration();
  for(const token of ['GymRecipe','GymRecipeItem','GymMealAlternative','durationDays','dayIndex','recipeId','servings','preparation']) assert.ok(sql.includes(token),token);
  assert.match(sql,/durationDays" IN \(7,14,28\)/);
  assert.doesNotMatch(sql,/allerg|intoler|preference|micronutrient|adherence/i);
});

test('44/51 backend validates complete plans against 7 14 28 day horizons',()=>{
  const source=routes();
  for(const token of ['recipeSchema','completeNutritionSchema','durationDays','dayIndex','alternatives','recipeId','servings','preparation']) assert.ok(source.includes(token),token);
  assert.match(source,/z\.enum\(\['7','14','28'\]\)|z\.union/);
  assert.match(source,/meal\.dayIndex>Number\(value\.durationDays\)/);
  assert.match(source,/Cada comida debe pertenecer al horizonte/);
});

test('44/51 recipe and plan writes revalidate tenant authorities in one transaction',()=>{
  const source=routes();
  for(const token of ["router.get('/gym/recipes'","router.post('/gym/recipes'","GymRecipeItem",'prisma.$transaction','Los ingredientes de la receta deben estar activos y pertenecer al tenant.','Las recetas del plan deben estar activas y pertenecer al tenant.']) assert.ok(source.includes(token),token);
});

test('44/51 shopping list is derived read-only from primary meals and recipe/direct ingredients',()=>{
  const source=routes();
  assert.match(source,/router\.get\('\/gym\/nutrition\/:id\/shopping-list'/);
  assert.match(source,/shoppingList/);
  assert.match(source,/GymRecipeItem/);
  assert.match(source,/GymMealItem/);
  assert.doesNotMatch(source.slice(source.indexOf("router.get('/gym/nutrition/:id/shopping-list'"),source.indexOf("router.get('/gym/classes'")),/INSERT INTO|UPDATE public|DELETE FROM/);
});

test('44/51 UI supports recipes, 7 14 28 days, portions, preparation, alternatives and shopping list',()=>{
  const source=builder()+recipes();
  for(const token of ['7 días','14 días','28 días','Día','Porciones','Preparación','Alternativas','Lista de compras','Receta','Agregar comida']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML|document\./);
});

test('44/51 integration has one complete-plan owner and defers 45-47',()=>{
  const ui=page();
  const svc=service();
  assert.equal((ui.match(/<CompleteMealPlanBuilder/g)||[]).length,1);
  for(const token of ['recipes(','createRecipe(','shoppingList(']) assert.ok(svc.includes(token),token);
  assert.doesNotMatch(builder()+recipes(),/alergia|intolerancia|micronutriente|adherencia/i);
});
