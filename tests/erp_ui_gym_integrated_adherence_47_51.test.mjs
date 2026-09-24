import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('47/51 persists meal adherence as append-only events',()=>{
  const migration=read('backend/prisma/migrations/20260923222000_gym_integrated_adherence_47_51/migration.sql');
  for(const token of ['GymMealAdherenceEvent','memberId','nutritionPlanId','mealId','completed','skipped','recordedAt']) assert.ok(migration.includes(token),token);
  assert.doesNotMatch(migration,/UNIQUE[^;]*mealId/i);
  assert.doesNotMatch(migration,/consumedCalories|diagnosis|recommendation/i);
});

test('47/51 adherence owners remain singletons after branch reconciliation',()=>{
  const backend=read('backend/src/modules/verticals/gym.routes.ts');
  const service=read('frontend/src/services/verticalService.js');
  assert.equal((backend.match(/const mealAdherenceSchema=/g)||[]).length,1);
  assert.equal((backend.match(/router\.get\('\/gym\/adherence'/g)||[]).length,1);
  assert.equal((backend.match(/router\.post\('\/gym\/adherence\/meals'/g)||[]).length,1);
  assert.equal((service.match(/adherence\(memberId\)/g)||[]).length,1);
  assert.equal((service.match(/recordMealAdherence\(payload\)/g)||[]).length,1);
});

test('47/51 record endpoint revalidates tenant plan member and meal ownership',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ["router.post('/gym/adherence/meals'","mealAdherenceSchema",'GymNutritionPlan','GymMeal','GymMealAdherenceEvent','gym-meal-adherence-47:']) assert.ok(source.includes(token),token);
  assert.match(source,/"tenantId"=\$1 AND "id"=\$2 AND "memberId"=\$3/);
  assert.match(source,/"tenantId"=\$1 AND "id"=\$2 AND "nutritionPlanId"=\$3/);
  assert.doesNotMatch(source,/UPDATE public\."GymMealAdherenceEvent"|DELETE FROM public\."GymMealAdherenceEvent"/);
});

test('47/51 blocks future meals and plans without a temporal anchor',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  assert.match(source,/El plan necesita fecha de inicio para registrar adherencia temporal/);
  assert.match(source,/No se puede registrar adherencia de una comida futura/);
  assert.match(source,/plannedDate\.setUTCDate/);
});

test('47/51 integrated summary derives training and body evolution from canonical existing authorities',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.get('/gym/adherence'");
  const end=source.indexOf("router.post('/gym/adherence/meals'",start);
  const block=source.slice(start,end);
  for(const token of ['GymMealAdherenceEvent','GymWorkoutSession','GymAssessment','nutritionCompletionStreakDays','trainingCompletedSessions','weightDeltaKg']) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/INSERT INTO public\."GymWorkout|INSERT INTO public\."GymAssessment|UPDATE public\."GymWorkout|UPDATE public\."GymAssessment/);
});

test('47/51 nutrition adherence compares planned meals with latest explicit event only',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  assert.match(source,/DISTINCT ON \(e\."mealId"\)/);
  assert.match(source,/ORDER BY e\."mealId",e\."recordedAt" DESC,e\."id" DESC/);
  for(const token of ['plannedMeals','dueMeals','completedMeals','skippedMeals','pendingMeals','adherencePct']) assert.ok(source.includes(token),token);
});

test('47/51 UI logs complete or skipped and exposes integrated evolution',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const panel=read('frontend/src/components/fitness/IntegratedAdherencePanel.jsx');
  assert.equal((page.match(/<IntegratedAdherencePanel/g)||[]).length,1);
  for(const token of ['Adherencia integral','Completada','Omitida','Racha nutricional','Sesiones completadas','Evolución corporal','Marcar completada','Marcar omitida']) assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
});

test('47/51 service owns canonical adherence endpoints',()=>{
  const service=read('frontend/src/services/verticalService.js');
  assert.match(service,/adherence\(memberId\)/);
  assert.match(service,/recordMealAdherence\(payload\)/);
  assert.match(service,/\/verticals\/gym\/adherence/);
  assert.match(service,/\/api\/v1\/verticals\/gym\/adherence\/meals/);
});

test('47/51 adherence owner does not infer clinical restrictions or auto-adjust plans',()=>{
  const backend=read('backend/src/modules/verticals/gym.routes.ts');
  const start=backend.indexOf("router.get('/gym/adherence'");
  const end=backend.indexOf("router.get('/gym/classes'",start);
  const block=backend.slice(start,end);
  const panel=read('frontend/src/components/fitness/IntegratedAdherencePanel.jsx');
  assert.ok(start>=0&&end>start,'adherence route boundary');
  assert.doesNotMatch(block+panel,/autoAdjust|autoRecommend|inferAllerg|inferDiagnos|prescribe(?:Plan|Routine|Nutrition)|clinicalDecision/i);
});
