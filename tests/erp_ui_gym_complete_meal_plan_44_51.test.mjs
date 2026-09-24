import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('44/51 persists week-safe 7/14/28-day plans, recipes and alternatives',()=>{
  const weekly=read('backend/prisma/migrations/20260923190000_gym_complete_meal_plan_44_51/migration.sql');
  const complete=read('backend/prisma/migrations/20260923193000_gym_complete_meal_plan_44_51/migration.sql');
  for(const token of ['GymMeal_dayOfWeek_check','GymMeal_sortOrder_check','NULL preserves legacy meals']) assert.ok(weekly.includes(token),token);
  for(const token of ['GymRecipe','GymRecipeItem','GymMealAlternative','durationDays','dayIndex','recipeId','servings','preparation','GymMeal_plan_dayIndex_order_unique','GymMealAlternative_servings_positive']) assert.ok(complete.includes(token),token);
  assert.match(complete,/durationDays" IN \(7,14,28\)/);
  assert.match(complete,/DROP INDEX IF EXISTS public\."GymMeal_plan_day_order_unique"/);
});

test('44/51 backend validates horizons, exclusive meal authorities and tenant-owned recipes',()=>{
  const source=gymBackendSource();
  for(const token of ['recipeSchema','completeNutritionSchema','meal.dayIndex>Number(value.durationDays)','Cada comida debe pertenecer al horizonte configurado del plan.','Una comida con receta principal no puede mezclar ingredientes directos.','Las recetas del plan deben estar activas y pertenecer al tenant.']) assert.ok(source.includes(token),token);
  assert.match(source,/ORDER BY m\."dayIndex" NULLS LAST,m\."sortOrder",m\."dayOfWeek" NULLS LAST/);
  assert.match(source,/prisma\.\$transaction/);
});

test('44/51 recipe writes validate tenant ingredients atomically',()=>{
  const source=gymBackendSource();
  for(const token of ["router.get('/gym/recipes'","router.post('/gym/recipes'",'GymRecipeItem','pg_advisory_xact_lock','Los ingredientes de la receta deben estar activos y pertenecer al tenant.']) assert.ok(source.includes(token),token);
});

test('44/51 shopping list is read-only and excludes alternatives from purchasing totals',()=>{
  const source=gymBackendSource();
  const start=source.indexOf("router.get('/gym/nutrition/:id/shopping-list'");
  const end=source.indexOf("router.get('/gym/adherence'",start);
  const block=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  for(const token of ['shoppingList','GymRecipeItem','GymMealItem']) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/GymMealAlternative/);
  assert.doesNotMatch(block,/INSERT INTO|UPDATE public|DELETE FROM/);
});

test('44/51 UI supports complete plan recipes portions preparation alternatives and shopping list',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const builder=read('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx');
  const recipes=read('frontend/src/components/fitness/NutritionRecipeLibrary.jsx');
  const shopping=read('frontend/src/components/fitness/NutritionShoppingListPanel.jsx');
  assert.equal((page.match(/<CompleteMealPlanBuilder/g)||[]).length,1);
  assert.equal((page.match(/<NutritionRecipeLibrary/g)||[]).length,1);
  assert.equal((page.match(/<NutritionShoppingListPanel/g)||[]).length,1);
  assert.ok(builder.includes('[7,14,28]'),'7/14/28 horizon');
  for(const token of ['Día','Porciones','Preparación','Alternativas','Porciones alternativa','Agregar comida']) assert.ok(builder.includes(token),token);
  for(const token of ['Recetas','Porciones','Preparación']) assert.ok(recipes.includes(token),token);
  assert.ok(shopping.includes('Lista de compras'));
  assert.doesNotMatch(builder+recipes+shopping,/querySelector|addEventListener|innerHTML|document\./);
});

test('44/51 quick generator cannot bypass canonical persistence',()=>{
  const source=read('frontend/src/components/fitness/FitnessProductivityTools.jsx');
  const start=source.indexOf('export function FitnessNutritionQuickTool');
  const end=source.indexOf('export function FitnessClientTransferTool',start);
  const block=source.slice(start,end);
  assert.ok(block.includes('Persistencia estructurada'));
  assert.doesNotMatch(block,/GymVerticalService\.createNutrition\(|FitnessNutritionService\.toApiMeals\(/);
});

test('44/51 meal-plan migration does not own later rules nutrients or adherence persistence',()=>{
  const weekly=read('backend/prisma/migrations/20260923190000_gym_complete_meal_plan_44_51/migration.sql');
  const complete=read('backend/prisma/migrations/20260923193000_gym_complete_meal_plan_44_51/migration.sql');
  const builder=read('frontend/src/components/fitness/CompleteMealPlanBuilder.jsx');
  assert.doesNotMatch(weekly+complete,/GymNutritionRule|GymIngredientNutritionProfile|GymMealAdherenceEvent/);
  assert.doesNotMatch(builder,/createNutritionRule|createIngredientNutritionProfile|recordMealAdherence/);
  assert.ok(read('backend/prisma/migrations/20260923203000_gym_nutrition_rules_45_51/migration.sql').includes('GymNutritionRule'));
  assert.ok(read('backend/prisma/migrations/20260923213000_gym_nutrient_composition_46_51/migration.sql').includes('GymIngredientNutritionProfile'));
  assert.ok(read('backend/prisma/migrations/20260923222000_gym_integrated_adherence_47_51/migration.sql').includes('GymMealAdherenceEvent'));
});

test('44/51 Wave A fails closed on complete-plan regressions',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['complete meal plan 44','CompleteMealPlanBuilder','NutritionRecipeLibrary','NutritionShoppingListPanel','GymMeal_plan_dayIndex_order_unique']) assert.ok(audit.includes(token),token);
});
