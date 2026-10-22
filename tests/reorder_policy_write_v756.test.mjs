import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeReorderPolicyWrite } from '../backend/src/modules/reports/reorder-policy-write.ts';

const base = {
  expectedRevision: 0,
  enabled: true,
  reorderPointExact: '5.000',
  targetStockExact: '20.000',
  safetyStockExact: '2.000',
  orderMultipleExact: '6.000',
  leadTimeDays: '7'
};

test('#756 policy write canonicalizes exact quantities and preserves required approval', () => {
  const x = normalizeReorderPolicyWrite(base);
  assert.deepEqual({
    reorderPointExact:x.reorderPointExact,
    targetStockExact:x.targetStockExact,
    orderMultipleExact:x.orderMultipleExact,
    leadTimeDays:x.leadTimeDays,
    expectedRevision:x.expectedRevision
  }, {
    reorderPointExact:'5.000',targetStockExact:'20.000',
    orderMultipleExact:'6.000',leadTimeDays:7,expectedRevision:0
  });
  assert.equal(x.autoPurchaseEnabled,false);
  assert.equal(x.approvalRequired,true);
  assert.equal(Object.isFrozen(x),true);
});
test('#756 optimistic create version zero and positive update version accepted',()=>{
  assert.equal(normalizeReorderPolicyWrite(base).expectedRevision,0);
  assert.equal(normalizeReorderPolicyWrite({...base,expectedRevision:2}).expectedRevision,2);
  assert.equal(normalizeReorderPolicyWrite({...base,enabled:false}).enabled,false);
});
test('#756 non-integer, negative and overflow revisions are denied',()=>{
  for(const expectedRevision of [-1,1.2,NaN,Infinity,2147483646,Number.MAX_SAFE_INTEGER,'1']){
    assert.throws(()=>normalizeReorderPolicyWrite({...base,expectedRevision}),/REORDER_POLICY_WRITE_INVALID/);
  }
});
test('#756 never silently enables auto purchase or approvals bypass',()=>{
  for(const enabled of [undefined,null,'true',0,1]){
    assert.throws(()=>normalizeReorderPolicyWrite({...base,enabled}),/REORDER_POLICY_WRITE_INVALID/);
  }
});
test('#756 exact decimal policy cannot use scientific, comma, negative or overprecision',()=>{
  for(const targetStockExact of ['2e3','2,000','-1','0.0001','NaN',' 10.00','9999999999999999']){
    assert.throws(()=>normalizeReorderPolicyWrite({...base,targetStockExact}),/REORDER_POLICY_QUANTITY_INVALID/);
  }
});
test('#756 safety, target and minimum order multiple must obey one canonical policy',()=>{
  for(const patch of [
    {safetyStockExact:'6'}, {targetStockExact:'5'}, {orderMultipleExact:'0'},
    {reorderPointExact:'20',targetStockExact:'10'}
  ]) assert.throws(()=>normalizeReorderPolicyWrite({...base,...patch}),/REORDER_POLICY_INCONSISTENT/);
});
test('#756 lead time invalid or over 365 days is rejected without guessing demand',()=>{
  for(const leadTimeDays of ['366','01','-1','1e2','3.5','10 days']){
    assert.throws(()=>normalizeReorderPolicyWrite({...base,leadTimeDays}),/REORDER_POLICY_LEAD_TIME_INVALID/);
  }
});
test('#756 malformed snapshots and prototype tricks fail closed',()=>{
  assert.throws(()=>normalizeReorderPolicyWrite(null),/REORDER_POLICY_WRITE_INVALID/);
  assert.throws(()=>normalizeReorderPolicyWrite([]),/REORDER_POLICY_WRITE_INVALID/);
  assert.throws(()=>normalizeReorderPolicyWrite({...base,targetStockExact:{toString:()=> '20.000'}}),/REORDER_POLICY_QUANTITY_INVALID/);
});
