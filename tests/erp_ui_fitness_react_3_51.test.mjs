import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';
import { ERP_UI_WAVE_A_2_51 } from '../qa/support/erp-ui-wave-a-v251.mjs';

const read=(p)=>fs.readFileSync(p,'utf8');

test('3/51 gym routines and nutrition share the migrated React renderer',()=>{
  for(const route of ['gimnasio','rutinas','nutricion']){
    assert.deepEqual(PAGE_REGISTRY[route],['./pages/GymManagementPage.jsx','GymManagementPage']);
    const entry=ERP_UI_WAVE_A_2_51.find((item)=>item.route===route);
    assert.equal(entry.status,'MIGRATED',route);
    assert.equal(entry.exception,undefined,route);
    for(const value of Object.values(entry.legacyBudget||{}))assert.equal(value,0,route);
  }
});

test('3/51 GymManagementPage is one declarative React root with all vertical service flows',()=>{
  const source=read('frontend/src/pages/GymManagementPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgEmptyState'])assert.match(source,new RegExp(primitive));
  for(const call of ['summary','members','trainers','plans','classes','assessments','routines','nutrition','createMember','createTrainer','createPlan','createMembership','checkIn','createAssessment','createRoutine','createNutrition','createClass'])assert.match(source,new RegExp(`GymVerticalService\\.${call}\\(`),call);
  assert.doesNotMatch(source,/components\/ui\/index\.js|escapeHtml|innerHTML|querySelector|addEventListener|mountSubmit/);
});

test('3/51 productivity tools are declarative and preserve routine nutrition fooddata and CSV capabilities',()=>{
  const source=read('frontend/src/components/fitness/FitnessProductivityTools.jsx');
  for(const token of ['FitnessRoutineService','FitnessNutritionService','FitnessClientTransferService','FoodDataCentralService','GymVerticalService'])assert.match(source,new RegExp(token));
  for(const token of ['Usuario test / sin registrar','Copiar para WhatsApp','Descargar plantilla','Importar lista','USDA FoodData Central','clinicalRisk'])assert.match(source,new RegExp(token));
  assert.doesNotMatch(source,/MutationObserver|innerHTML|querySelector|addEventListener|document\.createElement/);
});

test('3/51 removes the Fitness MutationObserver bootstrap and superseded enhancer',()=>{
  const vertical=read('frontend/src/services/verticalService.js');
  assert.doesNotMatch(vertical,/fitnessProductivityEnhancer|installFitnessProductivityEnhancer/);
  assert.equal(fs.existsSync('frontend/src/services/fitnessProductivityEnhancer.js'),false);
});

test('3/51 source gate rejects fitness legacy lifecycle regression after graduation',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  assert.match(audit,/gimnasio/);
  assert.match(audit,/imperative fitness lifecycle/i);
  assert.match(audit,/MutationObserver/);
});
