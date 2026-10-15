import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionProjectTask,ProjectTaskConflict,ProjectTaskForbidden,ProjectTaskNotFound,
  ProjectTaskStaleRevision,ProjectTaskTransitionRejected,listProjectTasks,
  PROJECT_TASK_SLUG} from '../backend/src/modules/projects/project-task-store.ts';
const TENANT='cb0054f7-ef51-4580-888a-087701fca814';
const PROJECT='130849ad-a46d-5adb-a286-2774fd36bfac';
const CLIENT='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const MANAGER='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const TASK='2e01330b-5d9b-5f71-8b1f-83c065c0c9ad';
const ASSIGNEE='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const REV='2026-10-15T18:00:00.000Z';
const NEW_REV='2026-10-15T18:01:00.000Z';
const project=(props={})=>({id:PROJECT,tenantId:TENANT,moduleSlug:'project-workspace-v761',
 status:'active',payload:{schemaVersion:1,managerId:MANAGER,clientId:CLIENT},...props});
const taskRow=(props={})=>({id:TASK,tenantId:TENANT,moduleSlug:PROJECT_TASK_SLUG,status:'todo',
 title:'Preparar informe',createdAt:new Date(REV),updatedAt:new Date(REV),
 payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,assigneeId:ASSIGNEE,creatorId:MANAGER},...props});
function fixture({parent=project(),entry=taskRow(),user={id:MANAGER,tenantId:TENANT},
 race=false,auditFail=false,postWrong=false}={}){
 const log=[],commits=[];
 const db={async $transaction(fn,options){
  log.push(['isolation',options]);let writes=[],reads=0;
  const tx={moduleRecord:{findFirst:async args=>{
   log.push(['read',args]);reads++;
   if(args.where.moduleSlug==='project-workspace-v761')return parent;
   if(reads===3)return postWrong?taskRow({status:'todo',updatedAt:new Date(NEW_REV)}):taskRow({...entry,status:writes[0]?.data.status||entry?.status,updatedAt:new Date(NEW_REV)});
   return entry;
  },updateMany:async args=>{log.push(['update',args]);if(race)return {count:0};writes.push(args);return {count:1};}},
  userProfile:{findFirst:async args=>{log.push(['user',args]);return user;}},
  auditLog:{create:async args=>{log.push(['audit',args]);if(auditFail)throw Error('AUDIT_FAILED');}}};
  const result=await fn(tx);commits.push(...writes);return result;
 }};
 return {db,log,commits};
}
const transition=(db,changes={})=>transitionProjectTask({db,tenantId:TENANT,actorId:MANAGER,
  projectId:PROJECT,taskId:TASK,nextStatus:'in_progress',expectedUpdatedAt:REV,...changes});
test('todo -> in_progress uses tenant, JSON parent and timestamp CAS with audit',async()=>{
 const {db,log,commits}=fixture();const result=await transition(db);
 assert.equal(result.status,'in_progress');assert.equal(result.updatedAt,NEW_REV);
 assert.equal(commits.length,1);assert.deepEqual(log[0],['isolation',{isolationLevel:'Serializable'}]);
 const change=log.find(x=>x[0]==='update')[1];
 assert.deepEqual(change.where,{id:TASK,tenantId:TENANT,moduleSlug:PROJECT_TASK_SLUG,
  status:'todo',updatedAt:new Date(REV),payload:{path:['projectId'],equals:PROJECT}});
 assert.equal(change.data.status,'in_progress');
 assert.equal(log.find(x=>x[0]==='audit')[1].data.action,'project.task.status.change');
});
test('in_progress -> done is terminal',async()=>{
 const {db}=fixture({entry:taskRow({status:'in_progress'})});
 assert.equal((await transition(db,{nextStatus:'done'})).status,'done');
 for(const nextStatus of ['done','in_progress']){
  const f=fixture({entry:taskRow({status:'done'})});
  await assert.rejects(transition(f.db,{nextStatus}),ProjectTaskTransitionRejected);
 }
});
test('cannot skip, repeat or reverse states',async()=>{
 for(const [status,nextStatus] of [['todo','done'],['todo','todo'],['in_progress','in_progress'],['done','todo']]){
  const {db,commits}=fixture({entry:taskRow({status})});
  await assert.rejects(transition(db,{nextStatus}),ProjectTaskTransitionRejected);
  assert.equal(commits.length,0);
 }
});
test('stale version and lost CAS reject without audit',async()=>{
 const f=fixture();await assert.rejects(transition(f.db,{expectedUpdatedAt:'2026-10-15T17:59:59.000Z'}),ProjectTaskStaleRevision);
 assert.equal(f.log.some(x=>x[0]==='update'),false);
 const race=fixture({race:true});await assert.rejects(transition(race.db),ProjectTaskStaleRevision);
 assert.equal(race.log.some(x=>x[0]==='audit'),false);
});
test('audit failure and invalid read-after-write rollback',async()=>{
 for(const flags of [{auditFail:true},{postWrong:true}]){
  const f=fixture(flags);await assert.rejects(transition(f.db));assert.equal(f.commits.length,0);
 }
});
test('manager-only same tenant and active project',async()=>{
 for(const flags of [{parent:project({status:'archived'})},
  {parent:project({payload:{schemaVersion:1,managerId:ASSIGNEE,clientId:CLIENT}})},
  {user:null},{user:{id:MANAGER,tenantId:'foreign'}}]){
   const {db,commits}=fixture(flags);await assert.rejects(transition(db),
     flags.parent?.status==='archived'?ProjectTaskConflict:ProjectTaskForbidden);
   assert.equal(commits.length,0);
 }
});
test('cross-tenant/project task is rejected before an update',async()=>{
 for(const entry of [null,taskRow({tenantId:'foreign'}),
  taskRow({payload:{...taskRow().payload,projectId:'foreign'}}),taskRow({moduleSlug:'crm-leads'})]){
  const f=fixture({entry});await assert.rejects(transition(f.db));
  assert.equal(f.log.some(x=>x[0]==='update'),false);
 }
});
test('invalid input is refused before opening transaction',async()=>{
 for(const opts of [{taskId:'bad'},{nextStatus:'cancelled'},
  {expectedUpdatedAt:'2026-10-15T18:00:00Z'},{expectedUpdatedAt:'2026-02-30T18:00:00.000Z'}]){
  const f=fixture();await assert.rejects(transition(f.db,opts));assert.equal(f.log.length,0);
 }
});
test('historical finished task remains in project list',async()=>{
 const row=taskRow({status:'done'});
 const db={moduleRecord:{findFirst:async()=>project(),findMany:async args=>{
  assert.equal(Object.hasOwn(args.where,'status'),false);return [row];}}};
 const result=await listProjectTasks({db,tenantId:TENANT,projectId:PROJECT});
 assert.equal(result.items[0].status,'done');
});
