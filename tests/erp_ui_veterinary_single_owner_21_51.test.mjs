import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const owner=()=>fs.readFileSync('frontend/src/pages/VeterinaryClinicPageV1123.jsx','utf8');
const workspace=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryWorkspace.jsx','utf8');

test('21/51 veterinary route has exactly one React root owner',()=>{
  const page=owner();
  assert.equal((page.match(/createRoot\(/g)||[]).length,1);
  assert.match(page,/CgProvider/);
  assert.match(page,/import \{ VeterinaryWorkspace \} from '\.\.\/components\/veterinary\/VeterinaryWorkspace\.jsx'/);
  assert.equal(fs.existsSync('frontend/src/pages/VeterinaryClinicPage.jsx'),false);
});

test('21/51 VeterinaryWorkspace is a rootless declarative component',()=>{
  const source=workspace();
  assert.match(source,/export function VeterinaryWorkspace/);
  assert.doesNotMatch(source,/createRoot\(/);
  assert.doesNotMatch(source,/CgProvider/);
  assert.doesNotMatch(source,/export const VeterinaryClinicPage/);
  assert.doesNotMatch(source,/veterinaryClinicRoot/);
});

test('21/51 preserves veterinary service contracts after extraction',()=>{
  const source=workspace();
  for(const token of [
    'VeterinaryService.dashboard(',
    'HealthVerticalService.patients(',
    'HealthVerticalService.professionals(',
    'HealthVerticalService.appointments(',
    'HealthVerticalService.encounters(',
    'HealthVerticalService.prescriptions(',
    'VeterinaryService.labOrders(',
    'VeterinaryService.labResults(',
    'VeterinaryService.studies(',
    'VeterinaryService.hospitalizations(',
    'VeterinaryService.procedures(',
    'VeterinaryService.communications('
  ]) assert.ok(source.includes(token),token);
});
