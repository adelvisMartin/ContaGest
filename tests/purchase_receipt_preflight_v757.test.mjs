import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePurchaseReceipt as plan} from '../backend/src/modules/purchases/purchase-receipt-preflight.ts';
const A='cb0054f7-ef51-4580-888a-087701fca814',B='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const base={tenantId:A,actorTenantId:A,orderTenantId:A,orderId:'130849ad-a46d-5adb-a286-2774fd36bfac',lineId:'2e01330b-5d9b-5f71-8b1f-83c065c0c9ad',status:'confirmed',expectedRevision:1,orderedExact:'5.000',alreadyReceivedExact:'1.250',pendingOtherReceiptExact:'0.000',requestExact:'1.125',idempotencyKey:'receipt-20261016-one'};
test('partial receipt is deterministic and denies posting',()=>{const r=plan(base);assert.equal(r.receivedAfterExact,'2.375');assert.equal(r.outstandingAfterExact,'2.625');assert.equal(r.nextOrderStatus,'partially_received');assert.deepEqual([r.persisted,r.inventoryMovementAuthorized,r.supplierInvoiceAuthorized,r.ledgerAuthorized],[false,false,false,false]);});
test('final receipt closes just the order quantity',()=>{const r=plan({...base,status:'partially_received',requestExact:'3.750'});assert.equal(r.nextOrderStatus,'received');assert.equal(r.outstandingAfterExact,'0.000');});
test('rejects over-receipt without implicit tolerance',()=>{assert.throws(()=>plan({...base,requestExact:'3.751'}),/OVER_RECEIPT/);assert.throws(()=>plan({...base,alreadyReceivedExact:'5.001'}),/OVER_RECEIPT/);});
test('different actor/order tenant and malformed id fail closed',()=>{for(const patch of [{actorTenantId:B},{orderTenantId:B},{lineId:'wrong'}])assert.throws(()=>plan({...base,...patch}),/SCOPE/);});
test('wrong state, stale or unsafe revision cannot proceed',()=>{for(const patch of [{status:'draft'},{status:'cancelled'},{expectedRevision:0},{expectedRevision:Number.MAX_SAFE_INTEGER}])assert.throws(()=>plan({...base,...patch}),/STATE_REVISION/);});
test('quantity rejects float/scientific/negative/overprecision and zero request',()=>{for(const requestExact of ['-2','1e3','1.0000','0',''])assert.throws(()=>plan({...base,requestExact}));});
test('idempotency evidence key is mandatory, not proof of persisted deduplication',()=>{assert.throws(()=>plan({...base,idempotencyKey:'x'}),/IDEMPOTENCY/);const r=plan(base);assert.equal(r.idempotencyKey,base.idempotencyKey);assert.equal(r.persisted,false);});

test('pending in-flight receipts reduce safe intake without falsely posting them',()=>{
  const r=plan({...base,pendingOtherReceiptExact:'2.000',requestExact:'1.000'});
  assert.equal(r.outstandingAfterExact,'2.750');
  assert.equal(r.availableForFurtherReceiptExact,'0.750');
  assert.equal(r.nextOrderStatus,'partially_received');
  assert.equal(r.persisted,false);
});
test('rejects overreceipt after counting other pending confirmations',()=>{
  assert.throws(()=>plan({...base,pendingOtherReceiptExact:'2.000',requestExact:'1.751'}),/OVER_RECEIPT/);
  assert.throws(()=>plan({...base,pendingOtherReceiptExact:'3.751'}),/OVER_RECEIPT/);
});
test('pending receipt snapshot is required; callers cannot silently assume none',()=>{
  const {pendingOtherReceiptExact,...withoutPending}=base;
  assert.throws(()=>plan(withoutPending),/QUANTITY_INVALID/);
});
