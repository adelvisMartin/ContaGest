import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('39/51 persists reusable templates and immutable versioned programs',()=>{
  const migration=read('backend/prisma/migrations/20260923172500_gym_periodization_39_51/migration.sql');
  for(const token of ['GymPeriodizationTemplate','GymPeriodizationProgram','programKey','version','structure','sourceTemplateId','supersedesId']) assert.ok(migration.includes(token),token);
  assert.match(migration,/tenant_key_version_unique/);
});

test('39/51 validates mesocycles with explicit load and deload weeks',()=>{
  const routes=gymBackendSource();
  for(const token of ['periodizationStructureSchema','accumulation','intensification','realization','deload','weekType','volumePct','intensityPct']) assert.ok(routes.includes(token),token);
  assert.match(routes,/z\.enum\(\['load','deload'\]\)/);
});

test('39/51 creates versions without mutating historical program rows',()=>{
  const routes=gymBackendSource();
  assert.match(routes,/router\.post\('\/gym\/periodization\/programs\/:id\/version'/);
  assert.match(routes,/pg_advisory_xact_lock/);
  assert.match(routes,/MAX\("version"\)/);
  assert.match(routes,/Solo la versión más reciente puede generar una nueva revisión/);
  assert.match(routes,/"supersedesId"/);
  assert.doesNotMatch(routes,/UPDATE public\."GymPeriodizationProgram"/);
  assert.doesNotMatch(routes,/DELETE FROM public\."GymPeriodizationProgram"/);
});

test('39/51 enforces tenant ownership for routine and template provenance',()=>{
  const routes=gymBackendSource();
  assert.match(routes,/La rutina no pertenece al tenant activo/);
  assert.match(routes,/La plantilla no pertenece al tenant activo/);
  assert.match(routes,/WHERE "tenantId"=\$1 AND "id"=\$2/);
});

test('39/51 UI composes one declarative periodization owner with templates and version action',()=>{
  const page=read('frontend/src/pages/GymManagementPage.jsx');
  assert.equal((page.match(/<PeriodizationPanel/g)||[]).length,1);
  const panel=read('frontend/src/components/fitness/PeriodizationPanel.jsx');
  const builder=read('frontend/src/components/fitness/PeriodizationBuilder.jsx');
  for(const token of ['Plantillas','Nueva versión','Historial de versiones','PeriodizationBuilder','latestVersionByKey']) assert.ok(panel.includes(token),token);
  for(const token of ['Mesociclo','Carga','Descarga','Volumen objetivo','Intensidad objetivo']) assert.ok(builder.includes(token),token);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
  assert.doesNotMatch(builder,/querySelector|addEventListener|innerHTML|document\./);
});

test('39/51 keeps periodization authority separate from workout execution',()=>{
  const migration=read('backend/prisma/migrations/20260923172500_gym_periodization_39_51/migration.sql');
  const panel=read('frontend/src/components/fitness/PeriodizationPanel.jsx');
  assert.doesNotMatch(migration,/GymWorkoutSession|GymWorkoutSet/);
  assert.doesNotMatch(panel,/startWorkoutSession|recordWorkoutSet|completeWorkoutSession/);
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['GymPeriodizationProgram','PeriodizationPanel','periodization 39']) assert.ok(audit.includes(token),token);
});
