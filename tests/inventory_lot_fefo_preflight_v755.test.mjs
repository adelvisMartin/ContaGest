import test from 'node:test';import assert from 'node:assert/strict';
import {prepareFefoAllocation as plan} from '../backend/src/modules/inventory/lot-fefo-preflight.ts';
const base={tenantId:'tenant-a',productId:'sku-a',locationId:'warehouse-a',requestedExact:'5',asOfDate:'2026-10-16'};
const lot=(id,availableExact,expiresOn,receivedAtUtc='2026-10-01T00:00:00.000Z')=>({id,tenantId:'tenant-a',productId:'sku-a',locationId:'warehouse-a',availableExact,expiresOn,receivedAtUtc,active:true});
test('earliest-expiring stock is selected first with exact six-place quantities',()=>{const r=plan({...base,lots:[lot('late','3','2027-01-01'),lot('soon','2.500001','2026-12-01')]});assert.deepEqual(r.lots,[{lotId:'soon',quantityExact:'2.500001'},{lotId:'late',quantityExact:'2.499999'}]);assert.equal(r.backorderExact,'0');assert.equal(r.persisted,false);});
test('expired, zero and inactive lots do not supply an order',()=>{const r=plan({...base,lots:[lot('expired','5','2026-10-15'),lot('zero','0',null),{...lot('inactive','5',null),active:false}]});assert.equal(r.allocatedExact,'0');assert.equal(r.backorderExact,'5');});
test('expiry exactly as-of day remains eligible',()=>{assert.equal(plan({...base,lots:[lot('today','5','2026-10-16')]}).allocatedExact,'5');});
test('FIFO ties and UUID-like ID sort are deterministic',()=>{const r=plan({...base,lots:[lot('z','4',null,'2026-10-02T00:00:00.000Z'),lot('b','2',null),lot('a','2',null)]});assert.deepEqual(r.lots.map(x=>x.lotId),['a','b','z']);});
test('foreign tenant, product, location or repeated lot rejects entire request',()=>{for(const patch of [{tenantId:'tenant-b'},{productId:'sku-b'},{locationId:'warehouse-b'}])assert.throws(()=>plan({...base,lots:[{...lot('a','2',null),...patch}]}),/SCOPE/);assert.throws(()=>plan({...base,lots:[lot('a','1',null),lot('a','2',null)]}),/SCOPE/);});
test('unsafe decimals and missing as-of day are rejected',()=>{for(const q of ['-1','1e5','1.1234567','0'])assert.throws(()=>plan({...base,requestedExact:q,lots:[]}));assert.throws(()=>plan({...base,asOfDate:'2026-02-30',lots:[]}));});
test('no reservation/ledger authority is granted',()=>{const r=plan({...base,lots:[lot('a','6',null)]});assert.equal(r.stockMovementAuthorized,false);assert.equal(Object.isFrozen(r),true);});

test('FEFO suggested lot quantities are immutable through the public result',()=>{
  const planResult=plan({...base,lots:[lot('a','3','2026-10-20'),lot('b','3','2026-10-21')]});
  assert.equal(Object.isFrozen(planResult),true);
  assert.equal(Object.isFrozen(planResult.lots),true);
  assert.ok(planResult.lots.every(Object.isFrozen));
  const before=JSON.stringify(planResult);
  assert.throws(()=>{planResult.lots[0].quantityExact='999';},TypeError);
  assert.throws(()=>{planResult.lots[0].lotId='foreign-lot';},TypeError);
  assert.equal(JSON.stringify(planResult),before);
});
test('FEFO empty allocations remain immutable without minting stock',()=>{
  const result=plan({...base,lots:[]});
  assert.equal(result.lots.length,0);
  assert.equal(Object.isFrozen(result.lots),true);
  assert.equal(result.allocatedExact,'0');
  assert.equal(result.backorderExact,'5');
});

// Historical as-of FEFO eligibility must ignore future-day lot receipts.
test('#755 ignores future-day lot receipts without inventing stock',()=>{
 const future=lot('future','5','2026-11-01','2026-10-17T00:00:00.000Z');
 const onDay=lot('today','3','2026-11-01','2026-10-16T23:59:59.999Z');
 const earlier=lot('old','4','2026-11-01','2026-10-15T00:00:00.000Z');
 const result=plan({...base,lots:[future,onDay,earlier]});
 assert.deepEqual(result.lots,[{lotId:'old',quantityExact:'4'},{lotId:'today',quantityExact:'1'}]);
 assert.equal(result.allocatedExact,'5');assert.equal(result.stockMovementAuthorized,false);
 const onlyFuture=plan({...base,lots:[future]});
 assert.equal(onlyFuture.allocatedExact,'0');assert.equal(onlyFuture.backorderExact,'5');
});
