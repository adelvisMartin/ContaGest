import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes=readFileSync(new URL('../backend/src/modules/verticals/gym-training.routes.ts',import.meta.url),'utf8');
const auditor=readFileSync(new URL('../scripts/erp-ui-wave-a-audit-v251.mjs',import.meta.url),'utf8');

const workoutMarker="router.get('/gym/workout-sessions'";
const performanceMarker="router.get('/gym/performance'";
const substitutionMarker="router.post('/gym/exercise-substitutions/suggest'";
const routinesMarker="router.get('/gym/routines'";
const workoutForbidden=/personalRecord|estimated1RM|e1RM|adherence|volumeBy|performanceChart/;
const performanceWrites=/INSERT INTO|UPDATE public|DELETE FROM/;
const performanceSubstitutions=/substitute|replacementExercise|alternativeExercise/;

function stageBetween(first,next){
  const start=routes.indexOf(first);
  const end=routes.indexOf(next,start);
  assert.ok(start>=0,`Missing stage start: ${first}`);
  assert.ok(end>start,`Missing next stage marker after ${first}: ${next}`);
  return routes.slice(start,end);
}

test('Workout execution 40 audit ends at performance 41 rather than routines',()=>{
  assert.ok(auditor.includes(`const workoutEnd=gymRoutes.indexOf("${performanceMarker}",workoutStart);`));
  const workout=stageBetween(workoutMarker,performanceMarker);
  assert.doesNotMatch(workout,workoutForbidden);
  assert.match(`${workout}\nconst personalRecord = true;`,workoutForbidden);
});

test('Performance 41 audit ends at substitution 42 and remains read-only',()=>{
  assert.ok(auditor.includes(`const performanceEnd=gymRoutes.indexOf("${substitutionMarker}",performanceStart);`));
  const performance=stageBetween(performanceMarker,substitutionMarker);
  assert.doesNotMatch(performance,performanceWrites);
  assert.doesNotMatch(performance,performanceSubstitutions);
  assert.match(`${performance}\nUPDATE public."GymWorkoutSet" SET "loadKg"=10;`,performanceWrites);
  assert.match(`${performance}\nconst replacementExercise = 'unsafe';`,performanceSubstitutions);
});

test('Stage 42 is present before routine routes, without weakening its own tests',()=>{
  const substitution=stageBetween(substitutionMarker,routinesMarker);
  assert.ok(substitution.length>0);
  assert.ok(auditor.includes("fitness: performance history 41 must not pre-implement contextual substitutions 42"));
});
