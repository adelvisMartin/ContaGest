import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/gym.routes.ts','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/GymManagementPage.jsx','utf8');
const library=()=>fs.readFileSync('frontend/src/components/fitness/ExerciseLibraryPanel.jsx','utf8');
const builder=()=>fs.readFileSync('frontend/src/components/fitness/RoutineBuilder.jsx','utf8');

test('34/51 exposes the existing GymExercise authority as a tenant-scoped library',()=>{
  const source=backend();
  assert.match(source,/exerciseLibrarySchema/);
  assert.match(source,/router\.get\('\/gym\/exercises'/);
  assert.match(source,/router\.post\('\/gym\/exercises'/);
  assert.match(source,/router\.patch\('\/gym\/exercises\/:id'/);
  assert.match(source,/public\."GymExercise"/);
  assert.match(source,/"tenantId"=\$1/);
  for(const token of ['category','muscleGroup','equipment','instructions','mediaUrl','defaultSets','defaultReps','active']) assert.ok(source.includes(token),token);
});

test('34/51 exercise library supports search filters and canonical service wiring',()=>{
  const svc=service();
  const ui=library();
  for(const token of ['exercises(params = {})','createExercise(payload)','updateExercise(id, payload)']) assert.ok(svc.includes(token),token);
  for(const token of ['Buscar ejercicios','Grupo muscular','Equipo','Categoría','Nuevo ejercicio','Editar','Archivar','Reactivar']) assert.ok(ui.includes(token),token);
  assert.match(ui,/GymVerticalService\.exercises\(/);
  assert.match(ui,/GymVerticalService\.createExercise\(/);
  assert.match(ui,/GymVerticalService\.updateExercise\(/);
});

test('34/51 library is declarative and exposes loading error empty disabled states',()=>{
  const source=library();
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML|document\./);
  for(const token of ['loading','error','CgEmptyState','disabled','Reintentar']) assert.ok(source.includes(token),token);
});

test('34/51 RoutineBuilder consumes persisted exercise ids and defaults when available',()=>{
  const source=builder();
  assert.match(source,/catalog=\[\]/);
  assert.match(source,/exerciseId:selected\.id/);
  assert.match(source,/defaultSets/);
  assert.match(source,/defaultReps/);
  assert.match(source,/persistedCatalog/);
});

test('34/51 Gym page composes one library owner and passes canonical catalog into builder',()=>{
  const source=page();
  assert.equal((source.match(/<ExerciseLibraryPanel/g)||[]).length,1);
  assert.match(source,/exerciseLibrary/);
  assert.match(source,/catalog=\{exerciseLibrary\}/);
  assert.doesNotMatch(source,/fetch\(.+gym\/exercises/);
});
