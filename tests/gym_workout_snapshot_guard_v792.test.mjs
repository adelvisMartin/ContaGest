import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../backend/src/modules/verticals/gym-training.routes.ts',import.meta.url),'utf8');
const start=source.split("router.post('/gym/workout-sessions'")[1]
  .split("router.get('/gym/workout-sessions/:id/transitions'")[0];
const sets=source.split("router.post('/gym/workout-sessions/:id/sets'")[1]
  .split("router.post('/gym/workout-sessions/:id/complete'")[0];

test('#792 server snapshot captures immutable exercise identity and muscle group at session start',()=>{
  assert.match(start,/re\."id",re\."routineId",re\."exerciseId"/);
  assert.match(start,/AS "exerciseName",e\."muscleGroup"/);
  assert.match(start,/JSON\.stringify\(prescription\)/);
  assert.match(start,/programSnapshot/);
});

test('#792 performed sets cannot reinterpret mutable routine or bypass original prescription',()=>{
  assert.match(sets,/Array\.isArray\(session\.routineSnapshot\)/);
  assert.match(sets,/entry\.id===b\.routineExerciseId&&entry\.routineId===session\.routineId/);
  assert.match(sets,/if\(snapshot&&!prescribedSnapshot\)/);
  assert.match(sets,/prescribedSnapshot\.exerciseId!==prescribedExercise\.exerciseId/);
  assert.match(sets,/Object\.hasOwn\(prescribedSnapshot,'muscleGroup'\)/);
  const read=sets.indexOf('const snapshot=Array.isArray(session.routineSnapshot)');
  const guard=sets.indexOf('prescribedSnapshot.exerciseId!==prescribedExercise.exerciseId');
  const write=sets.indexOf('INSERT INTO public."GymWorkoutSet"');
  assert.ok(read>0&&guard>read&&write>guard,'snapshot must guard the write');
});

test('#792 duplicate-set check is explicitly scoped to the authenticated tenant',()=>{
  assert.match(sets,/WHERE "tenantId"=\$4 AND "sessionId"=\$1 AND "routineExerciseId"=\$2 AND "setNumber"=\$3/);
  assert.match(sets,/session\.id,b\.routineExerciseId,b\.setNumber,tenantId/);
});
