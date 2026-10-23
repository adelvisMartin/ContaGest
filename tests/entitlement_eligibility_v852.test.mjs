import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveEntitlementEligibility as resolve,EntitlementEligibilityError} from '../backend/src/modules/entitlements/entitlement-eligibility-policy.mjs';
const id=n=>String(n).padStart(8,'0')+'-134d-4c86-a116-884e04d6c82a';
const tenantId=id(1),beneficiaryId=id(2),serviceId=id(3),categoryId=id(4),locationId=id(5);
const time='2026-10-22T10:00:00Z';
const right=(n=11,values={})=>({id:id(n),tenantId,beneficiaryId,version:1,status:'active',unlimited:false,
  remaining:'3.000',lastSequence:1,scope:'ALL',scopeId:null,locationId:null,
  validFrom:'2026-10-01T00:00:00Z',validUntil:'2026-11-01T00:00:00Z',priority:0,...values});
const query=(rights,values={})=>({tenantId,beneficiaryId,serviceId,categoryId,locationId,quantity:'1.000',instant:time,entitlements:rights,...values});
const denied=(fn,code)=>assert.throws(fn,e=>e instanceof EntitlementEligibilityError&&e.code===code);
test('select active, valid, sufficient right without authorizing a write',()=>{
  const r=resolve(query([right()]));assert.equal(r.decision,'ELIGIBLE_PREVIEW');
  assert.equal(r.entitlementId,id(11));assert.equal(r.writeAuthorized,false);
  assert.equal(r.consumed,false);assert.ok(Object.isFrozen(r));
});
test('insufficient/expired/revoked/foreign-location are ineligible',()=>{
  for(const changes of [{remaining:'0.999'},{status:'revoked'},{locationId:id(9)},
    {validUntil:time},{validFrom:'2026-10-22T11:00:00Z'}])
    assert.equal(resolve(query([right(11,changes)])).decision,'NO_MATCHING_RIGHT');
});
test('service/category scopes and tenant location must match',()=>{
  assert.equal(resolve(query([right(11,{scope:'SERVICE',scopeId:serviceId})])).decision,'ELIGIBLE_PREVIEW');
  assert.equal(resolve(query([right(11,{scope:'SERVICE',scopeId:id(99)})])).decision,'NO_MATCHING_RIGHT');
  assert.equal(resolve(query([right(11,{scope:'CATEGORY',scopeId:categoryId,locationId})])).decision,'ELIGIBLE_PREVIEW');
  assert.equal(resolve(query([right(11,{scope:'CATEGORY',scopeId:id(99)})])).decision,'NO_MATCHING_RIGHT');
});
test('priority wins; earlier expiry and stable ID break ties deterministically',()=>{
  const early=right(12,{validUntil:'2026-10-25T00:00:00Z'});
  const higher=right(13,{priority:1});
  assert.equal(resolve(query([early,right(),higher])).entitlementId,id(13));
  assert.equal(resolve(query([right(),early])).entitlementId,id(12));
  assert.equal(resolve(query([right(12),right(11)])).entitlementId,id(11));
});
test('unlimited must not smuggle mutable remaining counters',()=>{
  assert.equal(resolve(query([right(11,{unlimited:true,remaining:null,lastSequence:null})])).decision,'ELIGIBLE_PREVIEW');
  denied(()=>resolve(query([right(11,{unlimited:true,remaining:'100.000',lastSequence:null})])),'INVALID_SNAPSHOT');
});
test('reject cross-tenant/beneficiary and duplicate rights instead of silently skipping',()=>{
  denied(()=>resolve(query([right(11,{tenantId:id(99)})])),'SCOPE_MISMATCH');
  denied(()=>resolve(query([right(11,{beneficiaryId:id(99)})])),'SCOPE_MISMATCH');
  denied(()=>resolve(query([right(),right()])),'DUPLICATE_RIGHT');
});
test('reject floating-point, partial histories, invalid dates and protected fields',()=>{
  denied(()=>resolve(query([right()],{quantity:0.1})),'INVALID_QUANTITY');
  denied(()=>resolve(query([right()],{quantity:'1e5'})),'INVALID_QUANTITY');
  denied(()=>resolve(query([right()],{instant:'2026-02-30T01:00:00Z'})),'INVALID_INSTANT');
  denied(()=>resolve(query([right(11,{balance:'999.000'})])),'SCOPE_MISMATCH');
  const sparse=[];sparse.length=1;
  denied(()=>resolve(query(sparse)),'PARTIAL_HISTORY');
});
