import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionTimeEntryReview,TimeReviewMissing,TimeReviewForbidden,
  TimeReviewConflict,TimeReviewStateError} from '../backend/src/modules/projects/time-entry-review-store.ts';
import {serializeTimeEntry, listTimeEntries, PROJECT_TIME_ENTRY_SLUG} from '../backend/src/modules/projects/time-entry-record-store.ts';
const TENANT='cb0054f7-ef51-4580-888a-087701fca814';
const PROJECT='130849ad-a46d-5adb-a286-2774fd36bfac';
const TASK='2e01330b-5d9b-5f71-8b1f-83c065c0c9ad';
const ENTRY='d04e6b97-539c-5a63-91b7-7e02fd5c929a';
const MEMBER='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const MANAGER='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const CLIENT='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const REV=new Date('2026-10-15T19:00:00.000Z');
const payload=(changes={})=>({schemaVersion:1,projectId:PROJECT,taskId:TASK,clientId:CLIENT,
  memberId:MEMBER,source:'manual',startedAtUtc:'2026-11-01T05:30:00.000Z',
  endedAtUtc:'2026-11-01T06:30:00.000Z',durationMinutes:60,revision:1,
  billable:false,linkedInvoiceId:null,approvedAt:null,approvedBy:null,...changes});
const time=(changes={})=>({id:ENTRY,tenantId:TENANT,moduleSlug:PROJECT_TIME_ENTRY_SLUG,
  title:'Registro horario',status:'draft',payload:payload(),createdAt:new Date(REV),updatedAt:new Date(REV),...changes});
const project=(changes={})=>({id:PROJECT,tenantId:TENANT,moduleSlug:'project-workspace-v761',status:'active',
  payload:{schemaVersion:1,clientId:CLIENT,managerId:MANAGER},...changes});
const task=(changes={})=>({id:TASK,tenantId:TENANT,moduleSlug:'project-task-v761',status:'in_progress',
  payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,assigneeId:MEMBER},...changes});
function fixture({row=time(),p=project(),t=task(),actorValid=true,clientValid=true,
  losingCas=false,serializationFail=false,auditFails=false,corruptAfter=false}={}){
  const events=[],committed=[];
  const db={async $transaction(fn,opts){events.push(['tx',opts]);let next=null;
    const tx={moduleRecord:{findFirst:async ({where})=>{
      events.push(['read',where]);
      if(where.moduleSlug==='project-workspace-v761')return p;
      if(where.moduleSlug==='project-task-v761')return t;
      if(!row)return null;
      if(next){return corruptAfter?{...row,status:'draft'}:
        {...row,status:next.data.status,payload:next.data.payload,updatedAt:new Date(REV.getTime()+1000)};}
      return row;
    },updateMany:async input=>{
      events.push(['cas',input]);
      if(losingCas)return {count:0};
      if(serializationFail)throw Object.assign(new Error('serialize'),{code:'P2034'});
      next=input;return {count:1};
    }},userProfile:{findFirst:async q=>{events.push(['profile',q]);return actorValid?{id:q.where.id,tenantId:TENANT}:null;}},
      client:{findFirst:async q=>{events.push(['client',q]);return clientValid?{id:CLIENT,tenantId:TENANT}:null;}},
      auditLog:{create:async q=>{events.push(['audit',q]);if(auditFails)throw Error('AUDIT_BROKEN');}}};
    const result=await fn(tx);committed.push(next);return result;
  }};
  return {db,events,committed};
}
const change=(db,action='submit',other={})=>transitionTimeEntryReview({db,tenantId:TENANT,
  actorId:['approve','reject'].includes(action)?MANAGER:MEMBER,projectId:PROJECT,taskId:TASK,
  entryId:ENTRY,action,expectedRevision:1,...other});

test('owner submits draft with CAS, review audit, immutable hours and no billing',async()=>{
  const f=fixture(),out=await change(f.db);
  assert.equal(out.status,'submitted');assert.equal(out.revision,2);assert.equal(out.billable,false);
  assert.equal(out.durationMinutes,60);assert.equal(f.committed.length,1);
  assert.deepEqual(f.events[0],['tx',{isolationLevel:'Serializable'}]);
  const cas=f.events.find(x=>x[0]==='cas')[1];
  assert.equal(cas.where.tenantId,TENANT);assert.equal(cas.where.status,'draft');
  assert.equal(cas.where.moduleSlug,PROJECT_TIME_ENTRY_SLUG);
  assert.deepEqual(cas.where.AND[0],{payload:{path:['revision'],equals:1}});
  assert.equal(cas.data.payload.billable,false);assert.equal(cas.data.payload.linkedInvoiceId,null);
  assert.equal(f.events.find(x=>x[0]==='audit')[1].data.action,'project.time-entry.review.submit');
});
test('worker may withdraw submitted time or revise a rejected entry',async()=>{
  const one=fixture({row:time({status:'submitted'})});
  assert.equal((await change(one.db,'withdraw')).status,'draft');
  const two=fixture({row:time({status:'rejected'})});
  assert.equal((await change(two.db,'revise')).status,'draft');
});
test('independent manager may reject and leave hours unbillable',async()=>{
  const f=fixture({row:time({status:'submitted'})});
  const output=await change(f.db,'reject');
  assert.equal(output.status,'rejected');assert.equal(output.billable,false);
  assert.equal(output.revision,2);
});
test('independent manager may approve with server time but NOT authorize invoice',async()=>{
  const f=fixture({row:time({status:'submitted'})}),out=await change(f.db,'approve');
  assert.equal(out.status,'approved');assert.equal(out.billable,false);
  assert.equal(out.revision,2);
  const written=f.events.find(x=>x[0]==='cas')[1].data.payload;
  assert.equal(written.approvedBy,MANAGER);assert.match(written.approvedAt,/^20\d\d-/);
  assert.equal(written.linkedInvoiceId,null);assert.equal('rate' in written,false);
  const auditor=f.events.find(x=>x[0]==='audit')[1].data;
  assert.equal(auditor.after.billable,false);
});
test('self approval or fake reviewer is prohibited even with module-level permission',async()=>{
  const same=fixture({p:project({payload:{schemaVersion:1,clientId:CLIENT,managerId:MEMBER}}),row:time({status:'submitted'})});
  await assert.rejects(change(same.db,'approve',{actorId:MEMBER}),TimeReviewForbidden);
  assert.equal(same.events.some(x=>x[0]==='cas'),false);
  const other=fixture({row:time({status:'submitted'})});
  await assert.rejects(change(other.db,'approve',{actorId:'38b01b4b-60b6-4ee2-87ab-e63fb3b5d787'}),TimeReviewForbidden);
});
test('worker cannot approve and manager cannot submit worker time',async()=>{
  const f=fixture({row:time({status:'submitted'})});
  await assert.rejects(change(f.db,'approve',{actorId:MEMBER}),TimeReviewForbidden);
  const g=fixture();await assert.rejects(change(g.db,'submit',{actorId:MANAGER}),TimeReviewForbidden);
});
test('invalid transitions and approved terminal state never write',async()=>{
  for(const [status,action] of [['draft','approve'],['draft','reject'],['approved','submit'],
    ['approved','approve'],['submitted','submit'],['rejected','approve']]){
    const f=fixture({row:time({status})});
    await assert.rejects(change(f.db,action));assert.equal(f.events.some(x=>x[0]==='cas'),false);
  }
});
test('expected revision stale or losing CAS cannot write an audit',async()=>{
  const stale=fixture();await assert.rejects(change(stale.db,'submit',{expectedRevision:2}),TimeReviewConflict);
  assert.equal(stale.events.some(x=>x[0]==='cas'),false);
  const loser=fixture({losingCas:true});await assert.rejects(change(loser.db),TimeReviewConflict);
  assert.equal(loser.events.some(x=>x[0]==='audit'),false);
});
test('serialization conflict or audit failure rolls back review',async()=>{
  for(const flags of [{serializationFail:true},{auditFails:true}]){
    const f=fixture(flags);await assert.rejects(change(f.db));assert.equal(f.committed.length,0);
  }
});
test('cross tenant or mismatched parent/task/client blocks update',async()=>{
  for(const flags of [{p:project({tenantId:'bad'})},{t:task({tenantId:'bad'})},
    {p:project({status:'archived'})},
    {t:task({payload:{schemaVersion:1,clientId:CLIENT,projectId:PROJECT,assigneeId:MANAGER}})},
    {clientValid:false},{actorValid:false}]){
    const f=fixture(flags);await assert.rejects(change(f.db));assert.equal(f.events.some(x=>x[0]==='cas'),false);
  }
});
test('foreign and invoiced row can never be reviewed',async()=>{
  for(const row of [time({tenantId:'bad'}),time({payload:payload({linkedInvoiceId:ENTRY})}),
    time({payload:payload({memberId:MANAGER})}),null]){
    const f=fixture({row});await assert.rejects(change(f.db));assert.equal(f.events.some(x=>x[0]==='cas'),false);
  }
});
test('postwrite corrupt row fails and rolls back transaction',async()=>{
  const f=fixture({corruptAfter:true});await assert.rejects(change(f.db),/POST_WRITE_INVALID/);
  assert.equal(f.committed.length,0);
});
test('strict revision/action/id validation runs before transaction',async()=>{
  for(const props of [{expectedRevision:0},{expectedRevision:1.5},{actorId:'bad'},
    {entryId:'bad'},{action:'bill'}]){
    const f=fixture();await assert.rejects(change(f.db,'submit',props));assert.equal(f.events.length,0);
  }
});
test('serializer preserves nonbillable submitted/rejected/approved and rejects forged paid',()=>{
  for(const state of ['draft','submitted','rejected']){
    const v=serializeTimeEntry(time({status:state}),TENANT,PROJECT,TASK,CLIENT);
    assert.equal(v.status,state);assert.equal(v.revision,1);
  }
  const approved=serializeTimeEntry(time({status:'approved',payload:payload({approvedBy:MANAGER,approvedAt:'2026-10-15T19:42:00.000Z',revision:2})}),TENANT,PROJECT,TASK,CLIENT);
  assert.equal(approved.billable,false);
  assert.throws(()=>serializeTimeEntry(time({status:'paid'}),TENANT,PROJECT,TASK,CLIENT));
  assert.throws(()=>serializeTimeEntry(time({status:'approved'}),TENANT,PROJECT,TASK,CLIENT));
  assert.throws(()=>serializeTimeEntry(time({status:'draft',payload:payload({billable:true})}),TENANT,PROJECT,TASK,CLIENT));
});
test('historical read includes submitted, rejected and approved review states',async()=>{
  const rows=['draft','submitted','rejected','approved'].map(status=>time({status,payload:payload(status==='approved'?{approvedBy:MANAGER,approvedAt:'2026-10-15T19:42:00.000Z',revision:2}:{})}));
  const db={$transaction:async(fn)=>fn({moduleRecord:{findFirst:async({where})=>where.moduleSlug==='project-workspace-v761'?project():task(),findMany:async({where})=>{
    assert.equal(Object.hasOwn(where,'status'),false);return rows;}}})};
  const result=await listTimeEntries({db,tenantId:TENANT,projectId:PROJECT,taskId:TASK,actorId:MEMBER});
  assert.deepEqual(result.items.map(x=>x.status),['draft','submitted','rejected','approved']);
});
