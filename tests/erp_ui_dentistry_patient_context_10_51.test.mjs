import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');

test('10/51 dentistry never derives clinical context from the first patient',()=>{
  const code=source();
  assert.doesNotMatch(code,/rows\(initial\.patients\)\[0\]|nextPatients\[0\]|patients\[0\]/);
  assert.match(code,/selectedPatientId/);
});

test('10/51 selected patient is the authority for odontogram treatment and history',()=>{
  const code=source();
  assert.match(code,/const \[selectedPatientId,setSelectedPatientId\]=useState/);
  assert.match(code,/patientId:selectedPatientId/);
  assert.match(code,/HealthVerticalService\.encounters\(patientId\)/);
  assert.match(code,/value=\{selectedPatientId\}/);
  assert.match(code,/setSelectedTooth\(''\)/);
});

test('10/51 patient selection is explicit and survives refresh only when the patient still exists',()=>{
  const code=source();
  assert.match(code,/selectedPatientId&&nextPatients\.some/);
  assert.doesNotMatch(code,/\?selectedPatientId:\(nextPatients\[0\]/);
  assert.match(code,/setSelectedPatientId\(nextPatientId\)/);
});

test('10/51 appointment patient remains independent from clinical-context selection',()=>{
  const code=source();
  const schedule=fs.readFileSync('frontend/src/components/dentistry/DentalSchedulePanel.jsx','utf8');
  assert.equal((code.match(/<DentalSchedulePanel/g)||[]).length,1);
  assert.match(schedule,/useState\(\{patientId:''/);
  assert.match(schedule,/form\.patientId/);
  assert.doesNotMatch(schedule,/selectedPatientId/);
});
