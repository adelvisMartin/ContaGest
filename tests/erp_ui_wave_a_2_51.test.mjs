import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ERP_UI_WAVE_A_2_51 } from '../qa/support/erp-ui-wave-a-v251.mjs';

const read=(p)=>fs.readFileSync(p,'utf8');

test('2/51 classifies the five requested vertical routes with explicit legacy ownership',()=>{
  assert.deepEqual(ERP_UI_WAVE_A_2_51.map((item)=>item.route),['odontologia','veterinaria','gimnasio','rutinas','nutricion']);
  for(const item of ERP_UI_WAVE_A_2_51){
    assert.ok(['MIGRATED','LEGACY_EXCEPTION_APPROVED','OUT_OF_SCOPE_NON_UI'].includes(item.status));
    if(item.status==='LEGACY_EXCEPTION_APPROVED'){
      assert.equal(item.exception.owner,'roadmap 3/51');
      assert.equal(item.exception.reviewBy,'3/51');
      assert.ok(item.exception.reason.length>30);
    }
  }
});

test('Veterinary dossier consumes canonical Cg primitives while legacy double-renderer remains explicit',()=>{
  const source=read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
  for(const token of ['CgProvider','CgButton','CgTextField','CgState','CgStatusChip'])assert.match(source,new RegExp(token));
  assert.doesNotMatch(source,/ThemeProvider|createContaGestMuiTheme/);
  assert.match(source,/VeterinaryClinicLegacy/);
});

test('legacy budgets are monotonic: this wave cannot add new HTML primitives to dentistry or fitness',()=>{
  const dental=read('frontend/src/pages/DentistryPracticePage.js');
  const gym=read('frontend/src/pages/GymManagementPage.js');
  const count=(source,re)=>(source.match(re)||[]).length;
  assert.ok(count(dental,/<button\b/g)<=1);
  assert.ok(count(dental,/<input\b/g)<=1);
  assert.ok(count(gym,/<button\b/g)<=16);
  assert.ok(count(gym,/<input\b/g)<=30);
  assert.ok(count(gym,/<select\b/g)<=15);
  assert.ok(count(gym,/<textarea\b/g)<=4);
});

test('responsive owner covers dental touch targets and both dental/gym wrapping surfaces',()=>{
  const css=read('frontend/src/styles/erp-runtime.css');
  assert.match(css,/cg-dental-tooth-grid/);
  assert.match(css,/cg-dental-list/);
  assert.match(css,/cg-gym-v1124-grid/);
  assert.match(css,/min-height:44px/);
});

test('Wave A audit is wired into the production source gate',()=>{
  const root=JSON.parse(read('package.json'));
  const frontend=JSON.parse(read('frontend/package.json'));
  assert.equal(root.scripts['audit:erp-ui-wave-a'],'node scripts/erp-ui-wave-a-audit-v251.mjs');
  assert.match(frontend.scripts['preqa:source'],/npm run audit:erp-ui-wave-a/);
});
