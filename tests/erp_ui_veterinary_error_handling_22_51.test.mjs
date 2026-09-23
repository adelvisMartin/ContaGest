import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const owner=()=>fs.readFileSync('frontend/src/pages/VeterinaryClinicPageV1123.jsx','utf8');
const workspace=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryWorkspace.jsx','utf8');

const silentCatch=/\.catch\(\s*\(?.*?\)?\s*=>\s*null\s*\)|catch\s*\{\s*\}/s;

test('22/51 removes silent veterinary promise/catch swallowing',()=>{
  assert.doesNotMatch(owner(),silentCatch);
  assert.doesNotMatch(workspace(),silentCatch);
});

test('22/51 dossier exposes load/history/save errors and retry actions',()=>{
  const source=owner();
  for(const token of [
    'loadError','historyError','saveError',
    'reportVeterinaryError',
    'Reintentar','Reintentar historia',
    'Se conserva la última información cargada'
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/setLoadError\(veterinaryErrorMessage\(error\)\)/);
  assert.match(source,/setHistoryError\(veterinaryErrorMessage\(error\)\)/);
  assert.match(source,/setSaveError\(veterinaryErrorMessage\(error\)\)/);
});

test('22/51 workspace preserves previous data on read failure and exposes retry',()=>{
  const source=workspace();
  for(const token of [
    'baseError','patientDataError','actionError',
    "reportVeterinaryError('workspace.loadBase'",
    "reportVeterinaryError('workspace.loadPatientData'",
    'Se conserva la última información válida',
    'Reintentar'
  ]) assert.ok(source.includes(token),token);
  const loadBase=source.slice(source.indexOf('const loadBase=async'),source.indexOf('const loadPatientData=async'));
  const loadPatient=source.slice(source.indexOf('const loadPatientData=async'),source.indexOf('useEffect(()=>{void loadBase'));
  assert.doesNotMatch(loadBase,/catch[\s\S]*setPatients\(\[\]\)/);
  assert.doesNotMatch(loadPatient,/catch[\s\S]*setEncounters\(\[\]\)/);
});

test('22/51 veterinary logging avoids clinical payload serialization',()=>{
  for(const source of [owner(),workspace()]){
    assert.match(source,/console\.error\('\[veterinary\]'/);
    assert.match(source,/scope/);
    assert.match(source,/message/);
    assert.match(source,/status/);
    assert.doesNotMatch(source,/console\.error\([^\n]*form|console\.error\([^\n]*patient|console\.error\([^\n]*clinicalData/);
  }
});


test('22/51 current veterinary child surfaces use safe error reporting',()=>{
  const paths=[
    'frontend/src/components/veterinary/VeterinaryLongitudinalRecord.jsx',
    'frontend/src/components/veterinary/VeterinaryPreventiveCarePanel.jsx',
    'frontend/src/components/veterinary/VeterinaryTreatmentSheet.jsx',
    'frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx',
    'frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx'
  ];
  for(const path of paths){
    const source=fs.readFileSync(path,'utf8');
    assert.match(source,/reportVeterinaryError/);
    assert.doesNotMatch(source,silentCatch);
    assert.doesNotMatch(source,/console\.error\([^\n]*(form|patient|clinicalData|details)/);
  }
  const reporter=fs.readFileSync('frontend/src/components/veterinary/veterinaryError.js','utf8');
  for(const token of ['scope','name','message','status']) assert.ok(reporter.includes(token),token);
  assert.doesNotMatch(reporter,/JSON\.stringify|clinicalData|patient|form/);
});

test('22/51 medication inventory read is retryable and preserves prior data on transient failure',()=>{
  const source=fs.readFileSync('frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx','utf8');
  for(const token of ['loadProducts','preserveOnError','productPermissionBlocked','productsLoading','Reintentar']) assert.ok(source.includes(token),token);
  const start=source.indexOf('async function loadProducts');
  const end=source.indexOf('useEffect(()=>{void loadProducts',start);
  const block=source.slice(start,end);
  assert.match(block,/if\(permissionBlocked\|\|!preserveOnError\)setProducts\(\[\]\)/);
  assert.doesNotMatch(block,/catch[\s\S]*setProducts\(\[\]\)[\s\S]*setProductError\([^)]*No se pudo cargar/);
});
