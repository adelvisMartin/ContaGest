import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('44/51 preserves weekly order and adds 7 14 28-day complete-plan persistence',()=>{
  const weekly=read('backend/prisma/migrations/20260923190000_gym_complete_meal_plan_44_51/migration.sql');
  const complete=read('backend/prisma/migrations/20260923193000_gym_complete_meal_plan_44_51/migration.sql');
  for(const token of ['GymMeal_dayOfWeek_check','GymMeal_plan_day_order_unique','NULL preserves legacy meals']) assert.ok(weekly.includes(token),token);
  for(const token of ['GymRecipe','GymRecipeItem','GymMealAlternative','durationDays','dayIndex','recipeId','servings','preparation']) assert.ok(complete.includes(token),token);
  assert.match(complete,/"durationDays" IN \(7,14,28\)/);
  assert.doesNotMatch(weekly+complete,/allerg|intoler|preference|micronutrient|adherence/i);
});

test('44/51 backend validates horizon weekday positions recipes and alternatives',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['recipeSchema','completeNutritionSchema','nutritionMealSchema','durationDays','dayIndex','dayOfWeek','sortOrder','alternatives','recipeId','servings','preparation']) assert.ok(source.includes(token),token);
  assert.match(source,/meal\.dayIndex>Number\(value\.durationDays\)/);
  assert.match(source,/const expectedDay=\(\(meal\.dayIndex-1\)%7\)\+1/);
  assert.match(source,/Cada comida debe pertenecer al horizonte configurado del plan/);
  assert.match(source,/Cada comida debe tener una posición única dentro de su día/);
});

test('44/51 recipe and plan writes revalidate tenant authorities transactionally',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ["router.get('/gym/recipes'","router.post('/gym/recipes'",'GymRecipeItem','prisma.$transaction','Los ingredientes de la receta deben estar activos y pertenecer al tenant.','Las recetas del plan deben estar activas y pertenecer al tenant.']) assert.ok(source.includes(token),token);
});

test('44/51 shopping list is derived read-only from primary meals',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.get('/gym/nutrition/:id/shopping-list'");
  const end=source.indexOf("router.get('/gym/classes'",start);
  const block=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  for(const token of ['shoppingList','GymRecipeItem','GymMealItem']) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/INSERT INTO|UPDATE public|DELETE FROM/);
});

test('44/51 UI supports recipes horizon portions preparation alternatives and shopping list',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const builder=read('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx');
  const recipes=read('frontend/src/components/fitness/NutritionRecipeLibrary.jsx');
  const shopping=read('frontend/src/components/fitness/NutritionShoppingListPanel.jsx');
  assert.equal((page.match(/<CompleteMealPlanBuilder/g)||[]).length,1);
  assert.equal((page.match(/<NutritionRecipeLibrary/g)||[]).length,1);
  assert.equal((page.match(/<NutritionShoppingListPanel/g)||[]).length,1);
  for(const token of ['7 días','14 días','28 días','Día','Porciones','Preparación','Alternativas','Agregar comida']) assert.ok(builder.includes(token),token);
  for(const token of ['Recetas','Porciones','Preparación','Agregar ingrediente']) assert.ok(recipes.includes(token),token);
  assert.ok(shopping.includes('Lista de compras'));
  assert.doesNotMatch(builder+recipes+shopping,/querySelector|addEventListener|innerHTML|document\./);
});

test('44/51 keeps 45-47 out of scope and Wave A fail-closed',()=>{
  const builder=read('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx');
  const recipes=read('frontend/src/components/fitness/NutritionRecipeLibrary.jsx');
  const migration=read('backend/prisma/migrations/20260923193000_gym_complete_meal_plan_44_51/migration.sql');
  assert.doesNotMatch(builder+recipes+migration,/alergia|intolerancia|preferencia|micronutriente|adherencia/i);
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['complete meal plan 44','GymMealAlternative','shopping list 44']) assert.ok(audit.includes(token),token);
});
