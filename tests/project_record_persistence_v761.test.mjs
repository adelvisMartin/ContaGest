import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROJECT_RECORD_SLUG,projectIdFromAttempt,validateProjectDraft,
  serializeProjectRecord,createProjectRecord,listProjectRecords,
  ProjectOwnerNotFound,ProjectReplayConflict
} from '../backend/src/modules/projects/project-record-store.ts';

const CLIENT='6d5e0da2-9d22-4bc6-8f02-c5d36e0e174b';
const KEY='1650d42b-a76e-4fea-9fd3-ec08a3e64c76';
const draft={name:'Proyecto Aurora',clientId:CLIENT,description:'Implementación'};
const row=(changes={})=>({
  id:'project-generated',tenantId:'tenant-a',moduleSlug:PROJECT_RECORD_SLUG,
  title:draft.name,status:'planning',payload:{
    schemaVersion:1,clientId:CLIENT,managerId:'actor-a',description:'Implementación'
  },createdAt:'2026-10-15T17:00:00.000Z',updatedAt:'2026-10-15T17:00:00.000Z',...changes
});
function fixture({clientTenant='tenant-a',actorTenant='tenant-a',auditFailure=false,pkConflict=false,
  clientActive=true,actorActive=true}={}){
  const calls=[],committed=[],reads=[];
  const db={
    async $transaction(fn){
      const pending=[];
      const tx={
        client:{findFirst:async args=>{
          calls.push(['client',args]);
          return clientActive?{id:CLIENT,tenantId:clientTenant}:null;
        }},
        userProfile:{findFirst:async args=>{
          calls.push(['actor',args]);
          return actorActive?{id:'actor-a',tenantId:actorTenant}:null;
        }},
        moduleRecord:{create:async args=>{
          pending.push(['project',args]);
          if(pkConflict)throw Object.assign(new Error('duplicate'),{code:'P2002'});
          return row({id:args.data.id,tenantId:args.data.tenantId,moduleSlug:args.data.moduleSlug,
            title:args.data.title,status:args.data.status,payload:args.data.payload});
        }},
        auditLog:{create:async args=>{
          pending.push(['audit',args]);
          if(auditFailure)throw new Error('AUDIT_UNAVAILABLE');
          return {id:'audit-a'};
        }}
      };
      const result=await fn(tx);
      committed.push(...pending);
      return result;
    },
    moduleRecord:{findMany:async args=>{reads.push(args);return [row()]}}
  };
  return {db,calls,committed,reads};
}
const create=(db,extra={})=>createProjectRecord({
  db,tenantId:'tenant-a',actorId:'actor-a',idempotencyKey:KEY,draft,...extra
});

test('#761 project create persists tenant/client/manager and audit atomically',async()=>{
  const {db,calls,committed}=fixture();
  const r=await create(db);
  assert.equal(committed.length,2);
  const data=committed[0][1].data;
  assert.equal(data.tenantId,'tenant-a');
  assert.equal(data.id,projectIdFromAttempt('tenant-a',KEY));
  assert.equal(data.moduleSlug,PROJECT_RECORD_SLUG);
  assert.equal(data.payload.clientId,CLIENT);
  assert.equal(data.payload.managerId,'actor-a');
  assert.equal(data.status,'planning');
  assert.equal(committed[1][1].data.action,'project.create');
  assert.equal(committed[1][1].data.entityId,data.id);
  assert.equal(r.clientId,CLIENT);
  assert.equal(r.managerId,'actor-a');
  assert.equal(calls[0][1].where.tenantId,'tenant-a');
  assert.equal(calls[0][1].where.active,true);
  assert.equal(calls[1][1].where.tenantId,'tenant-a');
  assert.equal(calls[1][1].where.status,'active');
});

test('#761 audit failure rolls back project create',async()=>{
  const {db,committed}=fixture({auditFailure:true});
  await assert.rejects(create(db),/AUDIT_UNAVAILABLE/);
  assert.equal(committed.length,0);
});

test('#761 cross-tenant client or actor cannot create a project',async()=>{
  for(const bad of [{clientTenant:'tenant-b'},{actorTenant:'tenant-b'},
    {clientActive:false},{actorActive:false}]){
    const {db,committed}=fixture(bad);
    await assert.rejects(create(db),ProjectOwnerNotFound);
    assert.equal(committed.length,0);
  }
});

test('#761 idempotency key maps to a stable tenant-scoped v5 UUID',()=>{
  assert.equal(projectIdFromAttempt('tenant-a',KEY),projectIdFromAttempt('tenant-a',KEY.toUpperCase()));
  assert.notEqual(projectIdFromAttempt('tenant-a',KEY),projectIdFromAttempt('tenant-b',KEY));
  assert.match(projectIdFromAttempt('tenant-a',KEY),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for(const key of ['bad',null,'00000000-0000-0000-0000-000000000000']){
    assert.throws(()=>projectIdFromAttempt('tenant-a',key),/PROJECT_IDEMPOTENCY_KEY_INVALID/);
  }
});

test('#761 duplicate insert rejects replay before audit',async()=>{
  const {db,committed}=fixture({pkConflict:true});
  await assert.rejects(create(db),ProjectReplayConflict);
  assert.equal(committed.length,0);
});

test('#761 trusted body allowlist excludes tenant, manager and invoice authority',()=>{
  assert.deepEqual(validateProjectDraft(draft),draft);
  for(const malicious of [{...draft,tenantId:'tenant-b'}, {...draft,managerId:'attacker'},
    {...draft,invoiceId:'invoice-a'}, {...draft,status:'active'}, {...draft,budget:'100.00'}]){
    assert.throws(()=>validateProjectDraft(malicious),/PROJECT_DRAFT_UNKNOWN_FIELD/);
  }
  for(const invalid of [null,{},'bad',{...draft,name:'A'}, {...draft,clientId:'client-a'},
    {...draft,description:'a'.repeat(2001)}]){
    assert.throws(()=>validateProjectDraft(invalid));
  }
});

test('#761 invalid principal, tenant or transaction fails before write',async()=>{
  const {db,committed}=fixture();
  await assert.rejects(create(db,{tenantId:''}),/PROJECT_TENANT_REQUIRED/);
  await assert.rejects(create(db,{actorId:''}),/PROJECT_ACTOR_REQUIRED/);
  await assert.rejects(create(null),/PROJECT_TRANSACTION_REQUIRED/);
  assert.equal(committed.length,0);
});

test('#761 listing bounds page and scopes tenant+private project slug',async()=>{
  const {db,reads}=fixture();
  const response=await listProjectRecords({db,tenantId:'tenant-a',take:10,skip:3});
  assert.equal(response.items.length,1);
  assert.equal(response.items[0].status,'planning');
  assert.equal(response.pagination.hasMore,false);
  assert.deepEqual(reads[0],{
    where:{tenantId:'tenant-a',moduleSlug:PROJECT_RECORD_SLUG},
    take:11,skip:3,orderBy:[{createdAt:'desc'},{id:'desc'}]
  });
  assert.equal(Object.isFrozen(response),true);
  for(const take of [0,-1,101,Infinity,1.5]){
    await assert.rejects(listProjectRecords({db,tenantId:'tenant-a',take}),/PROJECT_PAGE_INVALID/);
  }
});

test('#761 paging hasMore only when a bounded extra record exists',async()=>{
  const db={moduleRecord:{findMany:async()=>[row({id:'a'}),row({id:'b'})]}};
  const response=await listProjectRecords({db,tenantId:'tenant-a',take:1});
  assert.equal(response.items.length,1);
  assert.equal(response.pagination.hasMore,true);
  assert.equal(response.pagination.nextSkip,1);
});

test('#761 compromised store cross-tenant record is not serialized',async()=>{
  for(const bad of [row({tenantId:'tenant-b'}),row({moduleSlug:'crm-leads'}),
    row({payload:{clientId:CLIENT,managerId:'actor-a'}})]){
    const db={moduleRecord:{findMany:async()=>[bad]}};
    await assert.rejects(listProjectRecords({db,tenantId:'tenant-a'}),/PROJECT_TENANT_DATA_LEAK_BLOCKED/);
  }
});

test('#761 only dedicated route owns Project writes (not generic Stitch CRUD)',()=>{
  const moduleRoutes=readFileSync(new URL('../backend/src/modules/modules/modules.routes.ts',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../backend/src/modules/projects/project-record.routes.ts',import.meta.url),'utf8');
  const registry=JSON.parse(readFileSync(new URL('../backend/src/modules/modules/module-registry.json',import.meta.url),'utf8'));
  assert.equal(registry.some(x=>x.slug===PROJECT_RECORD_SLUG),false);
  assert.match(moduleRoutes,/router\.use\('\/projects',projectRecordRoutes\)/);
  assert.match(moduleRoutes,/if \(!allowed\.has\(req\.params\.slug\)\)/);
  assert.match(routes,/router\.use\(requireTenant\)/);
  assert.match(routes,/router\.post\('\/',requirePermission\('modules\.manage'\)/);
  assert.match(routes,/router\.get\('\/',requirePermission\('modules\.manage'\)/);
  assert.match(routes,/actorId:ctx\.userId/);
  assert.match(routes,/idempotencyKey,draft:req\.body/);
  assert.match(routes,/validateBody\(draftSchema\)/);
  assert.match(routes,/\.strict\(\)/);
  assert.doesNotMatch(routes,/prisma\.salesInvoice\.(?:create|update)/);
});

test('#761 no posting, approval, ledger or invoice code in storage service',()=>{
  const src=readFileSync(new URL('../backend/src/modules/projects/project-record-store.ts',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\.(?:salesInvoice|ledgerEntry|timeEntry|projectApproval)\.(?:create|update|upsert)\(/);
  assert.match(src,/await tx\.auditLog\.create/);
  assert.match(src,/await db\.\$transaction\(/);
});
