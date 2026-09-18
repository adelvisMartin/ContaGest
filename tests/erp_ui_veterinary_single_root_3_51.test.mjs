import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ERP_UI_WAVE_A_2_51 } from '../qa/support/erp-ui-wave-a-v251.mjs';

const read=(p)=>fs.readFileSync(p,'utf8');
const veterinary=()=>ERP_UI_WAVE_A_2_51.find((item)=>item.route==='veterinaria');

test('3/51 veterinary route graduates from legacy exception to migrated',()=>{
  const entry=veterinary();
  assert.equal(entry?.status,'MIGRATED');
  assert.equal(entry?.exception,undefined);
  assert.equal(entry?.legacyBudget?.legacyVetImport,0);
  assert.match(entry?.canonicalRegions?.join(' ')||'',/single React root/i);
});

test('3/51 V1123 owns one React root and composes the full workspace declaratively',()=>{
  const source=read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
  assert.doesNotMatch(source,/VeterinaryClinicLegacy/);
  assert.match(source,/import \{ VeterinaryWorkspace \} from '\.\/VeterinaryClinicPage\.jsx'/);
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  assert.match(source,/<CgProvider state=\{state\}>/);
  assert.match(source,/<VeterinaryDossier ctx=\{ctx\} state=\{state\}\/>/);
  assert.match(source,/<VeterinaryWorkspace state=\{state\} UrlStateService=\{ctx\.UrlStateService\}\/>/);
  assert.doesNotMatch(source,/\.render\(state,ctx\)|\.mount\(state,ctx\)/);
});

test('3/51 veterinary workspace consumes canonical provider theme instead of owning a second ThemeProvider',()=>{
  const source=read('frontend/src/pages/VeterinaryClinicPage.jsx');
  assert.match(source,/export function VeterinaryWorkspace/);
  assert.match(source,/useTheme/);
  assert.doesNotMatch(source,/createContaGestMuiTheme/);
  assert.doesNotMatch(source,/<ThemeProvider/);
  assert.match(source,/activeRoot\.render\(<CgProvider state=\{state\}><VeterinaryWorkspace/);
});

test('3/51 source gate forbids veterinary legacy lifecycle regression after graduation',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  assert.match(audit,/item\.status==='MIGRATED'/);
  assert.match(audit,/VeterinaryClinicLegacy/);
  assert.match(audit,/legacy lifecycle/i);
});
