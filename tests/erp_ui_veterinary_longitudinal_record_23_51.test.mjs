import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/health.routes.ts','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const page=()=>fs.readFileSync('frontend/src/pages/VeterinaryClinicPageV1123.jsx','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryLongitudinalRecord.jsx','utf8');

test('23/51 exposes tenant-scoped longitudinal measurements',()=>{
  const source=backend();
  assert.match(source,/router\.get\('\/health\/measurements'/);
  assert.match(source,/patientId es obligatorio/);
  assert.match(source,/CareMeasurement/);
  assert.match(source,/"tenantId"=\$1 AND "patientId"=\$2/);
  assert.match(source,/ORDER BY "measuredAt" DESC/);
});

test('23/51 measurement creation validates patient ownership',()=>{
  const source=backend();
  assert.match(source,/CarePatient" WHERE "tenantId"=\$1 AND "id"=\$2/);
  assert.match(source,/El paciente no pertenece al tenant activo/);
});

test('23/51 frontend service reads measurements canonically',()=>{
  const source=service();
  assert.match(source,/measurements\(patientId\)/);
  assert.match(source,/\/verticals\/health\/measurements/);
});

test('23/51 longitudinal record covers active problems allergies diagnoses treatments and vital trends',()=>{
  const source=panel();
  for(const token of [
    'Problemas activos','Alergias','Diagnósticos','Tratamientos',
    'Peso','Temperatura','Frecuencia cardíaca','Frecuencia respiratoria',
    'measurementKinds','trendDelta','Última medición','Tendencia'
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/HealthVerticalService\.createMeasurement\(/);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML/);
});

test('23/51 dossier composes a single longitudinal record and loads measurements',()=>{
  const source=page();
  assert.match(source,/VeterinaryLongitudinalRecord/);
  assert.equal((source.match(/<VeterinaryLongitudinalRecord/g)||[]).length,1);
  assert.match(source,/HealthVerticalService\.measurements\(patientId\)/);
});
