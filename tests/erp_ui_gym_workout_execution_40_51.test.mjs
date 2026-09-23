import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('40/51 persists canonical workout sessions and sets',()=>{
  const migration=read('backend/prisma/migrations/20260923175500_gym_workout_execution_40_51/migration.sql');
  for(const token of ['GymWorkoutSession','GymWorkoutSet','in_progress','completed','skipped','routineExerciseId','loadKg','reps','rir','rpe','restSeconds']) assert.ok(migration.includes(token),token);
  assert.match(migration,/one_active_member_unique/);
  assert.match(migration,/session_exercise_set_unique/);
});

test('40/51 backend validates RIR RPE and completed versus skipped sets',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['workoutSetSchema','workoutSessionSchema','RIR y RPE no son coherentes','Las series realizadas requieren repeticiones','completed','skipped']) assert.ok(routes.includes(token),token);
});

test('40/51 session start and set writes are tenant safe and serialized',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of [
    "router.post('/gym/workout-sessions'",
    "router.post('/gym/workout-sessions/:id/sets'",
    "router.post('/gym/workout-sessions/:id/complete'",
    'pg_advisory_xact_lock',
    'FOR UPDATE OF s',
    'La rutina no pertenece al tenant activo.',
    'El ejercicio no pertenece a la rutina de esta sesión.',
    'La sesión ya está completada.'
  ]) assert.ok(routes.includes(token),token);
});

test('40/51 UI logs completed and skipped sets with a declarative rest timer',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  assert.equal((page.match(/<WorkoutSessionPanel/g)||[]).length,1);
  const panel=read('frontend/src/components/fitness/WorkoutSessionPanel.jsx');
  for(const token of ['Registrar serie','Omitir serie','Carga realizada','Reps realizadas','RIR','RPE','Descanso tras serie','Temporizador de descanso','Completar sesión']) assert.ok(panel.includes(token),token);
  assert.match(panel,/setInterval/);
  assert.match(panel,/clearInterval/);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
});

test('40/51 exposes canonical frontend service methods',()=>{
  const service=read('frontend/src/services/verticalService.js');
  for(const token of ['workoutSessions','startWorkoutSession','recordWorkoutSet','completeWorkoutSession']) assert.ok(service.includes(token),token);
});

test('40/51 does not pre-implement history/performance analytics from 41/51',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const start=routes.indexOf("router.get('/gym/workout-sessions'");
  const end=routes.indexOf("router.get('/gym/routines'",start);
  const block=routes.slice(start,end);
  assert.doesNotMatch(block,/personalRecord|estimated1RM|e1RM|adherence|volumeBy|performanceChart/);
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['GymWorkoutSession','WorkoutSessionPanel','workout execution 40']) assert.ok(audit.includes(token),token);
});
