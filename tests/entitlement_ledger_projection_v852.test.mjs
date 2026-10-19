import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEntitlementLedger,EntitlementProjectionError} from '../backend/src/modules/entitlements/entitlement-ledger-projection.mjs';
const id=n=>String(n).padStart(8,'0')+'-134d-4c86-a116-884e04d6c82a';
const base={tenantId:id(1),entitlementId:id(2),beneficiaryId:id(3)};
const row=(sequence,type,quantity='1.000')=>({...base,id:id(20+sequence),sequence,type,quantity,effectKey:'effect:unique:'+sequence});
const project=events=>projectEntitlementLedger({...base,events});
const fail=(events,code)=>assert.throws(()=>project(events),e=>e instanceof EntitlementProjectionError&&e.code===code);
test('grant only returns immutable nontransactional balance',()=>{const p=project([row(1,'GRANT','2.001')]);assert.equal(p.remaining,'2.001');assert.equal(p.readOnly,true);assert.equal(p.transactionalAuthority,false);assert.ok(Object.isFrozen(p));});
test('exact integer-thousandth spend and restore',()=>{const p=project([row(1,'GRANT','2.001'),row(2,'CONSUME','1.002'),row(3,'RELEASE','0.001')]);assert.equal(p.remaining,'1.000');assert.equal(p.consumedOrRevoked,'1.001');});
test('refund and expiry are negative rights, not refund money',()=>{assert.equal(project([row(1,'GRANT','2'),row(2,'REFUND_REVOKE','1'),row(3,'EXPIRE','1')]).remaining,'0.000');});
test('reject debit of last credit',()=>fail([row(1,'GRANT','1'),row(2,'CONSUME','1.001')],'INSUFFICIENT_BALANCE'));
test('release cannot mint additional rights',()=>fail([row(1,'GRANT','1'),row(2,'RELEASE','1')],'EXCEEDS_GRANT'));
test('refuse tenant and beneficiary cross-scope rows',()=>{for(const field of ['tenantId','entitlementId','beneficiaryId'])fail([row(1,'GRANT'),{...row(2,'CONSUME'),[field]:id(12)}],'SCOPE_MISMATCH');});
test('reject retry duplicate effect key and event UUID',()=>{fail([row(1,'GRANT'),{...row(2,'CONSUME'),effectKey:'effect:unique:1'}],'DUPLICATE_OR_INVALID_EFFECT');fail([row(1,'GRANT'),{...row(2,'CONSUME'),id:id(21)}],'DUPLICATE_EVENT');});
test('reject nonmonotonic sequence and multiple grant',()=>{fail([row(1,'GRANT'),row(1,'CONSUME')],'DUPLICATE_EVENT');fail([row(1,'GRANT'),row(2,'GRANT')],'INVALID_GRANT');});
test('reject unknown event and malformed quantities',()=>{fail([row(1,'CREDIT','1')],'INVALID_TYPE');for(const q of ['0','1.2345','1e5','-1',0.1])fail([row(1,'GRANT',q)],'INVALID_QUANTITY');});
test('fail closed without a grant or with missing events',()=>{fail([row(1,'CONSUME')],'INSUFFICIENT_BALANCE');assert.throws(()=>project([]),/INVALID_EVENTS/);});

// #852 regression: a consumed right can be released, but expiration and refund
// revocation are not recoverable consumption. Otherwise a cancelled booking
// could silently restore an expired/refunded right.
test('RELEASE cannot resurrect REFUND_REVOKE or EXPIRE rights',()=>{
  for(const type of ['REFUND_REVOKE','EXPIRE']){
    fail([row(1,'GRANT','3'),row(2,type,'1'),row(3,'RELEASE','1')],'EXCEEDS_GRANT');
  }
});
test('RELEASE cannot exceed outstanding consumed units after prior release',()=>{
  fail([row(1,'GRANT','3'),row(2,'CONSUME','1'),row(3,'RELEASE','1'),row(4,'RELEASE','0.001')],'EXCEEDS_GRANT');
  fail([row(1,'GRANT','3'),row(2,'CONSUME','1'),row(3,'RELEASE','1.001')],'EXCEEDS_GRANT');
});
test('mixed CONSUME, refund and expire release only recoverable consumption',()=>{
  const events=[row(1,'GRANT','5'),row(2,'CONSUME','2'),row(3,'REFUND_REVOKE','1'),row(4,'EXPIRE','1'),row(5,'RELEASE','2')];
  const result=project(events);
  assert.equal(result.granted,'5.000');
  assert.equal(result.remaining,'3.000');
  assert.equal(result.consumedOrRevoked,'2.000');
  fail([...events,row(6,'RELEASE','0.001')],'EXCEEDS_GRANT');
});
test('fractional consumption can be restored exactly but never twice',()=>{
  const events=[row(1,'GRANT','1.003'),row(2,'CONSUME','0.003'),row(3,'RELEASE','0.002')];
  assert.equal(project(events).remaining,'1.002');
  assert.equal(project([...events,row(4,'RELEASE','0.001')]).remaining,'1.003');
  fail([...events,row(4,'RELEASE','0.002')],'EXCEEDS_GRANT');
});
