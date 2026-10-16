import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDentalLabFulfillment as plan} from '../backend/src/modules/finance/dental-lab-fulfillment-preflight.mjs';
const base=()=>({tenantId:'T1',actorTenantId:'T1',actorId:'staff1',patientId:'PAT1',labOrderId:'ORDER1',supplierId:'SUP1',
 sourceVerified:true,sourceSnapshotSha256:'a'.repeat(64),status:'sent',action:'start_production',
 expectedRevision:1,effectKey:'send-1',previousEffectKeys:[],reason:'Lab remake requested'});
const bad=(patch,code)=>assert.throws(()=>plan({...base(),...patch}),e=>e?.code===code);
test('#804 follows lab-order fulfillment lifecycle but does not create another clinical order',()=>{
 const steps=[['sent','start_production','in_production'],['in_production','receive','received'],['received','begin_fit_check','fit_check'],['fit_check','accept','accepted'],['accepted','deliver','delivered']];
 for(const [from,action,to] of steps){const v=plan({...base(),status:from,action});assert.equal(v.to,to);assert.equal(v.persisted,false);assert.equal(v.invoiceCreated,false);}
});
test('#804 rework is a revision, not an overwrite of original clinical snapshot',()=>{
 for(const [status,action,to] of [['fit_check','request_rework','rework_requested'],['rework_requested','redeliver','redelivered'],['redelivered','begin_fit_check','fit_check']]){
  const v=plan({...base(),status,action});assert.equal(v.to,to);assert.equal(v.sourceSnapshotSha256,'a'.repeat(64));assert.equal(v.requiresVersionedAppendOnlyEvidence,true);}
});
test('#804 tenant and server-owned order references are mandatory',()=>{
 bad({actorTenantId:'T2'},'SOURCE_OR_TENANT_INVALID');bad({sourceVerified:false},'SOURCE_OR_TENANT_INVALID');
 bad({supplierId:''},'IDENTITY_INVALID');bad({patientId:null},'IDENTITY_INVALID');bad({sourceSnapshotSha256:'fake'},'SNAPSHOT_INVALID');
});
test('#804 terminal states and JS inherited operations cannot escalate lifecycle',()=>{
 for(const [status,action] of [['delivered','start_production'],['cancelled','deliver'],['accepted','request_rework'],['sent','deliver'],['__proto__','constructor'],['sent','toString']])
  bad({status,action},'TRANSITION_FORBIDDEN');
});
test('#804 duplicate effect key and malformed history fail closed',()=>{
 bad({previousEffectKeys:['send-1']},'EFFECT_REPLAY');bad({previousEffectKeys:['x','x']},'EFFECT_HISTORY_INVALID');
 bad({previousEffectKeys:['x',12]},'EFFECT_HISTORY_INVALID');bad({expectedRevision:0},'REVISION_INVALID');
});
test('#804 cancellations/rework demand operator reason and immutable history',()=>{
 bad({action:'cancel',reason:'bad'},'REASON_REQUIRED');bad({status:'fit_check',action:'request_rework',reason:'no'},'REASON_REQUIRED');
 const result=plan({...base(),status:'in_production',action:'cancel'});
 assert.equal(result.to,'cancelled');assert.equal(result.clinicalEvidenceModified,false);assert.equal(result.requiresTenantScopedCAS,true);
});
test('#804 same input yields immutable non-posting intent',()=>{
 const a=plan(base());assert.deepEqual(a,plan(base()));assert.ok(Object.isFrozen(a));assert.equal(a.notificationSent,false);
 assert.equal(a.inventoryModified,false);assert.equal(a.requiresSameTenantOrderSupplierPatient,true);
});
