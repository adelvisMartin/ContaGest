import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEntitlementBalance } from '../backend/src/modules/entitlements/entitlement-ledger-policy.ts';

const ent = { tenantId:'A', entitlementId:'e1', payerId:'payer-1',
  beneficiaryId:'recipient-2', targetId:'service-1',
  validFrom:'2026-01-01T00:00:00Z', validUntil:'2027-01-01T00:00:00Z' };
const evt = (kind, effectKey, units, at='2026-06-01T00:00:00Z', other={}) =>
  ({tenantId:'A', entitlementId:'e1',kind,effectKey,sourceId:'order-1',units,occurredAt:at,...other});
const fail = fn=>assert.throws(fn,{message:'ENTITLEMENT_LEDGER_EVENT_INVALID'});
test('#852 grant, consume, partial release, revoke generate derived balance',()=>{
  const r=deriveEntitlementBalance(ent,[
    evt('GRANT','grant:1',10),
    evt('CONSUME','book:1',4,'2026-06-02T00:00:00Z'),
    evt('RELEASE','release:1',2,'2026-06-03T00:00:00Z',{releaseOfEffectKey:'book:1'}),
    evt('REVOKE','refund:1',3,'2026-06-04T00:00:00Z')
  ]);
  assert.equal(r.availableUnits,5); assert.equal(r.netConsumedUnits,2);
  assert.equal(r.grantedUnits,10);assert.equal(r.revokedUnits,3);
  assert.equal(r.payerId,'payer-1');assert.equal(r.beneficiaryId,'recipient-2');
});
test('#852 exact idempotent effect replay does not double consume',()=>{
  const consume=evt('CONSUME','book:1',2,'2026-06-02T00:00:00Z');
  const r=deriveEntitlementBalance(ent,[evt('GRANT','grant:1',4),consume,consume]);
  assert.equal(r.availableUnits,2);assert.equal(r.uniqueEvents,2);
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','grant:1',4),consume,{...consume,units:3}]));
});
test('#852 no cross-tenant or wrong entitlement consumption',()=>{
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',2),{...evt('CONSUME','c1',1),tenantId:'B'}]));
  fail(()=>deriveEntitlementBalance(ent,[{...evt('GRANT','g1',2),entitlementId:'other'}]));
});
test('#852 insufficient credits and phantom release are fail closed',()=>{
  fail(()=>deriveEntitlementBalance(ent,[evt('CONSUME','c1',1)]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',1),evt('CONSUME','c1',2)]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',2),evt('RELEASE','r1',1,undefined,{releaseOfEffectKey:'missing'})]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',2),evt('CONSUME','c1',1),evt('RELEASE','r1',2,undefined,{releaseOfEffectKey:'c1'})]));
});
test('#852 rejects expired usage, out-of-order, invalid amount and malformed time',()=>{
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',2),evt('CONSUME','c1',1,'2027-01-01T00:00:00Z')]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',2,'2026-06-02T00:00:00Z'),evt('CONSUME','c1',1,'2026-06-01T00:00:00Z')]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',-2)]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',1.5)]));
  fail(()=>deriveEntitlementBalance(ent,[evt('GRANT','g1',2,'2026-02-30T00:00:00Z')]));
});
test('#852 no balance field in entitlement snapshot; counter is never authority',()=>{
  const r=deriveEntitlementBalance(ent,[evt('GRANT','g1',5)]);
  assert.equal(r.availableUnits,5);assert.equal(r.mode,'NON_PERSISTING_LEDGER_PROJECTION');
  assert.ok(Object.isFrozen(r));assert.equal('remainingUses' in r,false);
});
test('#852 fractional UTC seconds obey numeric chronological and expiration boundaries',()=>{
  const snapshot={...ent,validUntil:'2026-06-01T00:00:00.200Z'};
  const valid=deriveEntitlementBalance(snapshot,[
    evt('GRANT','g',3,'2026-06-01T00:00:00Z'),
    evt('CONSUME','c',1,'2026-06-01T00:00:00.100Z')
  ]);
  assert.equal(valid.availableUnits,2);
  fail(()=>deriveEntitlementBalance(snapshot,[
    evt('GRANT','g',3,'2026-06-01T00:00:00Z'),
    evt('CONSUME','c',1,'2026-06-01T00:00:00.200Z')
  ]));
});
