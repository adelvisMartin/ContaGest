import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('42/51 persists prescribed versus actually performed exercise provenance',()=>{
  const migration=read('backend/prisma/migrations/20260923182500_gym_contextual_substitutions_42_51/migration.sql');
  assert.match(migration,/performedExerciseId/);
  assert.match(migration,/substitutionReason/);
  assert.match(migration,/GymExercise/);
});

test('42/51 suggestion engine uses only declared non-medical context',()=>{
  const routes=gymBackendSource();
  for(const token of ['exerciseSubstitutionSchema','availableEquipment','preferredExerciseIds','excludedExerciseIds','declaredLimitations','humanReviewRequired','limitationsApplied:false']) assert.ok(routes.includes(token),token);
  assert.match(routes,/router\.post\('\/gym\/exercise-substitutions\/suggest'/);
  assert.match(routes,/same_muscle_group/);
  assert.match(routes,/preferred_exercise/);
  assert.match(routes,/equipment_match/);
});

test('42/51 fails closed when a declared limitation would require health interpretation',()=>{
  const routes=gymBackendSource();
  assert.match(routes,/b\.declaredLimitations\.length>0/);
  assert.match(routes,/suggestions:\[\]/);
  assert.match(routes,/healthAutomationBlocked:true/);
  assert.match(routes,/contextInsufficient:true/);
  assert.doesNotMatch(routes,/diagnos|injuryScore|medicalRisk|contraindicationEngine/i);
});

test('42/51 workout set write revalidates actual substitute in same tenant and muscle group',()=>{
  const routes=gymBackendSource();
  for(const token of ['performedExerciseId','substitutionReason','El ejercicio sustituto no pertenece al tenant activo.','El ejercicio sustituto debe conservar el mismo grupo muscular.']) assert.ok(routes.includes(token),token);
});

test('42/51 performance analytics attributes work to performed exercise when substituted',()=>{
  const routes=gymBackendSource();
  assert.match(routes,/COALESCE\(ws\."performedExerciseId",re\."exerciseId"\)/);
});

test('42/51 UI keeps substitutions explicit and never auto-applies a suggestion',()=>{
  const workout=read('frontend/src/components/fitness/WorkoutSessionPanel.jsx');
  assert.equal((workout.match(/<ExerciseSubstitutionPanel/g)||[]).length,1);
  const panel=read('frontend/src/components/fitness/ExerciseSubstitutionPanel.jsx');
  for(const token of ['Equipamiento disponible','Ejercicio preferido','Ejercicio a excluir','Limitación declarada','Revisión humana requerida','Usar en esta sesión','Volver al prescrito']) assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/useEffect\([\s\S]{0,250}onSelect\?\.\(\{id:/);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
});

test('42/51 stays out of nutrition model 43/51',()=>{
  const routes=gymBackendSource();
  const start=routes.indexOf("router.post('/gym/exercise-substitutions/suggest'");
  const end=routes.indexOf("router.get('/gym/routines'",start);
  const block=routes.slice(start,end);
  assert.doesNotMatch(block,/ingredient|recipe|macronutrient|micronutrient|mealPlan/i);
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['ExerciseSubstitutionPanel','performedExerciseId','contextual substitutions 42']) assert.ok(audit.includes(token),token);
});
