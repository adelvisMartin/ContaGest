import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('37/51 defines explicit per-exercise intensity techniques separately from training mode',()=>{
  const catalog=read('frontend/src/data/fitnessIntensityTechniques.js');
  for(const token of ['standard','drop_set','rest_pause','myo_reps','cluster','superset','giant_set','mechanical_drop','isometric_hold']) assert.ok(catalog.includes(token),token);
  assert.match(catalog,/Técnica estándar/);
  assert.match(catalog,/Drop set/);
  assert.match(catalog,/Rest-pause/);
});

test('37/51 routine exercise schema validates technique and structured config',()=>{
  const backend=read('backend/src/modules/verticals/gym.routes.ts');
  for(const token of ['intensityTechnique','techniqueConfig','rounds','intraRestSeconds','loadDropPct','groupKey','techniqueNotes']) assert.ok(backend.includes(token),token);
  assert.match(backend,/drop_set/);
  assert.match(backend,/superset/);
  assert.match(backend,/giant_set/);
  assert.match(backend,/La técnica drop set requiere un porcentaje de reducción de carga/);
  assert.match(backend,/requiere una clave de grupo/);
});

test('37/51 persistence adds technique fields without rewriting legacy exercise prescriptions',()=>{
  const migration=read('backend/prisma/migrations/20260923163000_gym_intensity_techniques_37_51/migration.sql');
  assert.match(migration,/ADD COLUMN IF NOT EXISTS "intensityTechnique"/);
  assert.match(migration,/DEFAULT 'standard'/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS "techniqueConfig" jsonb/);
  const backend=read('backend/src/modules/verticals/gym.routes.ts');
  assert.match(backend,/"intensityTechnique","techniqueConfig"/);
  assert.match(backend,/JSON\.stringify\(item\.techniqueConfig/);
});

test('37/51 RoutineBuilder exposes explicit technique controls but training mode never auto-selects them',()=>{
  const builder=read('frontend/src/components/fitness/RoutineBuilder.jsx');
  for(const token of ['FITNESS_INTENSITY_TECHNIQUES','intensityTechnique','techniqueConfig','Técnica de intensidad','Rondas','Descanso intra-técnica','Reducción de carga','Clave de grupo','Notas de técnica']) assert.ok(builder.includes(token),token);
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  assert.doesNotMatch(page,/trainingMode[\s\S]{0,300}intensityTechnique\s*:/);
  assert.doesNotMatch(builder,/trainingMode/);
});

test('37/51 Wave A audit fails closed on intensity-technique regression',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['fitnessIntensityTechniques.js','intensityTechnique','techniqueConfig','Técnica de intensidad','structured intensity technique']) assert.ok(audit.includes(token),token);
});


test('37/51 grouped techniques enforce same-day cardinality',()=>{
  const source=backend();
  assert.match(source,/Un superset requiere exactamente 2 ejercicios con la misma clave y día\./);
  assert.match(source,/Un giant set requiere al menos 3 ejercicios con la misma clave y día\./);
  assert.match(source,/no puede mezclar superset y giant set el mismo día/);
  assert.match(source,/const key=\\`\\$\\\{exercise\.dayOfWeek\\\}:\\$\\\{groupKey\\\}\\`/);
});
