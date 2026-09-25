import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('41/51 derives performance from canonical workout session and set authorities',()=>{
  const routes=gymBackendSource();
  assert.match(routes,/router\.get\('\/gym\/performance'/);
  for(const token of ['GymWorkoutSession','GymWorkoutSet','GymRoutineExercise','GymExercise']) assert.ok(routes.includes(token),token);
  assert.match(routes,/s\."status"='completed'/);
  const start=routes.indexOf("router.get('/gym/performance'");
  const end=routes.indexOf("router.get('/gym/routines'",start);
  const block=routes.slice(start,end);
  assert.doesNotMatch(block,/INSERT INTO|UPDATE public|DELETE FROM/);
});

test('41/51 calculates volume frequency set adherence and PRs',()=>{
  const routes=gymBackendSource();
  for(const token of ['totalVolume','sessionsPerWeek','setAdherencePct','plannedSets','maxLoadKg','maxReps','trainingDays']) assert.ok(routes.includes(token),token);
});

test('41/51 e1RM uses explicit Epley estimate only for applicable rep ranges',()=>{
  const routes=gymBackendSource();
  assert.match(routes,/reps>=1&&reps<=12/);
  assert.match(routes,/load\*\(1\+reps\/30\)/);
  assert.match(routes,/bestEstimated1RmKg/);
});

test('41/51 provides trends by date exercise and muscle group',()=>{
  const routes=gymBackendSource();
  for(const token of ['dailyTrend','byExercise','byMuscleGroup','muscleGroup','exerciseName']) assert.ok(routes.includes(token),token);
});

test('41/51 UI renders one declarative history owner with period filters and charts',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  assert.equal((page.match(/<PerformanceHistoryPanel/g)||[]).length,1);
  const panel=read('frontend/src/components/fitness/PerformanceHistoryPanel.jsx');
  for(const token of ['Aplicar período','PR carga','PR reps','e1RM','Volumen por día','Volumen por grupo muscular','Gráfica']) assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
});

test('41/51 does not pre-implement contextual substitutions from 42/51',()=>{
  const routes=gymBackendSource();
  const start=routes.indexOf("router.get('/gym/performance'");
  const end=routes.indexOf("router.get('/gym/routines'",start);
  const block=routes.slice(start,end);
  assert.doesNotMatch(block,/substitute|replacementExercise|alternativeExercise/);
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['PerformanceHistoryPanel','bestEstimated1RmKg','performance history 41']) assert.ok(audit.includes(token),token);
});
