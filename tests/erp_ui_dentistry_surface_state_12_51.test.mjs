import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const audit=()=>fs.readFileSync('scripts/erp-ui-wave-a-audit-v251.mjs','utf8');

test('12/51 derives latest visual state per structured tooth surface',()=>{
  const source=page();
  for(const token of ['SURFACE_META','buildSurfaceState','surfaceState','clinicalData?.odontogram','createdAt'])assert.ok(source.includes(token),token);
  assert.match(source,/if\(!current\[key\]\)/);
  assert.match(source,/dental-treatment/);
});

test('12/51 renders all five odontogram surfaces with accessible non-color-only state',()=>{
  const source=page();
  for(const token of ['vestibular','lingual_palatal','mesial','distal','occlusal_incisal'])assert.ok(source.includes(token),token);
  for(const token of ['aria-label','Con registro clínico','Sin registro','Seleccionada'])assert.ok(source.includes(token),token);
  assert.match(source,/borderStyle/);
});

test('12/51 keeps visual state derived and does not add a second persistence authority',()=>{
  const source=page();
  assert.equal((source.match(/HealthVerticalService\.createEncounter\(/g)||[]).length,1);
  assert.doesNotMatch(source,/updateEncounter|saveOdontogram|persistSurface|localStorage/);
});

test('12/51 Wave A audit fails closed if surface-state contracts disappear',()=>{
  const source=audit();
  for(const token of ['SURFACE_META','buildSurfaceState','Con registro clínico','aria-label'])assert.ok(source.includes(token),token);
});
