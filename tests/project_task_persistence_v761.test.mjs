import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProjectTask,listProjectTasks,taskIdFromAttempt,validateTaskDraft,
  PROJECT_TASK_SLUG,ProjectTaskNotFound,ProjectTaskForbidden,ProjectTaskConflict
} from '../backend/src/modules/projects/project-task-store.ts';

const TENANT='cb0054f7-ef51-4580-888a-087701fca814';
const PROJECT='130849ad-a46d-5adb-a286-2774fd36bfac';
const CLIENT='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const MANAGER='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const ASSIGNEE='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const KEY='420728db-b4ad-46d4-aed5-a2cf74d48e8f';
const DRAFT={title:'Escribir informe',assigneeId:ASSIGNEE,description:'Análisis de seguridad'};
const project=(o={})=>({id:PROJECT,tenantId:TENANT,moduleSlug:'project-workspace-v761',
  status:'active',payload:{schemaVersion:1,managerId:MANAGER,clientId:CLIENT},...o});
const task=(o={})=>({id:'task-record',tenantId:TENANT,moduleSlug:PROJECT_TASK_SLUG,status:'todo',
  title:DRAFT.title,payload:{schemaVersion:1,projectId:PROJECT,clientId:CLIENT,
    assigneeId:ASSIGNEE,creatorId:MANAGER,description:DRAFT.description},
  createdAt:new Date('2026-10-15T18:00:00.000Z'),updatedAt:new Date('2026-10-15T18:00:00.000Z'),...o});
function store({parent=project(),manager={id:MANAGER,tenantId:TENANT},
  assignee={id:ASSIGNEE,tenantId:TENANT},client={id:CLIENT,tenantId:TENANT},
  auditFails=false,unique=false,serialConflict=false,listRows=[task()]}={}){
 const log=[],commits=[];
 const db={async $transaction(fn,options){
   log.push(['isolation',options]);let staged=[];
   const tx={
     moduleRecord:{findFirst:async args=>{log.push(['parent',args]);return parent;},
       create:async args=>{log.push(['task.create',args]);
         if(unique)throw Object.assign(new Error('unique'),{code:'P2002'});
         if(serialConflict)throw Object.assign(new Error('serialization'),{code:'P2034'});
         staged.push(args.data);return task({id:args.data.id,tenantId:args.data.tenantId,
           title:args.data.title,status:args.data.status,payload:args.data.payload});}},
     userProfile:{findFirst:async args=>{log.push(['profile',args]);
       return args.where.id===MANAGER?manager:assignee;}},
     client:{findFirst:async args=>{log.push(['client',args]);return client;}},
     auditLog:{create:async args=>{log.push(['audit',args]);if(auditFails)throw Error('AUDIT_FAILED');}}
   };
   const ret=await fn(tx);commits.push(...staged);return ret;
 },moduleRecord:{findFirst:async args=>{log.push(['parent',args]);return parent;},
   findMany:async args=>{log.push(['list',args]);return listRows;}}};
 return {db,log,commits};
}
const create=(db,changes={})=>createProjectTask({db,tenantId:TENANT,actorId:MANAGER,
  projectId:PROJECT,idempotencyKey:KEY,draft:DRAFT,...changes});

test('create writes one tenant-scoped project task and same-transaction audit',async()=>{
 const {db,log,commits}=store();const result=await create(db);
 assert.equal(result.assigneeId,ASSIGNEE);assert.equal(result.status,'todo');
 assert.equal(commits.length,1);assert.equal(commits[0].id,taskIdFromAttempt(TENANT,PROJECT,KEY));
 assert.equal(commits[0].moduleSlug,PROJECT_TASK_SLUG);
 assert.deepEqual(log[0],['isolation',{isolationLevel:'Serializable'}]);
 assert.deepEqual(log[1][1].where,{id:PROJECT,tenantId:TENANT,moduleSlug:'project-workspace-v761'});
 assert.deepEqual(log.filter(x=>x[0]==='client')[0][1].where,{id:CLIENT,tenantId:TENANT,active:true});
 const audit=log.find(x=>x[0]==='audit')[1].data;
 assert.equal(audit.userId,MANAGER);assert.equal(audit.action,'project.task.create');
 assert.equal(audit.tenantId,TENANT);assert.equal(audit.after.projectId,PROJECT);
 assert.equal(Object.hasOwn(result,'hourlyRate'),false);
});
test('audit failure rolls back task transaction',async()=>{
 const {db,commits}=store({auditFails:true});
 await assert.rejects(create(db),/AUDIT_FAILED/);assert.equal(commits.length,0);
});
test('duplicate key and serializable conflict map to safe 409 conflict',async()=>{
 for(const opt of [{unique:true},{serialConflict:true}]){
  const {db,commits}=store(opt);
  await assert.rejects(create(db),ProjectTaskConflict);
  assert.equal(commits.length,0);
 }
});
test('deterministic keys partition task creation by tenant and project',()=>{
 assert.equal(taskIdFromAttempt(TENANT,PROJECT,KEY),taskIdFromAttempt(TENANT,PROJECT,KEY.toUpperCase()));
 assert.notEqual(taskIdFromAttempt(TENANT,PROJECT,KEY),taskIdFromAttempt(TENANT,'21ad99d2-f091-43c1-9a52-52ff6d8b7412',KEY));
 assert.notEqual(taskIdFromAttempt(TENANT,PROJECT,KEY),taskIdFromAttempt('c5bff09f-457a-4c83-9b98-4d5171b9125c',PROJECT,KEY));
 assert.match(taskIdFromAttempt(TENANT,PROJECT,KEY),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('input strictly rejects extra client, tenant and financial authority fields',()=>{
 assert.deepEqual(validateTaskDraft(DRAFT),DRAFT);
 for(const key of ['tenantId','projectId','clientId','managerId','hourlyRate','linkedInvoiceId','status'])
   assert.throws(()=>validateTaskDraft({...DRAFT,[key]:'spoof'}),/FIELD_NOT_ALLOWED/);
 for(const bad of [null,{},'bad',{...DRAFT,title:'a'},{...DRAFT,assigneeId:'a'},
   {...DRAFT,description:'x'.repeat(2001)}])assert.throws(()=>validateTaskDraft(bad));
});
test('invalid keys and malformed principals fail before a database call',async()=>{
 for(const key of ['bad','00000000-0000-0000-0000-000000000000',null]){
  const {db,log}=store();await assert.rejects(create(db,{idempotencyKey:key}),/IDEMPOTENCY_KEY_INVALID/);
  assert.equal(log.length,0);
 }
 const {db,log}=store();
 await assert.rejects(create(db,{actorId:'attacker'}),/PROJECT_TASK_ACTOR_INVALID/);
 assert.equal(log.length,0);
});
test('a planning or archived project cannot receive tasks',async()=>{
 for(const status of ['planning','archived']){
  const {db,commits}=store({parent:project({status})});
  await assert.rejects(create(db),ProjectTaskConflict);assert.equal(commits.length,0);
 }
});
test('project scope mismatch and missing parent fail closed',async()=>{
 for(const parent of [null,project({tenantId:'wrong'}),project({moduleSlug:'crm-leads'}),
    project({id:'wrong'}),project({payload:{schemaVersion:1,managerId:MANAGER,clientId:'invalid'}})]){
   const {db,commits}=store({parent});
   await assert.rejects(create(db));assert.equal(commits.length,0);
 }
});
test('only same-tenant active manager may assign tasks',async()=>{
 for(const opts of [{parent:project({payload:{schemaVersion:1,managerId:ASSIGNEE,clientId:CLIENT}})},
   {manager:null},{manager:{id:MANAGER,tenantId:'foreign'}}]){
    const {db,commits}=store(opts);
    await assert.rejects(create(db),ProjectTaskForbidden);assert.equal(commits.length,0);
 }
});
test('assignee and client must belong to same active tenant',async()=>{
 for(const opts of [{assignee:null},{assignee:{id:ASSIGNEE,tenantId:'foreign'}},
    {client:null},{client:{id:CLIENT,tenantId:'foreign'}}]){
    const {db,commits}=store(opts);
    await assert.rejects(create(db),ProjectTaskNotFound);assert.equal(commits.length,0);
 }
});
test('list filters tenant, project JSON path, status and uses bounded pagination',async()=>{
 const {db,log}=store();const result=await listProjectTasks({db,tenantId:TENANT,projectId:PROJECT,take:10,skip:3});
 assert.equal(result.items.length,1);assert.equal(result.pagination.hasMore,false);
 const where=log.find(x=>x[0]==='list')[1].where;
 assert.equal(where.tenantId,TENANT);assert.equal(where.moduleSlug,PROJECT_TASK_SLUG);
 assert.deepEqual(where.payload,{path:['projectId'],equals:PROJECT});
 assert.equal(log.find(x=>x[0]==='list')[1].take,11);
});
test('pagination cursor and limit are truthful',async()=>{
 const {db}=store({listRows:[task({id:'1'}),task({id:'2'})]});
 const result=await listProjectTasks({db,tenantId:TENANT,projectId:PROJECT,take:1});
 assert.equal(result.pagination.hasMore,true);assert.equal(result.pagination.nextSkip,1);
 for(const take of [0,101,-1,1.1])await assert.rejects(listProjectTasks({db,tenantId:TENANT,projectId:PROJECT,take}),/PAGE_INVALID/);
});
test('foreign or malformed listed task never leaks into response',async()=>{
 for(const bad of [task({tenantId:'foreign'}),task({payload:{...task().payload,projectId:'wrong'}}),
   task({moduleSlug:'crm-leads'}),task({payload:{...task().payload,clientId:'foreign'}})]){
  const {db}=store({listRows:[bad]});
  await assert.rejects(listProjectTasks({db,tenantId:TENANT,projectId:PROJECT}),/ROW_SCOPE_INVALID/);
 }
});
test('unlisted project is 404, no unauthorized task list',async()=>{
 const {db}=store({parent:null});
 await assert.rejects(listProjectTasks({db,tenantId:TENANT,projectId:PROJECT}),ProjectTaskNotFound);
});
test('declarative service never posts money or modifies a timesheet',()=>{
 const src=readFileSync(new URL('../backend/src/modules/projects/project-task-store.ts',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\b(?:salesInvoice|ledgerEntry|timeEntry|payment)\.(?:create|update|delete|upsert)\b/);
 assert.match(src,/isolationLevel:'Serializable'/);
});
