import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('products/erp/performance-policy-v157.json','utf8'));
const gate=fs.readFileSync('scripts/erp-performance-gate-v157.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/erp-performance-capacity-v157.yml','utf8');

test('#157 performance budgets have an explicit provisional -> ratified lifecycle',()=>{
  assert.ok(policy.targetsLifecycle,'targetsLifecycle is required');
  assert.match(String(policy.targetsLifecycle.state),/^(PROVISIONAL|RATIFIED)$/);
  assert.ok(Object.hasOwn(policy.targetsLifecycle,'baselineMeasurementHash'));
  assert.ok(Object.hasOwn(policy.targetsLifecycle,'baselineCandidateSha'));
  assert.ok(Object.hasOwn(policy.targetsLifecycle,'budgetDefinitionHash'));
  assert.ok(Object.hasOwn(policy.targetsLifecycle,'ratifiedAt'));
  assert.ok(Object.hasOwn(policy.targetsLifecycle,'ratifiedBy'));
  assert.equal(Object.hasOwn(policy,'targetsAreProvisionalUntilMeasured'),false);
});

test('#157 gate can emit PASS only for a valid ratified policy bound to current budgets',()=>{
  assert.match(gate,/targetsLifecycle/);
  assert.match(gate,/ratificationValid/);
  assert.match(gate,/baselineMeasurementHash/);
  assert.match(gate,/baselineCandidateSha/);
  assert.match(gate,/budgetDefinitionHash/);
  assert.match(gate,/currentBudgetDefinitionHash/);
  assert.match(gate,/MEASURED_PROVISIONAL/);
  assert.doesNotMatch(gate,/targetsAreProvisionalUntilMeasured/);
});

test('#157 ratification tool is evidence-bound and does not invent a baseline',()=>{
  assert.equal(fs.existsSync('scripts/erp-performance-ratify-v157.mjs'),true);
  const ratify=fs.readFileSync('scripts/erp-performance-ratify-v157.mjs','utf8');
  assert.match(ratify,/MEASURED_PROVISIONAL/);
  assert.match(ratify,/measurementHash/);
  assert.match(ratify,/baselineMeasurementHash/);
  assert.match(ratify,/baselineCandidateSha/);
  assert.match(ratify,/budgetDefinitionHash/);
  assert.match(ratify,/ratifiedBy/);
  assert.match(ratify,/RATIFIED/);
  assert.doesNotMatch(ratify,/Math\.random|Date\.now\(\).*measurementHash/);
});

test('#157 workflow executes the ratification lifecycle contract in both calibration and capacity jobs',()=>{
  const occurrences=workflow.match(/erp157_budget_ratification_issue_157\.test\.mjs/g) ?? [];
  assert.ok(occurrences.length>=2,`expected contract in calibration and capacity, got ${occurrences.length}`);
});
