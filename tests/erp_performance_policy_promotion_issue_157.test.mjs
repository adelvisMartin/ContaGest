import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const validator=fs.readFileSync('scripts/erp-performance-policy-promotion-v157.mjs','utf8');
const gate=fs.readFileSync('scripts/erp-performance-gate-v157.mjs','utf8');
const docs=fs.readFileSync('docs/qa/ERP-157-POLICY-PROMOTION.md','utf8');

test('#157 budget promotion is auditable and cannot be enabled by flipping one flag',()=>{
  assert.match(validator,/PERFORMANCE_POLICY_PROMOTION_REVIEW_REQUIRED/);
  assert.match(validator,/decision.*APPROVED/);
  assert.match(validator,/candidateSha/);
  assert.match(validator,/measurementHash/);
  assert.match(validator,/expectedPeakConcurrentUsers/);
  assert.match(validator,/requiredLoadFactors/);
  assert.match(validator,/budgetsHash/);
  assert.match(validator,/reviewedBy/);
  assert.match(validator,/reviewedAt/);
  assert.match(validator,/evidenceRunUrl/);
  assert.match(validator,/actions\/runs/);
});

test('#157 final gate validates promotion evidence whenever budgets stop being provisional',()=>{
  assert.match(gate,/validatePerformancePolicyPromotion/);
  assert.match(gate,/targetsAreProvisionalUntilMeasured/);
  assert.match(gate,/performance-policy-review-v157\.json/);
});

test('#157 docs require review after measured provisional baseline and prohibit invented peak',()=>{
  assert.match(docs,/MEASURED_PROVISIONAL/);
  assert.match(docs,/ERP157_EXPECTED_PEAK_USERS/);
  assert.match(docs,/no.*invent/i);
  assert.match(docs,/reviewedBy/);
  assert.match(docs,/measurementHash/);
  assert.match(docs,/targetsAreProvisionalUntilMeasured/);
  assert.match(docs,/pull request|PR/i);
});
