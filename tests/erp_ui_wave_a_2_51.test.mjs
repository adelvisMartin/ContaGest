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

test('Veterinary route keeps canonical Cg primitives after graduating to a single React root',()=>{
  const source=read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
  const entry=ERP_UI_WAVE_A_2_51.find((item)=>item.route==='veterinaria');
  assert.equal(entry.status,'MIGRATED');
  for(const token of ['CgProvider','CgButton','CgTextField','CgState','CgStatusChip'])assert.match(source,new RegExp(token));
  assert.doesNotMatch(source,/ThemeProvider|createContaGestMuiTheme|VeterinaryClinicLegacy/);
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
});

test('legacy budgets are zero after Dentistry and Fitness migrated to React/Cg/MUI',()=>{
  const dental=read('frontend/src/pages/DentistryPracticePage.jsx');
  const gym=read('frontend/src/pages/GymManagementPage.jsx');
  const count=(source,re)=>(source.match(re)||[]).length;
  for(const source of [dental,gym]){
    assert.doesNotMatch(source,/components\/ui\/index\.js|mountSubmit|escapeHtml|innerHTML|querySelector|addEventListener|MutationObserver/);
    assert.equal(count(source,/<button\b/g),0);
    assert.equal(count(source,/<input\b/g),0);
    assert.equal(count(source,/<select\b/g),0);
    assert.equal(count(source,/<textarea\b/g),0);
  }
  for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect'])assert.match(gym,new RegExp(primitive));
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


test('Fitness productivity stays declarative after 3/51 and query enhancer never revives the retired MutationObserver layer',()=>{
  const queryEnhancer=read('frontend/src/services/queryParamEnhancer.js');
  const tools=read('frontend/src/components/fitness/FitnessProductivityTools.jsx');
  const gym=read('frontend/src/pages/GymManagementPage.jsx');
  assert.doesNotMatch(queryEnhancer,/FitnessProductivityEnhancer|fitnessProductivityEnhancer\.js/);
  assert.match(gym,/FitnessProductivityTools/);
  assert.doesNotMatch(tools,/\b[A-Za-z][A-Za-z0-9]*=\.\d+/);
});


test('58x5 browser coverage is sharded outside Vercel without reducing the route matrix',()=>{
  const root=JSON.parse(read('package.json'));
  const vercel=read('scripts/vercel-browser-preqa-v16.mjs');
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  const workflow=read('.github/workflows/erp-ui-58x5-v251.yml');
  assert.equal(root.scripts['test:browser:58:core'],'node scripts/erp-browser-58x5-v251.mjs core');
  assert.equal(root.scripts['test:browser:58:shard'],'node scripts/erp-browser-58x5-v251.mjs shard');
  assert.equal(root.scripts['test:browser:58'],'node scripts/erp-browser-58x5-v251.mjs full');
  assert.match(runner,/MODULE_VISUAL_CATALOG\.length!==58/);
  assert.match(runner,/fine-composition-v166\.spec\.mjs/);
  assert.match(runner,/exhaustive-route-v164\.spec\.mjs/);
  assert.match(runner,/mobile-navigation-v163\.spec\.mjs/);
  assert.match(runner,/route-transition-v164\.spec\.mjs/);
  assert.match(workflow,/batch: \[0,1,2,3,4,5,6,7,8,9\]/);
  assert.match(workflow,/qa\/postmerge-58x5-verification/);
  assert.doesNotMatch(vercel,/58x5 fine-composition batch|58x5 exhaustive batch|mobile sidebar navigation batch/);
  assert.match(vercel,/delegated to \.github\/workflows\/erp-ui-58x5-v251\.yml/);
});
