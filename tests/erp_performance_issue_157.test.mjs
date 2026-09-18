import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const policy=JSON.parse(fs.readFileSync('products/erp/performance-policy-v157.json','utf8'));

test('performance policy covers frontend/backend and required profiles',()=>{
  assert.equal(['PROVISIONAL','RATIFIED'].includes(policy.targetsLifecycle?.state),true,'targets lifecycle');
  for(const p of ['cold','warm','repeated-navigation','long-session','network-throttled'])assert.equal(policy.profiles.includes(p),true,p);
  for(const k of ['startupP95Ms','routeSwitchP95Ms','saveP95Ms','import1000RowsP95Ms','longTaskCountPerMinuteMax'])assert.equal(Number.isFinite(policy.frontend[k]),true,k);
  for(const k of ['apiP50Ms','apiP95Ms','apiP99Ms','errorRatePctMax','throughputRpsMin','dbQueryP95Ms','poolSaturationPctMax','slowQueryCountMax','nPlusOneFindingCountMax','deadlockCountMax','crossTenantLeakCountMax'])assert.equal(Number.isFinite(policy.backend[k]),true,k);
});

test('workload model requires declared peak plus 1x and 3x load',()=>{
  assert.equal(policy.workloadModel.expectedPeakConcurrentUsers,'MEASURE_AND_DECLARE');
  assert.deepEqual(policy.workloadModel.requiredLoadFactors,[1,3]);
  assert.equal(policy.workloadModel.fixturePolicy,'SYNTHETIC_OR_SANITIZED_ONLY');
  for(const profile of ['finance-admin','operations-clerk','read-only-analyst'])assert.equal(policy.workloadModel.profiles.includes(profile),true,profile);
});

test('heavy processes and degradation scenarios are explicit',()=>{
  for(const process of ['import','export','report'])assert.equal(policy.heavyProcesses.required.includes(process),true,process);
  for(const outcome of ['success','controlled-error','cancellation-or-explicit-non-cancellable-contract'])assert.equal(policy.heavyProcesses.requiredOutcomes.includes(outcome),true,outcome);
  for(const scenario of ['slow-db','pool-saturation','external-timeout','memory-pressure','large-payload','multi-user-concurrency'])assert.equal(policy.degradationScenarios.includes(scenario),true,scenario);
});

test('10k table and long-session budgets are explicit',()=>{
  assert.equal(Number.isFinite(policy.frontend.tableRender['10000RowsP95Ms']),true);
  assert.equal(Number.isFinite(policy.frontend.longSessionHeapGrowthPctMax),true);
});

test('truth states do not collapse NOT_EXECUTED into PASS',()=>{
  assert.equal(policy.truthStates.includes('NOT_EXECUTED'),true);
  assert.equal(policy.truthStates.includes('MEASURED_PROVISIONAL'),true);
});
