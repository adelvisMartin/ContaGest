import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePurchaseReception as check} from '../backend/src/modules/procurement/purchase-reception-preflight.mjs';
const base={tenantId:'tenant-a',orderTenantId:'tenant-a',orderId:'order-1',receiptOrderId:'order-1',
lineId:'line-1',receiptLineId:'line-1',orderStatus:'confirmed',orderedExact:'4.000000',
receivedExact:'1.500000',pendingOtherReceiptExact:'0.500000',requestedExact:'1.250001'};
const go=patch=>check({...base,...patch});
test('precise partial receipt preserves remaining and no writes',()=>{
 const out=go();assert.equal(out.outstandingAfterExact,'0.749999');
 assert.equal(out.requestedExact,'1.250001');assert.equal(out.persisted,false);
 assert.equal(out.stockMovementAuthorized,false);assert.equal(out.accountsPayableAuthorized,false);assert.ok(Object.isFrozen(out));
});
test('remaining zero is only a projection pending commit',()=>assert.equal(go({requestedExact:'2.000000'}).fullyReceivedWhenPendingSettled,true));
test('no receipt beyond order amount including pending receipts',()=>assert.throws(()=>go({requestedExact:'2.000001'}),/OVERRECEIPT/));
test('reject repeat when order quantity consumed already',()=>assert.throws(()=>go({receivedExact:'4',pendingOtherReceiptExact:'0',requestedExact:'1'}),/OVERRECEIPT/));
test('reject line/order cross identity',()=>{assert.throws(()=>go({receiptLineId:'line-b'}),/SCOPE_INVALID/);assert.throws(()=>go({receiptOrderId:'other'}),/SCOPE_INVALID/);});
test('reject tenant spoof and invalid identifiers',()=>{assert.throws(()=>go({orderTenantId:'tenant-b'}),/SCOPE_INVALID/);assert.throws(()=>go({orderId:' '}),/SCOPE_INVALID/);});
test('cannot receive draft, cancelled or fulfilled order',()=>{for(const status of ['draft','cancelled','received','rejected'])assert.throws(()=>go({orderStatus:status}),/NOT_RECEIVABLE/);});
test('reject negatives floats exponents zero and excessive decimals',()=>{for(const v of ['-1','1e2','0','1.1234567',2,'01'])assert.throws(()=>go({requestedExact:v}),/DECIMAL|OVERRECEIPT/);});
test('reject inconsistent prior received and pending totals',()=>{assert.throws(()=>go({receivedExact:'5'}),/OVERRECEIPT/);assert.throws(()=>go({pendingOtherReceiptExact:'3'}),/OVERRECEIPT/);});
test('thousandth exactness no floating loss',()=>assert.equal(go({orderedExact:'0.000003',receivedExact:'0.000001',pendingOtherReceiptExact:'0.000001',requestedExact:'0.000001'}).outstandingAfterExact,'0.000000'));
