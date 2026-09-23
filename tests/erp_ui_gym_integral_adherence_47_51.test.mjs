import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('47/51 adds only missing adherence authorities and keeps events append-only',()=>{
  const migration=read('backend/prisma/migrations/20260923220000_gym_integral_adherence_47_51/migration.sql');
  for(const token of ['GymMealAdherenceEvent','GymHabit','GymHabitCheckIn','GymAdherenceGoal','GymProgressPhoto']) assert.ok(migration.includes(token),token);
  assert.match(migration,/authorizationConfirmed"=true/);
  assert.doesNotMatch(migration,/streak|points|badge|leaderboard/i);
});

test('47/51 derives workout and body evolution from canonical existing tables',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.get('/gym/adherence'");
  const end=source.indexOf("router.post('/gym/adherence/meals'",start);
  const block=source.slice(start,end);
  for(const token of ['GymWorkoutSession','GymAssessment','GymMealAdherenceEvent','GymHabitCheckIn','GymAdherenceGoal','GymProgressPhoto']) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/INSERT INTO public\."GymWorkoutSession"|INSERT INTO public\."GymAssessment"/);
});

test('47/51 meal adherence validates tenant member plan and meal before appending',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  const start=source.indexOf("router.post('/gym/adherence/meals'");
  const end=source.indexOf("router.post('/gym/adherence/habits'",start);
  const block=source.slice(start,end);
  for(const token of ['GymMeal','GymNutritionPlan','p."memberId"=$4','La comida no pertenece al plan y cliente activos.','INSERT INTO public."GymMealAdherenceEvent"']) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/UPDATE public\."GymMealAdherenceEvent"|DELETE FROM public\."GymMealAdherenceEvent"/);
});

test('47/51 habits are explicit, tenant scoped, archiveable and have append-only check-ins',()=>{
  const source=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of [
    "router.post('/gym/adherence/habits'","router.patch('/gym/adherence/habits/:id'","router.post('/gym/adherence/habits/:id/checkins'",
    'gym-habit-47:','Ese hábito ya existe para el cliente.','GymHabitCheckIn'
  ]) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/router\.delete\('\/gym\/adherence\/habits/);
});

test('47/51 progress photos require explicit authorization and isolated storage paths',()=>{
  const migration=read('backend/prisma/migrations/20260923220000_gym_integral_adherence_47_51/migration.sql');
  const gym=read('backend/src/modules/verticals/gym.routes.ts');
  const media=read('backend/src/modules/media/media.routes.ts');
  for(const token of ['authorizationConfirmed','authorizationConfirmedAt','storagePath']) assert.ok(migration.includes(token),token);
  assert.match(gym,/authorizationConfirmed:z\.literal\(true\)/);
  assert.ok(gym.includes('gym-progress/'));
  assert.ok(media.includes("'gym-progress'"));
  assert.doesNotMatch(gym,/photoUrl|UPDATE public\."GymMember"/);
});

test('47/51 UI covers meals habits goals evolution and authorized photos without imperative DOM',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  const panel=read('frontend/src/components/fitness/FitnessAdherencePanel.jsx');
  assert.equal((page.match(/<FitnessAdherencePanel/g)||[]).length,1);
  for(const token of [
    'Adherencia integral','Registro de comidas','Hábitos','Objetivos y evolución','Mediciones canónicas','Entrenamientos canónicos',
    'Fotos de progreso autorizadas','autorización explícita','gym-progress'
  ]) assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
});

test('47/51 service exposes canonical adherence actions',()=>{
  const service=read('frontend/src/services/verticalService.js');
  for(const token of [
    'adherence(memberId, filters = {})','logMealAdherence(payload)','createHabit(payload)','updateHabit(id, payload)',
    'checkInHabit(id, payload)','createAdherenceGoal(payload)','updateAdherenceGoal(id, payload)','createProgressPhoto(payload)'
  ]) assert.ok(service.includes(token),token);
});

test('47/51 excludes gamification and streak ownership',()=>{
  const migration=read('backend/prisma/migrations/20260923220000_gym_integral_adherence_47_51/migration.sql');
  const panel=read('frontend/src/components/fitness/FitnessAdherencePanel.jsx');
  assert.doesNotMatch(migration,/CREATE TABLE[^;]*(?:streak|badge|leaderboard|points)/i);
  assert.doesNotMatch(panel,/racha|leaderboard|ranking|puntos|insignia/i);
});

test('47/51 Wave A fails closed on adherence regressions',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['integral adherence 47','GymMealAdherenceEvent','GymProgressPhoto','gym-progress','must derive workouts and assessments']) assert.ok(audit.includes(token),token);
});
