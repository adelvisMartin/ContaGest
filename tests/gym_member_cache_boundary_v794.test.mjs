import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGymMemberHome as view} from '../frontend/src/utils/gymMemberHomeReadModel.mjs';
const now='2026-10-16T15:00:00.000Z';
const row=(id)=>({id,tenantId:'T1',memberId:'M1',title:'Class A',status:'scheduled',email:'sensitive@example.test',accessToken:'hidden'});
const base=()=>({sessionTenantId:'T1',sessionUserId:'U1',memberTenantId:'T1',memberUserId:'U1',memberId:'M1',serverVerified:true,fetchedAt:'2026-10-16T14:58:00.000Z',now,maxAgeSeconds:300,membership:{tenantId:'T1',memberId:'M1',status:'active',diagnosis:'never-show'},classes:[row('C1')],routines:[],progress:[]});
const err=(patch,code)=>assert.throws(()=>view({...base(),...patch}),e=>e?.code===code);
test('#794 current scoped snapshot is immutable, explicit and read-only',()=>{
const x=view(base());assert.equal(x.freshness,'fresh');assert.equal(x.offlineReadOnly,true);assert.equal(x.offlineWorkoutQueueOwner,'#797');assert.equal(x.offlineWorkoutWritesEnabled,false);assert.equal(x.membership.usableForAccessDecision,false);assert.ok(Object.isFrozen(x.classes[0]));});
test('#794 stale membership is never treated as online eligibility',()=>{
const x=view({...base(),fetchedAt:'2026-10-15T14:00:00.000Z'});assert.equal(x.freshness,'stale');assert.equal(x.revalidateBeforeAccess,true);});
test('#794 cross-tenant and cross-user payloads are rejected',()=>{
err({memberTenantId:'T2'},'SCOPE_OR_SOURCE_UNVERIFIED');err({memberUserId:'U2'},'SCOPE_OR_SOURCE_UNVERIFIED');err({serverVerified:false},'SCOPE_OR_SOURCE_UNVERIFIED');err({classes:[{...row('C1'),tenantId:'T2'}]},'ROW_SCOPE_MISMATCH');err({progress:[{...row('C2'),memberId:'M2'}]},'ROW_SCOPE_MISMATCH');});
test('#794 local cache cannot inject clinical notes, tokens or member personal data',()=>{
const serialized=JSON.stringify(view(base()));for(const secret of ['sensitive@example.test','hidden','never-show'])assert.ok(!serialized.includes(secret));});
test('#794 invalid/duplicate rows and oversized collections fail closed',()=>{
err({classes:[row('C1'),row('C1')]},'DUPLICATE_ROW');err({classes:Array.from({length:251},(_,i)=>row('C'+i))},'COLLECTION_INVALID');err({membership:{...base().membership,tenantId:'T2'}},'MEMBERSHIP_SCOPE_MISMATCH');});
test('#794 future snapshots and malformed timestamps cannot be considered fresh',()=>{
err({fetchedAt:'2026-10-17T14:00:00.000Z'},'FUTURE_SNAPSHOT');err({now:'2026-02-30T12:00:00.000Z'},'TIME_INVALID');err({maxAgeSeconds:-1},'AGE_POLICY_INVALID');});
