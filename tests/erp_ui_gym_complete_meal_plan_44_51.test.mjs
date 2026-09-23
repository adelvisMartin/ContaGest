import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('44/51 persists canonical weekly meal positions without rewriting legacy rows',()=>{
  const migration=read('backend/prisma/migrations/20260923190000_gym_complete_meal_plan_44_51/migration.sql');
  for(const token of ['dayOfWeek','sortOrder','GymMeal_dayOfWeek_check','GymMeal_sortOrder_check','GymMeal_plan_day_order_unique','NULL preserves legacy meals']) assert.ok(migration.includes(token),token);
  assert.match(migration,/BETWEEN 1 AND 7/);
  assert.match(migration,/WHERE "dayOfWeek" IS NOT NULL/);
});

test('44/51 validates plan validity and unique meal order per weekday',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['nutritionMealSchema','dayOfWeek','sortOrder','Cada comida debe tener una posición única dentro de su día.','La vigencia del plan no puede finalizar antes de comenzar.']) assert.ok(source.includes(token),token);
  assert.match(source,/ORDER BY m\."dayOfWeek" NULLS LAST,m\."sortOrder"/);
  assert.match(source,/meal\.dayOfWeek,meal\.sortOrder,meal\.mealType/);
});

test('44/51 UI renders all canonical weekdays and structured meal ordering',()=>{
  const builder=read('frontend/src/components/fitness/NutritionMealBuilder.jsx');
  assert.match(builder,/FITNESS_WEEK_DAYS/);
  for(const token of ['Plan alimenticio semanal','Agregar comida','Día sin comidas programadas','Subir','Bajar','Duplicar','normalizeOrders']) assert.ok(builder.includes(token),token);
  assert.doesNotMatch(builder,/querySelector|addEventListener|innerHTML|document\./);
});

test('44/51 page wires plan dates and scheduled meal fields',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  for(const token of ['Inicio del plan','Fin del plan','dayOfWeek:Number(meal.dayOfWeek)','sortOrder:Number(meal.sortOrder)','días programados']) assert.ok(page.includes(token),token);
  assert.doesNotMatch(page,/mealLines|Tipo \| kcal \| alimentos/);
});

test('44/51 does not pre-implement restrictions preferences nutrients or adherence',()=>{
  const migration=read('backend/prisma/migrations/20260923190000_gym_complete_meal_plan_44_51/migration.sql');
  const builder=read('frontend/src/components/fitness/NutritionMealBuilder.jsx');
  assert.doesNotMatch(migration+builder,/restriction|allerg|preference|vegan|vegetarian|gluten|micronutrient|vitamin|mineral|adherence/i);
});

test('44/51 Wave A fails closed on weekly meal-plan regression',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['complete meal plan 44','GymMeal_plan_day_order_unique','weekly order']) assert.ok(audit.includes(token),token);
});
