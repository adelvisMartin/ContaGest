import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { veterinaryBackendSource, veterinaryWorkspaceSource } from '../qa/support/vertical-authority-sources.mjs';
const read=(path)=>fs.readFileSync(path,'utf8');

test('32/51 persists optional boarding settings, resources and stays without replacing hospitalization',()=>{
  const sql=read('backend/prisma/migrations/20260923141000_veterinary_boarding_resources_v3251/migration.sql');
  for(const token of ['VeterinaryBoardingSetting','VeterinaryBoardingResource','VeterinaryBoardingStay','VeterinaryBoardingResource_tenant_code_unique','VeterinaryBoardingStay_window_check','ENABLE ROW LEVEL SECURITY','REVOKE ALL'])assert.ok(sql.includes(token),token);
  assert.doesNotMatch(sql,/ALTER TABLE public\."CareHospitalization"/);
});

test('32/51 boarding is explicitly optional and admin-gated at tenant setting boundary',()=>{
  const source=veterinaryBackendSource();
  assert.match(source,/router\.get\('\/boarding\/settings'/);
  assert.match(source,/router\.patch\('\/boarding\/settings', requirePermission\('admin\.manage'\)/);
  assert.match(source,/assertBoardingEnabled/);
  assert.match(source,/módulo opcional de estancia veterinaria no está habilitado/i);
  assert.match(source,/No se puede desactivar estancia mientras existan reservas o ingresos activos/);
});

test('32/51 availability is derived from overlapping active stays and resource state',()=>{
  const source=veterinaryBackendSource();
  for(const token of ["router.get('/boarding/resources'","status\" IN ('reserved','checked_in')",'"startsAt" < $3::timestamptz','COALESCE(s."endedAt",s."plannedEndsAt") > $2::timestamptz',"available:resource.status==='active'&&!occupancy"])assert.ok(source.includes(token),token);
});

test('32/51 reservations serialize resource and patient conflict checks',()=>{
  const source=veterinaryBackendSource();
  const start=source.indexOf("router.post('/boarding/stays'");
  const end=source.indexOf("router.patch('/boarding/stays/:id/status'",start);
  const block=source.slice(start,end);
  assert.match(block,/pg_advisory_xact_lock/);
  assert.match(block,/veterinary-boarding-resource/);
  assert.match(block,/veterinary-boarding-patient/);
  assert.match(block,/recurso ya tiene una estancia solapada/i);
  assert.match(block,/mascota ya tiene una estancia solapada/i);
  assert.match(block,/kind"='animal'/);
});

test('32/51 stay lifecycle is forward-only and releases occupancy on terminal state',()=>{
  const source=veterinaryBackendSource();
  const start=source.indexOf("router.patch('/boarding/stays/:id/status'");
  const block=source.slice(start);
  assert.match(block,/reserved:\['checked_in','cancelled'\]/);
  assert.match(block,/checked_in:\['completed','cancelled'\]/);
  assert.match(block,/completed:\[\],cancelled:\[\]/);
  assert.match(block,/endedAt/);
  assert.match(block,/La reserva venció/);
  assert.match(block,/otra estancia solapada/);
  assert.match(block,/fecha de cierre no puede ser anterior/i);
});

test('32/51 UI has one declarative boarding owner with optional-state and availability UX',()=>{
  const workspace=veterinaryWorkspaceSource();
  const panel=read('frontend/src/components/veterinary/VeterinaryBoardingPanel.jsx');
  const service=read('frontend/src/services/verticalService.js');
  assert.equal((workspace.match(/import \{ VeterinaryBoardingPanel \}/g)||[]).length,1);
  assert.equal((workspace.match(/<VeterinaryBoardingPanel/g)||[]).length,1);
  assert.match(workspace,/\['boarding', 'Estancia'/);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
  for(const token of ['Boarding / estancia opcional','Activar módulo opcional','Ventana de disponibilidad','Nuevo recurso','Reservar estancia','Registrar ingreso','Finalizar estancia','No sustituye Hospitalización'])assert.ok(panel.includes(token),token);
  for(const token of ['boardingSettings','updateBoardingSettings','boardingResources','createBoardingResource','updateBoardingResourceStatus','boardingStays','createBoardingStay','transitionBoardingStay'])assert.ok(service.includes(token),token);
});

test('32/51 audit preserves non-clinical boundary and no automated boarding decisions',()=>{
  const source=veterinaryBackendSource();
  const panel=read('frontend/src/components/veterinary/VeterinaryBoardingPanel.jsx');
  assert.match(source,/veterinary\.boarding\.resource\.created/);
  assert.match(source,/veterinary\.boarding\.stay\.reserved/);
  assert.match(source,/veterinary\.boarding\.stay\.status_changed/);
  assert.doesNotMatch(panel,/autoAssign|recommendedResource|recommendResource|autoSelect/);
});
