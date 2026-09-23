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
  assert.match(source,/HealthVerticalService\.createVeterinaryVitalMeasurements\(/);
  assert.doesNotMatch(source,/HealthVerticalService\.createMeasurement\(/);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML/);
});

test('23/51 dossier composes a single longitudinal record and loads measurements',()=>{
  const source=page();
  assert.match(source,/VeterinaryLongitudinalRecord/);
  assert.equal((source.match(/<VeterinaryLongitudinalRecord/g)||[]).length,1);
  assert.match(source,/HealthVerticalService\.measurements\(patientId\)/);
});


test('23/51 veterinary vital batch is atomic tenant-scoped and retry-safe',()=>{
  const source=backend();
  const start=source.indexOf("router.post('/health/measurements/veterinary-vitals'");
  const end=source.indexOf("router.get('/health/immunizations'",start);
  const block=source.slice(start,end);
  for(const token of [
    'veterinaryVitalBatchSchema',
    'pg_advisory_xact_lock',
    '"kind"=\'animal\'',
    'FOR SHARE',
    "metadata\"->>'source'='veterinary-longitudinal-record'",
    "metadata\"->>'batchId'=$3",
    'replayed:true',
    'El batchId ya fue usado para una toma de signos vitales diferente.'
  ]) assert.ok(block.includes(token.replaceAll('\\"','"')),token);
  assert.match(block,/prisma\.\$transaction/);
  assert.match(block,/INSERT INTO public\."CareMeasurement"/);
  assert.match(block,/result\.replayed\?'200'|result\.replayed\?200:201/);
});

test('23/51 veterinary vital schema limits kinds units duplicates and finite values',()=>{
  const source=backend();
  const start=source.indexOf('const VETERINARY_VITAL_UNITS');
  const end=source.indexOf('const immunizationSchema',start);
  const block=source.slice(start,end);
  for(const token of ['weight','temperature','heart_rate','respiratory_rate','kg','°C','lpm','rpm','.finite()','Cada signo vital puede registrarse una sola vez por toma.','La unidad no corresponde al signo vital.']) assert.ok(block.includes(token),token);
});

test('23/51 UI keeps one batch id across failed retry and rotates it only after success',()=>{
  const source=panel();
  for(const token of ['nextVitalBatchId','batchId','createVeterinaryVitalMeasurements','La toma se guarda como un batch atómico y reintentable']) assert.ok(source.includes(token),token);
  const submit=source.slice(source.indexOf('async function submit'),source.indexOf('const diagnosisColumns'));
  assert.match(submit,/batchId,/);
  assert.match(submit,/setBatchId\(nextVitalBatchId\(\)\)/);
  assert.match(submit,/catch\(cause\)[\s\S]*reportVeterinaryError/);
  assert.doesNotMatch(submit,/catch\(cause\)[\s\S]*setBatchId/);
  assert.match(submit,/Number\.isFinite/);
});

test('23/51 database guards one vital kind per patient batch',()=>{
  const migration=fs.readFileSync('backend/prisma/migrations/20260923014000_veterinary_longitudinal_batch_v2351/migration.sql','utf8');
  for(const token of ['CareMeasurement_vet_batch_kind_unique','"tenantId"','"patientId"',"(metadata->>'batchId')",'"kind"',"'veterinary-longitudinal-record'"]) assert.ok(migration.includes(token),token);
});

test('23/51 frontend service exposes veterinary vital batch endpoint',()=>{
  const source=service();
  assert.match(source,/createVeterinaryVitalMeasurements\(payload\)/);
  assert.match(source,/\/health\/measurements\/veterinary-vitals/);
});
