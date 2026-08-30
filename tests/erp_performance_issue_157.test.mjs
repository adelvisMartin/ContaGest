import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const policy=JSON.parse(fs.readFileSync('products/erp/performance-policy-v157.json','utf8'));
test('performance policy covers frontend/backend and required profiles',()=>{
 assert.equal(policy.targetsAreProvisionalUntilMeasured,true);
 for(const p of ['cold','warm','repeated-navigation','long-session','network-throttled'])assert.equal(policy.profiles.includes(p),true,p);
 for(const k of ['startupP95Ms','routeSwitchP95Ms','saveP95Ms','import1000RowsP95Ms'])assert.equal(Number.isFinite(policy.frontend[k]),true,k);
 for(const k of ['apiP50Ms','apiP95Ms','apiP99Ms','errorRatePctMax','throughputRpsMin'])assert.equal(Number.isFinite(policy.backend[k]),true,k);
});
test('10k table and long-session budgets are explicit',()=>{assert.equal(Number.isFinite(policy.frontend.tableRender['10000RowsP95Ms']),true);assert.equal(Number.isFinite(policy.frontend.longSessionHeapGrowthPctMax),true);});
test('truth states do not collapse NOT_EXECUTED into PASS',()=>{assert.equal(policy.truthStates.includes('NOT_EXECUTED'),true);assert.equal(policy.truthStates.includes('MEASURED_PROVISIONAL'),true);});
