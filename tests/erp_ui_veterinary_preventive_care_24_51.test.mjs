import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const health=()=>fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/VeterinaryClinicPageV1123.jsx','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryPreventiveCarePanel.jsx','utf8');

test('24/51 immunizations expose tenant-scoped reads and ownership-safe writes',()=>{
  const source=health();
  assert.match(source,/router\.get\('\/health\/immunizations'/);
  assert.match(source,/patientId es obligatorio/);
  assert.match(source,/CareImmunization/);
  assert.match(source,/i\."tenantId"=\$1 AND i\."patientId"=\$2/);
  assert.match(source,/El paciente no pertenece al tenant activo/);
  assert.match(source,/El profesional no pertenece al tenant activo/);
});

test('24/51 validates structured deworming/checkup preventive encounters',()=>{
  const source=health();
  for(const token of ['veterinaryPreventiveClinicalDataSchema','preventiveCare','deworming','checkup','nextDueAt','name']) assert.ok(source.includes(token),token);
  assert.match(source,/value\.type\s*===\s*'veterinary-preventive'/);
});

test('24/51 frontend services read immunizations canonically',()=>{
  const source=service();
  assert.match(source,/immunizations\(patientId\)/);
  assert.match(source,/\/verticals\/health\/immunizations/);
});

test('24/51 UI aggregates vaccines deworming controls and upcoming due items',()=>{
  const source=panel();
  for(const token of [
    'Vacunas','Desparasitación','Control preventivo','Próximos vencimientos',
    'preventiveEvents','nextDueAt','Vencido','Próximo','Al día'
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/HealthVerticalService\.createImmunization\(/);
  assert.match(source,/HealthVerticalService\.createEncounter\(/);
});

test('24/51 reminder configuration uses canonical communication log scheduling',()=>{
  const source=panel();
  for(const token of ['Recordatorio','Canal','Anticipación','scheduledAt','preventive_due_reminder']) assert.ok(source.includes(token),token);
  assert.match(source,/VeterinaryService\.createCommunication\(/);
  assert.doesNotMatch(source,/setTimeout|setInterval/);
});

test('24/51 dossier composes one preventive panel and loads immunizations',()=>{
  const source=page();
  assert.equal((source.match(/<VeterinaryPreventiveCarePanel/g)||[]).length,1);
  assert.match(source,/HealthVerticalService\.immunizations\(patientId\)/);
  assert.doesNotMatch(panel(),/querySelector|addEventListener|innerHTML/);
});
