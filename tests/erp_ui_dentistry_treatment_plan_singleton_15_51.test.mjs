import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');

test('15/51 treatment-plan wiring remains singleton after merge reconciliation',()=>{
  const source=page();
  assert.equal((source.match(/import \{ TreatmentPlanPanel \} from '\.\.\/components\/dentistry\/TreatmentPlanPanel\.jsx';/g)||[]).length,1);
  assert.equal((source.match(/async function createTreatmentPlan\(/g)||[]).length,1);
  assert.equal((source.match(/async function decideTreatmentPlan\(/g)||[]).length,1);
  assert.equal((source.match(/<TreatmentPlanPanel/g)||[]).length,1);
});

test('15/51 singleton wiring still points to canonical callbacks',()=>{
  const source=page();
  assert.match(source,/onCreate=\{createTreatmentPlan\}/);
  assert.match(source,/onDecision=\{decideTreatmentPlan\}/);
  assert.match(source,/HealthVerticalService\.createEncounter\(/);
  assert.match(source,/HealthVerticalService\.decideTreatmentPlan\(/);
});
