import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePurchaseReceipt} from '../backend/src/modules/purchases/purchase-receipt-preflight.ts';
const A='cb0054f7-ef51-4580-888a-087701fca814';
const base={
  tenantId:A,actorTenantId:A,orderTenantId:A,
  orderId:'130849ad-a46d-5adb-a286-2774fd36bfac',
  lineId:'2e01330b-5d9b-5f71-8b1f-83c065c0c9ad',
  status:'partially_received',expectedRevision:2,
  orderedExact:'3.000',alreadyReceivedExact:'2.000',
  pendingOtherReceiptExact:'0.000',requestExact:'1.000',
  idempotencyKey:'receipt-20261016-one'
};
test('#757 finished line does not authorize globally closing a multi-line PO',()=>{
  const result=preparePurchaseReceipt(base);
  assert.equal(result.nextLineReceiptStatus,'received');
  assert.equal(result.nextOrderStatus,'received'); // legacy hint, not authoritative
  assert.equal(result.orderWideStatusAuthorized,false);
  assert.equal(result.requiresOrderWideStatusReconciliation,true);
  assert.equal(result.inventoryMovementAuthorized,false);
  assert.equal(result.supplierInvoiceAuthorized,false);
});
test('#757 partly received line also requires order-wide status reconciliation',()=>{
  const result=preparePurchaseReceipt({...base,requestExact:'0.250'});
  assert.equal(result.nextLineReceiptStatus,'partially_received');
  assert.equal(result.orderWideStatusAuthorized,false);
});
test('#757 received status cannot conceal pending other receipts',()=>{
  assert.throws(()=>preparePurchaseReceipt({...base,pendingOtherReceiptExact:'0.001'}),/OVER_RECEIPT/);
});
test('#757 explicit transaction and no persistent authorization is unchanged',()=>{
  const result=preparePurchaseReceipt(base);
  assert.equal(result.requiresTenantScopedSerializableTransaction,true);
  assert.equal(result.persisted,false);
  assert.ok(Object.isFrozen(result));
});
