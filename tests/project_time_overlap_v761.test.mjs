import test from 'node:test';
import assert from 'node:assert/strict';
import {memberTimeOverlapQuery,createTimeEntryDraft,ProjectTimeEntryConflict,
  PROJECT_TIME_ENTRY_SLUG} from '../backend/src/modules/projects/time-entry-record-store.ts';

const TENANT='cb0054f7-ef51-4580-888a-087701fca814';
const OTHER_TENANT='ad6b4c30-7584-4e14-a83c-87690d347b85';
const PROJECT='130849ad-a46d-5adb-a286-2774fd36bfac';
const OTHER_PROJECT='aa5b977a-9da6-4e25-8ba9-e9cc8188d2e2';
const TASK='2e01330b-5d9b-5f71-8b1f-83c065c0c9ad';
const OTHER_TASK='3efa3e91-56ec-4635-a158-269ab9409446';
const CLIENT='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const MEMBER='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const OTHER_MEMBER='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const KEY='420728db-b4ad-46d4-aed5-a2cf74d48e8f';
const DRAFT={source:'manual',startedAt:'2026-11-01T01:30:00-04:00',endedAt:'2026-11-01T01:30:00-05:00',recordedMinutes:60};
const record=(start='2026-11-01T05:30:00.000Z',end='2026-11-01T06:30:00.000Z',other={})=>({
  id:'old-time',tenantId:TENANT,moduleSlug:PROJECT_TIME_ENTRY_SLUG,status:'draft',
  payload:{memberId:MEMBER,projectId:OTHER_PROJECT,taskId:OTHER_TASK,
    startedAtUtc:start,endedAtUtc:end},...other
});
// Deliberately simple JSON filter simulator: tests the intended query contract,
// not Prisma/PostgreSQL query planner or predicate locks.
function matchJsonPredicate(row,predicate){
 const actual=row.payload?.[predicate.path[0]];
 if('equals'in predicate)return actual===predicate.equals;
 if('lt'in predicate)return typeof actual==='string'&&actual<predicate.lt;
 if('gt'in predicate)return typeof actual==='string'&&actual>predicate.gt;
 throw Error('Unexpected query operator');
}
function fixture(entries=[],{simulateSerializationFailure=false,invalidResult=false,auditFailure=false}={}){
 const calls=[],committed=[];
 const db={async $transaction(work,options){
   calls.push(['transaction',options]);let pending=[];
   const tx={moduleRecord:{
     findFirst:async ({where})=>{calls.push(['parent',where]);
       if(where.moduleSlug==='project-workspace-v761')return {id:PROJECT,tenantId:TENANT,
         moduleSlug:where.moduleSlug,status:'active',payload:{schemaVersion:1,clientId:CLIENT,managerId:OTHER_MEMBER}};
       return {id:TASK,tenantId:TENANT,moduleSlug:where.moduleSlug,status:'in_progress',
         payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,assigneeId:MEMBER}};
     },
     findMany:async (query)=>{
       calls.push(['overlap',query]);
       if(invalidResult)return null;
       return entries.filter(row=>row.tenantId===query.where.tenantId&&
         row.moduleSlug===query.where.moduleSlug&&
         query.where.AND.every(({payload})=>matchJsonPredicate(row,payload))).slice(0,query.take);
     },
     create:async({data})=>{calls.push(['insert',data]);
       if(simulateSerializationFailure)throw Object.assign(new Error('Serialization'),{code:'P2034'});
       pending.push(data);
       return {...data,createdAt:new Date(),updatedAt:new Date()};
     }},
     userProfile:{findFirst:async()=>({id:MEMBER,tenantId:TENANT})},
     client:{findFirst:async()=>({id:CLIENT,tenantId:TENANT})},
     auditLog:{create:async()=>{calls.push(['audit']);if(auditFailure)throw new Error('AUDIT_FAILED');}}
   };
   const result=await work(tx);
   committed.push(...pending);return result;
 }};
 return {db,calls,committed};
}
const run=async(f,draft=DRAFT)=>createTimeEntryDraft({db:f.db,tenantId:TENANT,actorId:MEMBER,
  projectId:PROJECT,taskId:TASK,idempotencyKey:KEY,draft});

test('overlap predicate is scoped to tenant and MEMBER across every project/task and state',()=>{
 const q=memberTimeOverlapQuery(TENANT,MEMBER,'2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z');
 assert.deepEqual(q,{where:{tenantId:TENANT,moduleSlug:PROJECT_TIME_ENTRY_SLUG,AND:[
  {payload:{path:['memberId'],equals:MEMBER}},
  {payload:{path:['startedAtUtc'],lt:'2026-11-01T06:30:00.000Z'}},
  {payload:{path:['endedAtUtc'],gt:'2026-11-01T05:30:00.000Z'}}]},select:{id:true},take:1});
 assert.equal(Object.hasOwn(q.where,'status'),false);
 assert.equal(Object.hasOwn(q.where,'taskId'),false);
});

test('exact overlap and duplicate with different keys are rejected before insert/audit',async()=>{
 for(const existing of [record(),record('2026-11-01T05:45:00.000Z','2026-11-01T06:45:00.000Z')]){
  const f=fixture([existing]);await assert.rejects(run(f),ProjectTimeEntryConflict);
  assert.equal(f.calls.some(c=>c[0]==='insert'),false);assert.equal(f.calls.some(c=>c[0]==='audit'),false);
  assert.equal(f.committed.length,0);
 }
});

test('new window inside older, older inside new: neither may be double-booked',async()=>{
 for(const existing of [record('2026-11-01T05:00:00.000Z','2026-11-01T07:00:00.000Z'),
  record('2026-11-01T05:45:00.000Z','2026-11-01T06:00:00.000Z')]){
   const f=fixture([existing]);await assert.rejects(run(f),ProjectTimeEntryConflict);
 }
});

test('half-open adjacency (older ends at start / starts at end) is allowed',async()=>{
 const f=fixture([record('2026-11-01T04:30:00.000Z','2026-11-01T05:30:00.000Z'),
  record('2026-11-01T06:30:00.000Z','2026-11-01T07:30:00.000Z')]);
 await run(f);
 assert.equal(f.committed.length,1);assert.equal(f.calls.filter(c=>c[0]==='audit').length,1);
});

test('different tenant or member does not prevent a valid same-clock window',async()=>{
 const f=fixture([record(undefined,undefined,{tenantId:OTHER_TENANT}),
  record(undefined,undefined,{payload:{...record().payload,memberId:OTHER_MEMBER}})]);
 await run(f);assert.equal(f.committed.length,1);
});

test('overlap across a different project and task still blocks worker time',async()=>{
 const f=fixture([record()]);await assert.rejects(run(f),ProjectTimeEntryConflict);
 const q=f.calls.find(c=>c[0]==='overlap')[1];
 assert.equal(JSON.stringify(q.where).includes(OTHER_PROJECT),false);
 assert.equal(JSON.stringify(q.where).includes(OTHER_TASK),false);
});

test('an already-approved or linked historic time window remains reserved',async()=>{
 for(const status of ['approved','submitted','rejected']){
   const f=fixture([record(undefined,undefined,{status})]);
   await assert.rejects(run(f),ProjectTimeEntryConflict);
 }
});

test('all checks remain inside one Serializable transaction and before write',async()=>{
 const f=fixture([]);await run(f);
 assert.deepEqual(f.calls[0],['transaction',{isolationLevel:'Serializable'}]);
 const overlap=f.calls.findIndex(c=>c[0]==='overlap');
 const insert=f.calls.findIndex(c=>c[0]==='insert');
 const audit=f.calls.findIndex(c=>c[0]==='audit');
 assert.ok(overlap>=0&&insert>overlap&&audit>insert);
});

test('Serializable write collision maps to 409 conflict; audit not committed',async()=>{
 const f=fixture([],{simulateSerializationFailure:true});
 await assert.rejects(run(f),ProjectTimeEntryConflict);
 assert.equal(f.committed.length,0);assert.equal(f.calls.some(c=>c[0]==='audit'),false);
});

test('malformed database overlap answer fails closed and never inserts',async()=>{
 const f=fixture([],{invalidResult:true});
 await assert.rejects(run(f),/PROJECT_TIME_ENTRY_OVERLAP_QUERY_INVALID/);
 assert.equal(f.committed.length,0);
});

test('invalid timestamps are rejected before querying',()=>{
 for(const [start,end] of [
  ['2026-02-30T05:30:00.000Z','2026-11-01T06:30:00.000Z'],
  ['2026-11-01T05:30:00Z','2026-11-01T06:30:00.000Z'],
  ['2026-11-01T05:30:00.000Z','2026-11-01T05:30:00.000Z'],
  ['2026-11-01T06:30:00.000Z','2026-11-01T05:30:00.000Z']
 ])assert.throws(()=>memberTimeOverlapQuery(TENANT,MEMBER,start,end));
});

test('a failing audit still rolls back checked and inserted draft',async()=>{
 const f=fixture([],{auditFailure:true});await assert.rejects(run(f),/AUDIT_FAILED/);
 assert.equal(f.committed.length,0);
});
