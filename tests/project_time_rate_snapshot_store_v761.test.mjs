import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureApprovedTimeRateSnapshot,projectTimeSnapshotId,SnapshotNotFound,SnapshotForbidden,SnapshotConflict} from '../backend/src/modules/projects/time-entry-rate-snapshot-store.js';
const TENANT='cb0054f7-ef51-4580-888a-087701fca814';
const PROJECT='130849ad-a46d-5adb-a286-2774fd36bfac';
const TASK='2e01330b-5d9b-5f71-8b1f-83c065c0c9ad';
const CLIENT='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const MEMBER='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const MANAGER='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const ENTRY='d04e6b97-539c-5a63-91b7-7e02fd5c929a';
const rateKey=createHash('sha256').update('contagest:project-rate-card:v761\0')
 .update(TENANT.toLowerCase()).update('\0').update(PROJECT.toLowerCase())
 .update('\0').update(MEMBER.toLowerCase()).update('\0').update('1').digest().subarray(0,16);
rateKey[6]=(rateKey[6]&15)|80;rateKey[8]=(rateKey[8]&63)|128;
const rh=rateKey.toString('hex');
const RATE=[rh.slice(0,8),rh.slice(8,12),rh.slice(12,16),rh.slice(16,20),rh.slice(20)].join('-');
const parent=(o={})=>({id:PROJECT,tenantId:TENANT,moduleSlug:'project-workspace-v761',status:'active',payload:{schemaVersion:1,managerId:MANAGER,clientId:CLIENT},...o});
const task=(o={})=>({id:TASK,tenantId:TENANT,moduleSlug:'project-task-v761',status:'in_progress',payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,assigneeId:MEMBER},...o});
const entry=(o={})=>({id:ENTRY,tenantId:TENANT,moduleSlug:'project-time-entry-v761',status:'approved',payload:{schemaVersion:1,projectId:PROJECT,taskId:TASK,clientId:CLIENT,memberId:MEMBER,source:'manual',durationMinutes:60,billable:false,linkedInvoiceId:null,revision:2,approvedBy:MANAGER,approvedAt:'2026-10-16T12:00:00.000Z',startedAtUtc:'2026-10-15T12:00:00.000Z',endedAtUtc:'2026-10-15T13:00:00.000Z'},createdAt:new Date(),updatedAt:new Date(),...o});
const rate=(o={})=>({id:RATE,tenantId:TENANT,moduleSlug:'project-rate-card-v761',status:'fixed',payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,memberId:MEMBER,revision:1,hourlyRateExact:'100.25',currency:'USD',effectiveFromUtc:'2026-10-01T00:00:00.000Z'},...o});
const run=(db,override={})=>captureApprovedTimeRateSnapshot({db,tenantId:TENANT,actorId:MANAGER,projectId:PROJECT,taskId:TASK,entryId:ENTRY,expectedRevision:2,...override});
function mock({p=parent(),t=task(),e=entry(),rates=[rate()],missingManager=false,missingMember=false,missingClient=false,pkConflict=false,serialConflict=false,auditFails=false}={}){
 const events=[],committed=[];
 const db={$transaction:async(fn,config)=>{
  events.push(['tx',config]);const writes=[];
  const tx={moduleRecord:{findFirst:async({where})=>{events.push(['find',where]);return where.moduleSlug==='project-workspace-v761'?p:where.moduleSlug==='project-task-v761'?t:e;},
   findMany:async(query)=>{events.push(['rates',query]);return rates;},
   create:async({data})=>{events.push(['create',data]);if(pkConflict)throw Object.assign(Error('duplicate'),{code:'P2002'});if(serialConflict)throw Object.assign(Error('serialization'),{code:'P2034'});writes.push(data);return {...data,createdAt:new Date()};}},
   userProfile:{findFirst:async({where})=>where.id===MANAGER?(missingManager?null:{id:MANAGER,tenantId:TENANT}):(missingMember?null:{id:MEMBER,tenantId:TENANT})},
   client:{findFirst:async()=>missingClient?null:{id:CLIENT,tenantId:TENANT}},
   auditLog:{create:async({data})=>{events.push(['audit',data]);if(auditFails)throw Error('AUDIT_FAIL');}}
  };
  const out=await fn(tx);committed.push(...writes);return out;
 }};return{db,events,committed};
}
test('writes one immutable snapshot with deterministic ID and audit in Serializable transaction',async()=>{const f=mock();const out=await run(f.db);assert.equal(f.committed.length,1);assert.equal(out.id,projectTimeSnapshotId(TENANT,ENTRY));assert.equal(out.hourlyRateExact,'100.25');assert.equal(out.billableAuthorized,false);assert.equal(out.invoiceAuthorized,false);assert.equal(f.committed[0].payload.rateCardRevision,1);assert.equal(f.committed[0].payload.linkedInvoiceId,null);assert.deepEqual(f.events[0],['tx',{isolationLevel:'Serializable'}]);assert.equal(f.events.filter(x=>x[0]==='audit').length,1);});
test('derives stable tenant-scoped identifier and refuses bad identifiers',()=>{assert.notEqual(projectTimeSnapshotId(TENANT,ENTRY),projectTimeSnapshotId(MEMBER,ENTRY));assert.throws(()=>projectTimeSnapshotId('invalid',ENTRY));assert.match(projectTimeSnapshotId(TENANT,ENTRY),/^[0-9a-f-]{36}$/);});
test('prevents self approval and unauthorized manager',async()=>{for(const x of [{p:parent({payload:{schemaVersion:1,managerId:MEMBER,clientId:CLIENT}})},{missingManager:true}]){const f=mock(x);await assert.rejects(run(f.db),SnapshotForbidden);assert.equal(f.committed.length,0);}});
test('rejects tenant foreign project and wrong task binding',async()=>{for(const x of [{p:parent({tenantId:MEMBER})},{t:task({tenantId:MEMBER})},{t:task({payload:{...task().payload,projectId:ENTRY}})},{p:null},{t:null}]){const f=mock(x);await assert.rejects(run(f.db));assert.equal(f.committed.length,0);}});
test('requires active client, assigned member and active project',async()=>{for(const x of [{missingMember:true},{missingClient:true},{p:parent({status:'archived'})}]){const f=mock(x);await assert.rejects(run(f.db));assert.equal(f.committed.length,0);}});
test('rejects draft, mismatched revision, wrong approved-by or linked invoice',async()=>{for(const e of [entry({status:'submitted'}),entry({payload:{...entry().payload,revision:3}}),entry({payload:{...entry().payload,approvedBy:MEMBER}}),entry({payload:{...entry().payload,linkedInvoiceId:ENTRY}})]){const f=mock({e});await assert.rejects(run(f.db));assert.equal(f.committed.length,0);}});
test('rejects rate card of wrong client/tenant or future-only rate',async()=>{for(const rates of [[rate({tenantId:MEMBER})],[rate({payload:{...rate().payload,clientId:MEMBER}})],[rate({payload:{...rate().payload,effectiveFromUtc:'2026-11-01T00:00:00.000Z'}})]]){const f=mock({rates});await assert.rejects(run(f.db));assert.equal(f.committed.length,0);}});
test('does not double-create on duplicate key or serialization collision',async()=>{for(const flags of [{pkConflict:true},{serialConflict:true}]){const f=mock(flags);await assert.rejects(run(f.db),SnapshotConflict);assert.equal(f.committed.length,0);}});
test('audit failure rolls back snapshot',async()=>{const f=mock({auditFails:true});await assert.rejects(run(f.db),/AUDIT_FAIL/);assert.equal(f.committed.length,0);});
test('rate query is scoped and limited to 1025 records to fail closed',async()=>{const f=mock();await run(f.db);const q=f.events.find(x=>x[0]==='rates')[1];assert.equal(q.take,1025);assert.equal(q.where.tenantId,TENANT);assert.deepEqual(q.where.AND,[{payload:{path:['projectId'],equals:PROJECT}},{payload:{path:['memberId'],equals:MEMBER}}]);});
test('wrong revision and malformed identifiers fail before transaction',async()=>{const f=mock();await assert.rejects(run(f.db,{expectedRevision:1}));await assert.rejects(run(f.db,{entryId:'bad'}));assert.equal(f.events.length,0);});
test('refuses oversized rate history',async()=>{const f=mock({rates:Array(1025).fill(rate())});await assert.rejects(run(f.db),SnapshotConflict);assert.equal(f.committed.length,0);});
