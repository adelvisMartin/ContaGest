import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('15/51 treatment-plan wiring remains single-owner after merge',()=>{
  const source=fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
  assert.equal((source.match(/import \{ TreatmentPlanPanel \} from '\.\.\/components\/dentistry\/TreatmentPlanPanel\.jsx';/g)||[]).length,1);
  assert.equal((source.match(/async function createTreatmentPlan\(/g)||[]).length,1);
  assert.equal((source.match(/async function decideTreatmentPlan\(/g)||[]).length,1);
  assert.equal((source.match(/<TreatmentPlanPanel/g)||[]).length,1);
  assert.equal((source.match(/HealthVerticalService\.decideTreatmentPlan\(/g)||[]).length,1);
});
