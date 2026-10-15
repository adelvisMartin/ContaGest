import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeEntryDraft,listTimeEntryDrafts,timeEntryIdFromAttempt,validateTimeEntryDraft,
 PROJECT_TIME_ENTRY_SLUG,ProjectTimeEntryConflict,ProjectTimeEntryForbidden,
 ProjectTimeEntryNotFound} from '../backend/src/modules/projects/time-entry-record-store.ts';
const TENANT='cb0054f7-ef51-4580-888a-087701fca814';
const PROJECT='130849ad-a46d-5adb-a286-2774fd36bfac';
const TASK='2e01330b-5d9b-5f71-8b1f-83c065c0c9ad';
const CLIENT='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const ASSIGNEE='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const MANAGER='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const KEY='420728db-b4ad-46d4-aed5-a2cf74d48e8f';
const draft={source:'manual',startedAt:'2026-11-01T01:30:00-04:00',endedAt:'2026-11-01T01:30:00-05:00',recordedMinutes:60};
const parent=(changes={})=>({id:PROJECT,tenantId:TENANT,moduleSlug:'project-workspace-v761',status:'active',payload:{schemaVersion:1,clientId:CLIENT,managerId:MANAGER},...changes});
const taskRow=(changes={})=>({id:TASK,tenantId:TENANT,moduleSlug:'project-task-v761',status:'in_progress',payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,assigneeId:ASSIGNEE,creatorId:MANAGER},...changes});
const timeRow=(changes={})=>({id:'time-1',tenantId:TENANT,moduleSlug:PROJECT_TIME_ENTRY_SLUG,status:'draft',title:'Registro horario',payload:{schemaVersion:1,projectId:PROJECT,taskId:TASK,clientId:CLIENT,memberId:ASSIGNEE,source:'manual',startedAtUtc:'2026-11-01T05:30:00.000Z',endedAtUtc:'2026-11-01T06:30:00.000Z',durationMinutes:60,revision:1,billable:false,linkedInvoiceId:null,approvedAt:null,approvedBy:null},createdAt:new Date(),updatedAt:new Date(),...changes});
function fixture({p=parent(),t=taskRow(),actor={id:ASSIGNEE,tenantId:TENANT},client={id:CLIENT,tenantId:TENANT},auditFails=false,duplicate=false,serialization=false,rows=[timeRow()],overlaps=[]}={}){
 const events=[],persisted=[];
 const db={async $transaction(fn,opts){events.push(['txn',opts]);let queued=[];
 const tx={moduleRecord:{findFirst:async args=>{events.push(['find',args]);return args.where.moduleSlug==='project-workspace-v761'?p:t;},create:async args=>{events.push(['create',args]);if(duplicate)throw Object.assign(new Error('dup'),{code:'P2002'});if(serialization)throw Object.assign(new Error('serial'),{code:'P2034'});queued.push(args.data);return timeRow({id:args.data.id,tenantId:args.data.tenantId,moduleSlug:args.data.moduleSlug,status:args.data.status,payload:args.data.payload});},findMany:async args=>{events.push([args.where.AND?'overlap':'list',args]);return args.where.AND?overlaps:rows;}},userProfile:{findFirst:async args=>{events.push(['actor',args]);return actor;}},client:{findFirst:async args=>{events.push(['client',args]);return client;}},auditLog:{create:async args=>{events.push(['audit',args]);if(auditFails)throw new Error('AUDIT_FAILED');}}};
 const result=await fn(tx);persisted.push(...queued);return result;}};
 return {db,events,persisted};
}
const create=(db,overrides={})=>createTimeEntryDraft({db,tenantId:TENANT,actorId:ASSIGNEE,projectId:PROJECT,taskId:TASK,idempotencyKey:KEY,draft,...overrides});
const list=(db,overrides={})=>listTimeEntryDrafts({db,tenantId:TENANT,projectId:PROJECT,taskId:TASK,actorId:ASSIGNEE,...overrides});

test('persist one exact-DST manual draft with audited SERIALIZABLE transaction and no billing',async()=>{
 const {db,events,persisted}=fixture(); const record=await create(db);
 assert.equal(record.durationMinutes,60);assert.equal(record.status,'draft');assert.equal(record.billable,false);
 assert.equal(record.startedAtUtc,'2026-11-01T05:30:00.000Z');assert.equal(record.endedAtUtc,'2026-11-01T06:30:00.000Z');
 assert.equal(persisted.length,1);assert.equal(persisted[0].id,timeEntryIdFromAttempt(TENANT,PROJECT,TASK,KEY));
 assert.equal(persisted[0].payload.billable,false);assert.equal(persisted[0].payload.linkedInvoiceId,null);
 assert.deepEqual(events[0],['txn',{isolationLevel:'Serializable'}]);
 assert.equal(events.find(e=>e[0]==='audit')[1].data.action,'project.time-entry.create');
 assert.equal(events.find(e=>e[0]==='client')[1].where.tenantId,TENANT);
 assert.equal(events.find(e=>e[0]==='actor')[1].where.status,'active');
});
test('reject fake actor, client, task, project across tenants before write',async()=>{
 for (const cfg of [{p:parent({tenantId:'other'})},{t:taskRow({tenantId:'other'})},
  {t:taskRow({payload:{...taskRow().payload,projectId:'other'}})},
  {actor:{id:ASSIGNEE,tenantId:'other'}},{client:{id:CLIENT,tenantId:'other'}},
  {p:null},{t:null}]){
  const f=fixture(cfg);await assert.rejects(create(f.db));assert.equal(f.persisted.length,0);
 }
});
test('only active assignee can author hours for in-progress task',async()=>{
 for (const cfg of [{p:parent({status:'archived'})},{p:parent({status:'planning'})},
 {t:taskRow({status:'todo'})},{t:taskRow({status:'done'})},
 {t:taskRow({payload:{...taskRow().payload,assigneeId:MANAGER}})}]){
  const f=fixture(cfg);await assert.rejects(create(f.db));assert.equal(f.persisted.length,0);
 }
 const f=fixture();await assert.rejects(create(f.db,{actorId:MANAGER}),ProjectTimeEntryForbidden);
});
test('audit failure rolls back the draft insert',async()=>{
 const f=fixture({auditFails:true});await assert.rejects(create(f.db),/AUDIT_FAILED/);assert.equal(f.persisted.length,0);
});
test('duplicate and serializable conflicts fail with no second draft',async()=>{
 for (const flags of [{duplicate:true},{serialization:true}]){
  const f=fixture(flags);await assert.rejects(create(f.db),ProjectTimeEntryConflict);assert.equal(f.persisted.length,0);
 }
});
test('idempotency key isolates tenant, project and task',()=>{
 assert.equal(timeEntryIdFromAttempt(TENANT,PROJECT,TASK,KEY),timeEntryIdFromAttempt(TENANT,PROJECT,TASK,KEY.toUpperCase()));
 assert.notEqual(timeEntryIdFromAttempt(TENANT,PROJECT,TASK,KEY),timeEntryIdFromAttempt(TENANT,PROJECT,ASSIGNEE,KEY));
 assert.notEqual(timeEntryIdFromAttempt(TENANT,PROJECT,TASK,KEY),timeEntryIdFromAttempt(TENANT,TASK,TASK,KEY));
 for (const key of ['invalid','00000000-0000-0000-0000-000000000000',null])assert.throws(()=>timeEntryIdFromAttempt(TENANT,PROJECT,TASK,key),/IDEMPOTENCY_INVALID/);
});
test('manual-only strict draft blocks forged tenant, billing and timer authority',()=>{
 assert.deepEqual(validateTimeEntryDraft(draft),draft);
 for (const field of ['tenantId','memberId','projectId','taskId','rate','billable','approvedBy','linkedInvoiceId','revision','status']){
  assert.throws(()=>validateTimeEntryDraft({...draft,[field]:'attacker'}),/FIELD_FORBIDDEN/);
 }
 for (const invalid of [{...draft,source:'timer'},{...draft,source:'manual',recordedMinutes:1.5},{...draft,recordedMinutes:0},null,{}])assert.throws(()=>validateTimeEntryDraft(invalid));
});
test('duration tampering and timezone omission are rejected by canonical period contract',async()=>{
 for (const bad of [{...draft,recordedMinutes:59},{...draft,startedAt:'2026-11-01T01:30:00'},
  {...draft,endedAt:'2026-11-01T01:30:30-05:00'}]){
  const f=fixture();await assert.rejects(create(f.db,{draft:bad}));assert.equal(f.persisted.length,0);
 }
});
test('list scopes tenant, project and task, refuses arbitrary actor',async()=>{
 const f=fixture();const r=await list(f.db);
 assert.equal(r.items.length,1);assert.equal(r.items[0].durationMinutes,60);assert.equal(r.pagination.hasMore,false);
 const where=f.events.find(e=>e[0]==='list')[1].where;
 assert.equal(where.tenantId,TENANT);assert.equal(where.moduleSlug,PROJECT_TIME_ENTRY_SLUG);
 assert.deepEqual(where.payload,{path:['taskId'],equals:TASK});
 const denied=fixture();await assert.rejects(list(denied.db,{actorId:MANAGER}),ProjectTimeEntryForbidden);
});
test('foreign time entries fail-closed rather than leaking',async()=>{
 for (const bad of [timeRow({tenantId:'other'}),timeRow({payload:{...timeRow().payload,memberId:MANAGER}}),
 timeRow({payload:{...timeRow().payload,projectId:'other'}}),timeRow({payload:{...timeRow().payload,durationMinutes:55}})]){
  const f=fixture({rows:[bad]});await assert.rejects(list(f.db),/STORED_/);
 }
});
test('read-only pagination bounds and hasMore',async()=>{
 const f=fixture({rows:[timeRow({id:'1'}),timeRow({id:'2'})]});
 const r=await list(f.db,{take:1});assert.equal(r.items.length,1);assert.equal(r.pagination.hasMore,true);assert.equal(r.pagination.nextSkip,1);
 for (const invalid of [{take:0},{take:101},{take:1.2},{skip:-1},{skip:10001}])await assert.rejects(list(f.db,invalid),/PAGE_INVALID/);
});
test('empty history for valid task is allowed and isolated',async()=>{
 const f=fixture({rows:[]});const r=await list(f.db);assert.equal(r.items.length,0);
});
test('no financial engine, invoice posting or approval invoked on draft create',async()=>{
 const f=fixture();await create(f.db);
 assert.equal(f.events.some(e=>/invoice|ledger|payment|approve/i.test(e[0])),false);
});
