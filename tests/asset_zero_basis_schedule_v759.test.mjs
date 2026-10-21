import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeStraightLineDepreciation } from '../backend/src/modules/assets/straight-line-schedule.mjs';
const base = {
  tenantId:'tenant-A',assetTenantId:'tenant-A',assetId:'asset-001',
  inServiceDate:'2024-02-29',originalCostExact:'75.00',
  residualValueExact:'75.00',usefulLifeMonths:3,scheduleVersion:1
};
test('#759 zero depreciation preserves all calendar periods and original asset value', () => {
  const result=proposeStraightLineDepreciation(base);
  assert.equal(result.periods.length,3);
  assert.deepEqual(result.periods.map(x=>x.period),['2024-03','2024-04','2024-05']);
  assert.ok(result.periods.every(x=>x.depreciationExact==='0.00'&&x.carryingValueExact==='75.00'));
  assert.equal(result.totalDepreciationExact,'0.00');
  assert.equal(result.posted,false);
});
test('#759 zero-basis schedule still honors policy first month following in-service', () => {
  const result=proposeStraightLineDepreciation({...base,inServiceDate:'2026-12-31',usefulLifeMonths:2});
  assert.deepEqual(result.periods.map(x=>x.period),['2027-01','2027-02']);
});
test('#759 nonzero cents remain rounded in final month and reconcile exactly', () => {
  const result=proposeStraightLineDepreciation({...base,originalCostExact:'75.10',residualValueExact:'75.00'});
  assert.deepEqual(result.periods.map(x=>x.depreciationExact),['0.03','0.03','0.04']);
  assert.equal(result.periods.at(-1).carryingValueExact,'75.00');
});
test('#759 existing tenant and leap-day validation remain fail-closed', () => {
  assert.throws(()=>proposeStraightLineDepreciation({...base,assetTenantId:'tenant-B'}),/SCOPE/);
  assert.throws(()=>proposeStraightLineDepreciation({...base,inServiceDate:'2026-02-29'}),/SERVICE_DATE/);
});
test('#759 schedule remains immutable and not a GL posting authorization', () => {
  const result=proposeStraightLineDepreciation(base);
  assert.equal(result.requiresFinancialDomainPosting,true);
  assert.equal(result.readOnly,true);
  assert.ok(Object.isFrozen(result.periods));
  assert.ok(Object.isFrozen(result.periods[0]));
});