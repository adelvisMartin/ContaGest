import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fitnessWorkspaceSource, gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const page=()=>fitnessWorkspaceSource();
const builder=()=>fs.readFileSync('frontend/src/components/fitness/RoutineBuilder.jsx','utf8');
const backend=()=>gymBackendSource();

test('33/51 replaces free-text routine parsing with the reusable structured builder',()=>{
  const source=page();
  assert.match(source,/RoutineBuilder/);
  assert.match(source,/exercises:\s*\[\]/);
  assert.match(source,/const exercises=routineForm\.exercises\.map/);
  assert.match(source,/GymVerticalService\.createRoutine\(\{\.\.\.routineForm,[\s\S]*exercises\}\)/);
  assert.doesNotMatch(source,/exerciseLines/);
  const routineBlock=source.slice(source.indexOf('const submitRoutine'),source.indexOf('const submitNutrition'));
  assert.doesNotMatch(routineBlock,/split\('\n'\)|split\('\|'\)/);
  assert.doesNotMatch(source,/Ejercicios: Día \| Ejercicio \| Grupo \| Series \| Reps \| Descanso/);
});

test('33/51 routine builder exposes structured exercise fields and reusable controlled state',()=>{
  const source=builder();
  for(const token of ['value=[]','onChange','addExercise','removeExercise','updateExercise','dayOfWeek','exerciseName','muscleGroup','equipment','sets','reps','loadKg','restSeconds','tempo','notes']) assert.ok(source.includes(token),token);
  assert.match(source,/FITNESS_EXERCISES/);
  assert.match(source,/FITNESS_MUSCLES/);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML|document\./);
});

test('33/51 builder supports add remove reorder and duplication without changing API authority',()=>{
  const source=builder();
  for(const token of ['Agregar ejercicio','Duplicar','Subir','Bajar','Quitar','moveExercise','duplicateExercise']) assert.ok(source.includes(token),token);
  const ui=page();
  assert.match(ui,/GymVerticalService\.createRoutine\(/);
  assert.doesNotMatch(ui,/RoutineService\.create|fetch\(.+gym\/routines/);
});

test('33/51 routine payload remains compatible with current gym routine schema',()=>{
  const source=page()+builder();
  for(const token of ['dayOfWeek','sortOrder','exerciseName','muscleGroup','equipment','instructions','sets','reps','loadKg','restSeconds','tempo','notes']) assert.ok(source.includes(token),token);
});

test('33/51 has explicit empty and disabled states for routine construction',()=>{
  const source=builder();
  assert.match(source,/CgEmptyState/);
  assert.match(source,/disabled=\{disabled\}/);
  assert.match(source,/disabled=\{disabled\|\|index===0\}/);
});


test('33/51 routine creation is atomic and tenant-scoped',()=>{
  const source=gymBackendSource();
  const start=source.indexOf("router.post('/gym/routines'");
  const end=source.indexOf("router.get('/gym/nutrition'",start);
  const block=source.slice(start,end);
  assert.match(block,/prisma\.\$transaction/);
  for(const token of ['GymMember','GymTrainer','GymExercise','"tenantId"=$1','El cliente no pertenece al tenant activo','El instructor no pertenece al tenant activo','El ejercicio seleccionado no pertenece al tenant activo']) assert.ok(block.includes(token),token);
  assert.match(block,/tx\.\$queryRawUnsafe/);
  assert.match(block,/tx\.\$executeRawUnsafe/);
});


test('33/51 routine creation is atomic and tenant-safe on the backend',()=>{
  const source=backend();
  const block=source.slice(source.indexOf("router.post('/gym/routines'"),source.indexOf("router.get('/gym/nutrition'"));
  assert.match(block,/prisma\.\$transaction/);
  assert.match(block,/GymMember/);
  assert.match(block,/GymTrainer/);
  assert.match(block,/GymExercise/);
  assert.match(block,/El cliente no pertenece al tenant activo/);
  assert.match(block,/El instructor no pertenece al tenant activo/);
  assert.match(block,/El ejercicio seleccionado no pertenece al tenant activo/);
  assert.match(block,/INSERT INTO public\."GymRoutineExercise"/);
});
