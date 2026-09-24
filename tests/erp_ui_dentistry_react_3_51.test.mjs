import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';
import { ERP_UI_WAVE_A_2_51 } from '../qa/support/erp-ui-wave-a-v251.mjs';

const read=(p)=>fs.readFileSync(p,'utf8');
const dentistry=()=>ERP_UI_WAVE_A_2_51.find((item)=>item.route==='odontologia');

test('3/51 dentistry graduates to the declarative React renderer',()=>{
  assert.deepEqual(PAGE_REGISTRY.odontologia,['./pages/DentistryPracticePage.jsx','DentistryPracticePage']);
  const entry=dentistry();
  assert.equal(entry.status,'MIGRATED');
  assert.equal(entry.renderer,'frontend/src/pages/DentistryPracticePage.jsx');
  assert.equal(entry.exception,undefined);
  for(const value of Object.values(entry.legacyBudget||{}))assert.equal(value,0);
});

test('3/51 dentistry renderer has one React root and no imperative legacy UI kit',()=>{
  const source=read('frontend/src/pages/DentistryPracticePage.jsx');
  assert.match(source,/from 'react'/);
  assert.match(source,/createRoot/);
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  assert.match(source,/CgProvider/);
  for(const primitive of ['CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState'])assert.match(source,new RegExp(primitive));
  assert.doesNotMatch(source,/components\/ui\/index\.js/);
  assert.doesNotMatch(source,/mountSubmit|escapeHtml|innerHTML|querySelector|addEventListener/);
});

test('3/51 dentistry preserves service contracts and controlled tooth selection',()=>{
  const source=read('frontend/src/pages/DentistryPracticePage.jsx');
  for(const call of ['patients','professionals','appointments','encounters','createPatient','createProfessional','createAppointment','createEncounter']){
    assert.match(source,new RegExp(`HealthVerticalService\\.${call}\\(`),call);
  }
  assert.match(source,/selectedTooth/);
  assert.match(source,/setSelectedTooth/);
  assert.match(source,/const clinicalData=\{/);
  assert.match(source,/tooth:selectedTooth/);
  assert.match(source,/procedure:encounterForm\.procedure/);
  assert.match(source,/type:'dentistry'/);
  assert.match(source,/type:'dental-treatment'/);
});

test('3/51 Wave A gate rejects imperative dentistry regression after migration',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  assert.match(audit,/odontologia/);
  assert.match(audit,/imperative dentistry lifecycle/i);
});
