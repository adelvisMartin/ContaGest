import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { healthBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const backend=()=>healthBackendSource();

test('11/51 persists a structured odontogram payload, not only a tooth number',()=>{
  const source=page();
  for(const token of ['dentition','odontogram','selectedSurfaces','condition','surfaces:selectedSurfaces','tooth:selectedTooth']) assert.ok(source.includes(token),token);
  assert.match(source,/const clinicalData=\{/);
  assert.match(source,/tooth:selectedTooth/);
  assert.match(source,/odontogram:\{dentition,tooth:selectedTooth,surfaces:selectedSurfaces,condition:/);
});

test('11/51 supports permanent and primary dentitions with explicit tooth catalogs',()=>{
  const source=page();
  const catalog=fs.readFileSync('frontend/src/components/dentistry/dentalCatalog.js','utf8');
  assert.match(source,/PERMANENT_TEETH/);
  assert.match(source,/PRIMARY_TEETH/);
  assert.match(source,/permanent/);
  assert.match(source,/primary/);
  for(const tooth of ['11','48','51','85']) assert.ok(catalog.includes(`'${tooth}'`),tooth);
});

test('11/51 backend validates structured dental-treatment clinicalData',()=>{
  const source=backend();
  for(const token of ['dentalClinicalDataSchema','odontogram','dentition','surfaces','condition']) assert.ok(source.includes(token),token);
  assert.match(source,/type\s*===\s*'dental-treatment'/);
  assert.match(source,/dentalClinicalDataSchema\.safeParse/);
});

test('11/51 keeps existing encounter transport and persistence authority',()=>{
  const source=backend();
  assert.match(source,/clinicalData: jsonRecord/);
  assert.match(source,/JSON\.stringify\(clinicalData\)/);
  assert.match(page(),/HealthVerticalService\.createEncounter\(/);
});
