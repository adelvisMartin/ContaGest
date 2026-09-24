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
  const workspaceSource=workspace();
  const workspaceReporter=fs.readFileSync('frontend/src/components/veterinary/veterinaryWorkspace.helpers.js','utf8');
  assert.match(workspaceSource,/reportVeterinaryError/);
  for(const source of [owner(),workspaceReporter]){
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
    'frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx',
    'frontend/src/components/veterinary/VeterinaryFinancialPanel.jsx',
    'frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx',
    'frontend/src/components/veterinary/VeterinaryBoardingPanel.jsx'
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
  assert.equal((block.match(/setProducts\(\[\]\)/g)||[]).length,1,'products may only be cleared by the explicit permission/non-preserve guard');
});


test('22/51 guardian portal clipboard and communication-log failures stay visible and safely logged',()=>{
  const source=fs.readFileSync('frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx','utf8');
  const copyStart=source.indexOf('async function copyLink');
  const copyEnd=source.indexOf('async function revokeGrant',copyStart);
  const copyBlock=source.slice(copyStart,copyEnd);
  assert.match(copyBlock,/catch\(cause\)/);
  assert.match(copyBlock,/reportVeterinaryError\('guardianPortal\.copyLink'/);
  assert.match(copyBlock,/setError\(message\)/);
  assert.match(copyBlock,/toast\.error\(message\)/);

  const communicationStart=source.indexOf('async function communicate');
  const communicationEnd=source.indexOf('if\(!selectedPatient\)',communicationStart);
  const communicationBlock=source.slice(communicationStart,communicationEnd);
  assert.match(communicationBlock,/reportVeterinaryError\('guardianPortal\.communicationLog'/);
  assert.match(communicationBlock,/setError\(message\)/);
  assert.match(communicationBlock,/toast\.error\(message\)/);
  assert.doesNotMatch(communicationBlock,/console\.error\([^\n]*(absoluteUrl|access|token|payload)/);
});

test('22/51 current post-29 veterinary modules expose retryable persistent errors',()=>{
  const expectations=[
    ['frontend/src/components/veterinary/VeterinaryFinancialPanel.jsx','financialFlow.load'],
    ['frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx','guardianPortal.issue'],
    ['frontend/src/components/veterinary/VeterinaryBoardingPanel.jsx','boarding.load']
  ];
  for(const [path,scope] of expectations){
    const source=fs.readFileSync(path,'utf8');
    assert.ok(source.includes('reportVeterinaryError'),path);
    assert.ok(source.includes(scope),scope);
    assert.ok(source.includes('setError'),path);
    assert.ok(source.includes('Reintentar'),path);
    assert.doesNotMatch(source,silentCatch);
  }
});
