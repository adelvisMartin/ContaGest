import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT_RECORD_SLUG } from '../backend/src/modules/projects/project-record-store.ts';
import { planProjectStatusChange, transitionProjectStatus, ProjectStatusNotFound,
  ProjectStatusConflict, ProjectStatusForbidden, ProjectStatusTransitionRejected
} from '../backend/src/modules/projects/project-status-transition.ts';

const ID='5ee1ef27-07ab-5b54-a58d-49ce038f4b53';
const CLIENT='c974e871-ebcf-4f38-a31f-7b61ff5045d0';
const REV='2026-10-15T17:40:00.000Z';
const AFTER='2026-10-15T17:40:01.000Z';
const row=(options={})=>({
  id:ID,tenantId:'tenant-a',moduleSlug:PROJECT_RECORD_SLUG,
  title:'Proyecto Operaciones',status:'planning',
  payload:{schemaVersion:1,clientId:CLIENT,managerId:'manager-a',description:null},
  createdAt:new Date('2026-10-14T00:00:00.000Z'),updatedAt:new Date(REV),...options
});
const request=(db,extra={})=>({
  db,tenantId:'tenant-a',actorId:'manager-a',projectId:ID,
  nextStatus:'active',expectedUpdatedAt:REV,...extra
});
function fakeDb({initial=row(),missing=false,inactive=false,foreignActor=false,
  tamperedActor=false,conflict=false,auditFailure=false,afterCorrupt=false}={}){
  const calls=[],committed=[];
  const db={$transaction:async execute=>{
    let attempted=null,reads=0;
    const tx={
      moduleRecord:{
        findFirst:async query=>{
          calls.push(['find',query]);reads++;
          if(missing)return null;
          if(reads===1)return initial;
          if(afterCorrupt)return row({status:'planning',updatedAt:new Date(AFTER)});
          return row({...initial,status:attempted,updatedAt:new Date(AFTER)});
        },
        updateMany:async query=>{
          calls.push(['update',query]);
          if(conflict)return {count:0};
          attempted=query.data.status;return {count:1};
        }
      },
      userProfile:{findFirst:async query=>{
        calls.push(['actor',query]);
        if(inactive)return null;
        return {id:tamperedActor?'wrong-user':'manager-a',tenantId:foreignActor?'tenant-b':'tenant-a'};
      }},
      auditLog:{create:async query=>{
        calls.push(['audit',query]);
        if(auditFailure)throw new Error('AUDIT_UNAVAILABLE');
        return {id:'audit-1'};
      }}
    };
    const result=await execute(tx);
    committed.push(attempted);return result;
  }};
  return {db,calls,committed};
}

test('#761 planning -> active is manager-only with tenant-scoped CAS and same-transaction audit',async()=>{
  const {db,calls,committed}=fakeDb();
  const result=await transitionProjectStatus(request(db));
  assert.deepEqual(result,{id:ID,status:'active',updatedAt:AFTER});
  assert.deepEqual(committed,['active']);
  const read=calls[0][1];
  assert.deepEqual(read.where,{id:ID,tenantId:'tenant-a',moduleSlug:PROJECT_RECORD_SLUG});
  const actor=calls[1][1];
  assert.equal(actor.where.tenantId,'tenant-a');
  assert.equal(actor.where.status,'active');
  const update=calls.find(([kind])=>kind==='update')[1];
  assert.deepEqual(update.where,{id:ID,tenantId:'tenant-a',moduleSlug:PROJECT_RECORD_SLUG,
    status:'planning',updatedAt:new Date(REV)});
  assert.deepEqual(update.data,{status:'active'});
  const audit=calls.find(([kind])=>kind==='audit')[1].data;
  assert.equal(audit.action,'project.status.change');
  assert.equal(audit.tenantId,'tenant-a');
  assert.equal(audit.userId,'manager-a');
  assert.deepEqual(audit.before,{moduleSlug:PROJECT_RECORD_SLUG,status:'planning'});
  assert.deepEqual(audit.after,{moduleSlug:PROJECT_RECORD_SLUG,status:'active'});
});

test('#761 active -> archived records one terminal transition',async()=>{
  const {db}=fakeDb({initial:row({status:'active'})});
  const result=await transitionProjectStatus(request(db,{nextStatus:'archived'}));
  assert.equal(result.status,'archived');
});

test('#761 archived, invalid and skipped lifecycle steps fail closed',async()=>{
  for(const [initial,nextStatus] of [
    ['planning','archived'],['active','active'],['archived','active'],
    ['archived','archived'],['suspended','active']
  ]){
    const {db,calls,committed}=fakeDb({initial:row({status:initial})});
    await assert.rejects(transitionProjectStatus(request(db,{nextStatus})),
      initial==='suspended'?/PROJECT_TENANT_DATA_LEAK_BLOCKED/:ProjectStatusTransitionRejected);
    assert.equal(calls.some(([name])=>name==='update'),false);
    assert.equal(committed.length,0);
  }
});

test('#761 stale revision cannot write or audit',async()=>{
  const {db,calls,committed}=fakeDb();
  await assert.rejects(transitionProjectStatus(request(db,{
    expectedUpdatedAt:'2026-10-15T17:39:59.000Z'
  })),ProjectStatusConflict);
  assert.equal(calls.some(([name])=>name==='update'),false);
  assert.equal(committed.length,0);
});

test('#761 compare-and-swap loser cannot publish an audit',async()=>{
  const {db,calls,committed}=fakeDb({conflict:true});
  await assert.rejects(transitionProjectStatus(request(db)),ProjectStatusConflict);
  assert.equal(calls.filter(([name])=>name==='update').length,1);
  assert.equal(calls.some(([name])=>name==='audit'),false);
  assert.equal(committed.length,0);
});

test('#761 transaction rolls back status if audit persistence fails',async()=>{
  const {db,committed,calls}=fakeDb({auditFailure:true});
  await assert.rejects(transitionProjectStatus(request(db)),/AUDIT_UNAVAILABLE/);
  assert.equal(calls.some(([name])=>name==='update'),true);
  assert.equal(committed.length,0);
});

test('#761 manager cannot be spoofed by another actor or tenant',async()=>{
  for(const extra of [
    {actorId:'attacker'}, {tenantId:'tenant-b'}, {projectId:'bad'}
  ]){
    const {db,committed}=fakeDb();
    await assert.rejects(transitionProjectStatus(request(db,extra)));
    assert.equal(committed.length,0);
  }
});

test('#761 inactive, foreign or corrupted user profile cannot transition',async()=>{
  for(const flags of [{inactive:true},{foreignActor:true},{tamperedActor:true}]){
    const {db,committed,calls}=fakeDb(flags);
    await assert.rejects(transitionProjectStatus(request(db)),ProjectStatusForbidden);
    assert.equal(calls.some(([name])=>name==='update'),false);
    assert.equal(committed.length,0);
  }
});

test('#761 hidden, cross-tenant or wrong namespace projects never update',async()=>{
  for(const flags of [
    {missing:true},{initial:row({tenantId:'tenant-b'})},
    {initial:row({moduleSlug:'crm-leads'})}
  ]){
    const {db,committed,calls}=fakeDb(flags);
    await assert.rejects(transitionProjectStatus(request(db)));
    assert.equal(calls.some(([name])=>name==='update'),false);
    assert.equal(committed.length,0);
  }
});

test('#761 read-after-write mismatch aborts transaction',async()=>{
  const {db,committed}=fakeDb({afterCorrupt:true});
  await assert.rejects(transitionProjectStatus(request(db)),/PROJECT_STATUS_POST_WRITE_INVALID/);
  assert.equal(committed.length,0);
});

test('#761 reject malformed timestamps and unknown statuses before DB access',async()=>{
  for(const expectedUpdatedAt of [
    '2026-10-15T17:40:00Z','2026-10-15T17:40:00+00:00',
    '2026-02-30T17:40:00.000Z','invalid',null
  ]){
    const {db,calls}=fakeDb();
    await assert.rejects(transitionProjectStatus(request(db,{expectedUpdatedAt})),
      /PROJECT_STATUS_REVISION_REQUIRED/);
    assert.equal(calls.length,0);
  }
  for(const nextStatus of ['planning','cancelled',null,'__proto__']){
    const {db,calls}=fakeDb();
    await assert.rejects(transitionProjectStatus(request(db,{nextStatus})),
      ProjectStatusTransitionRejected);
    assert.equal(calls.length,0);
  }
});

test('#761 plan projects never creates a transition with financial side effects',()=>{
  assert.deepEqual(planProjectStatusChange('planning','active',REV),{
    from:'planning',to:'active',expectedUpdatedAt:REV
  });
  assert.throws(()=>planProjectStatusChange('archived','active',REV),
    ProjectStatusTransitionRejected);
});

test('#761 dedicated PATCH is gated by same OFF switch, RBAC and strict body',()=>{
  const code=readFileSync(new URL('../backend/src/modules/projects/project-record.routes.ts',import.meta.url),'utf8');
  assert.match(code,/CONTAGEST_PROJECTS_V761_ENABLE/);
  assert.match(code,/router\.patch\('\/:id\/status',requirePermission\('modules\.manage'\),validateBody\(projectStatusSchema\)/);
  assert.match(code,/nextStatus:z\.enum\(\['active','archived'\]\)/);
  assert.match(code,/\.strict\(\)/);
  assert.match(code,/actorId:ctx\.userId/);
  assert.doesNotMatch(code,/\.salesInvoice\.(create|update|upsert)/);
});

test('#761 service writes no invoice, ledger, time or payment object',()=>{
  const code=readFileSync(new URL('../backend/src/modules/projects/project-status-transition.ts',import.meta.url),'utf8');
  assert.match(code,/tx\.moduleRecord\.updateMany/);
  assert.match(code,/tx\.auditLog\.create/);
  assert.doesNotMatch(code,/tx\.(salesInvoice|ledgerEntry|timeEntry|payment)\./);
});
