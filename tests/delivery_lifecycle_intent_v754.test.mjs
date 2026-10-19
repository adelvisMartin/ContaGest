import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDeliveryTransition} from '../backend/src/modules/fulfillment/delivery-lifecycle-intent.ts';
const params={tenantId:'A',actorTenantId:'A',deliveryId:'delivery-1',orderId:'order-1',currentStatus:'draft',action:'allocate',expectedRevision:1};
const go=patch=>prepareDeliveryTransition({...params,...patch});
const fail=fn=>assert.throws(fn,{message:'DELIVERY_LIFECYCLE_TRANSITION_INVALID'});
test('#754 lifecycle valid draft→allocate→pick→dispatch→delivered intents',()=>{
 let a=go({});assert.equal(a.to,'allocated');
 a=go({currentStatus:'allocated',action:'start_pick',expectedRevision:2});assert.equal(a.to,'picking');
 a=go({currentStatus:'picking',action:'dispatch',expectedRevision:3});assert.equal(a.to,'dispatched');
 a=go({currentStatus:'dispatched',action:'confirm_delivery',expectedRevision:4});
 assert.equal(a.to,'delivered');assert.equal(a.requiresAtomicStockEffect,true);assert.equal(a.stockConsumed,false);
});
test('#754 terminal states and invalid skipping are rejected',()=>{
 fail(()=>go({currentStatus:'draft',action:'confirm_delivery'}));
 fail(()=>go({currentStatus:'delivered',action:'cancel'}));
 fail(()=>go({currentStatus:'cancelled',action:'allocate'}));
 fail(()=>go({currentStatus:'allocated',action:'dispatch'}));
});
test('#754 cancellations demand outstanding reservation release where appropriate',()=>{
 const a=go({action:'cancel'});assert.equal(a.requiresReservationRelease,false);
 const b=go({currentStatus:'allocated',action:'cancel'});assert.equal(b.requiresReservationRelease,true);
 fail(()=>go({currentStatus:'dispatched',action:'cancel'}));
});
test('#754 cross-tenant actor and malformed identities are denied',()=>{
 fail(()=>go({actorTenantId:'B'}));fail(()=>go({tenantId:''}));fail(()=>go({deliveryId:'bad id'}));
});
test('#754 optimistic version intent rejects malformed revision',()=>{
 fail(()=>go({expectedRevision:0}));fail(()=>go({expectedRevision:1.5}));fail(()=>go({expectedRevision:Number.MAX_SAFE_INTEGER}));
 assert.equal(go({expectedRevision:50}).nextRevision,51);
});
test('#754 no actions directly authorize stock, ledger or invoice',()=>{
 const a=go({currentStatus:'dispatched',action:'confirm_delivery'});
 assert.equal(a.persisted,false);assert.equal(a.stockConsumed,false);assert.equal(a.ledgerAuthorized,false);assert.equal(a.invoiceAuthorized,false);
 assert.ok(Object.isFrozen(a));
});
