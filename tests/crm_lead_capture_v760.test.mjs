import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CRM_LEAD_MODULE, CRM_LEAD_MAX_PAGE, validateCrmLeadDraft,
  createCrmLead, listCrmLeads, serializeCrmLead, deterministicLeadId, CrmLeadReplayError
} from '../backend/src/modules/crm/crm-lead-store.mjs';

const idempotencyKey='4a9d94bd-3ef9-49a1-bf1a-09c48e2bf1cc';
const sample = {name:'Comercial Acme',rif:'J-12345678-9',email:'VENTAS@EXAMPLE.COM',nextActionAt:'2026-10-20T18:00:00.000Z'};
const row = (data={}) => ({
  id:'lead-1',tenantId:'tenant-a',moduleSlug:CRM_LEAD_MODULE,title:'Comercial Acme',
  status:'new',payload:{ownerId:'actor-1',rif:'J123456789',email:'ventas@example.com'},
  createdAt:'2026-10-15T16:00:00.000Z',updatedAt:'2026-10-15T16:00:00.000Z',...data
});

function transactionalDb({failAudit=false}={}){
  const writes=[],reads=[];
  const db={
    async $transaction(run){
      const pending=[];
      const tx={
        moduleRecord:{create:async args=>{
          pending.push(['lead',args]);return row({tenantId:args.data.tenantId,title:args.data.title,status:args.data.status,payload:args.data.payload});
        }},
        auditLog:{create:async args=>{
          pending.push(['audit',args]);
          if(failAudit)throw Error('AUDIT_WRITE_FAILED');
          return {id:'audit-1'};
        }}
      };
      const result=await run(tx);
      writes.push(...pending);return result;
    },
    moduleRecord:{findMany:async args=>{reads.push(args);return [row()]}}
  };
  return {db,writes,reads};
}
test('lead input normalizes taxpayer identity and does not invent a Client',()=>{
  assert.deepEqual(validateCrmLeadDraft(sample),{
    name:'Comercial Acme',rif:'J123456789',email:'ventas@example.com',
    phone:null,notes:null,nextActionAt:'2026-10-20T18:00:00.000Z'
  });
});
test('email-only prospect is allowed as lead, never auto-converted to customer',()=>{
  const d=validateCrmLeadDraft({name:'Empresa prospecto',email:'A@EXAMPLE.COM'});
  assert.equal(d.rif,null);
  assert.equal(d.email,'a@example.com');
});
test('no validated fiscal/contact identity fails closed',()=>{
  for(const draft of [{name:'AB'},{name:'AB',rif:'no-rif'},{name:'AB',email:'no-email'},null]){
    assert.throws(()=>validateCrmLeadDraft(draft));
  }
});
test('rejects malformed dates and input overflow',()=>{
  for(const value of ['2026-02-30T18:00:00.000Z','2026-10-20','2026-10-20T18:00:00+00:00'])
    assert.throws(()=>validateCrmLeadDraft({...sample,nextActionAt:value}));
  assert.throws(()=>validateCrmLeadDraft({...sample,notes:'x'.repeat(2001)}));
});
test('atomic create inserts the lead and minimal audit in the same callback',async()=>{
  const {db,writes}=transactionalDb();
  const result=await createCrmLead({db,tenantId:'tenant-a',actorId:'actor-1',idempotencyKey,draft:{...sample,tenantId:'spoof',ownerId:'spoof'},ipAddress:'127.0.0.1'});
  assert.equal(result.id,'lead-1');
  assert.equal(result.name,'Comercial Acme');
  assert.equal(writes.length,2);
  assert.equal(writes[0][0],'lead');
  assert.equal(writes[0][1].data.tenantId,'tenant-a');
  assert.equal(writes[0][1].data.id,deterministicLeadId('tenant-a',idempotencyKey));
  assert.equal(writes[0][1].data.payload.ownerId,'actor-1');
  assert.equal(writes[0][1].data.moduleSlug,CRM_LEAD_MODULE);
  assert.equal(writes[1][0],'audit');
  assert.equal(writes[1][1].data.action,'crm.lead.create');
  assert.equal(writes[1][1].data.entityId,'lead-1');
  assert.doesNotMatch(JSON.stringify(writes[1][1].data.after),/example.com|J123/);
});
test('audit insert failing aborts the transaction rather than allowing untracked lead',async()=>{
  const {db,writes}=transactionalDb({failAudit:true});
  await assert.rejects(createCrmLead({db,tenantId:'tenant-a',actorId:'actor-1',idempotencyKey,draft:sample}),/AUDIT_WRITE_FAILED/);
  assert.equal(writes.length,0);
});
test('tenant and authenticated actor required before writing',async()=>{
  const {db,writes}=transactionalDb();
  await assert.rejects(createCrmLead({db,tenantId:'',actorId:'actor-1',idempotencyKey,draft:sample}),/CRM_TENANT_REQUIRED/);
  await assert.rejects(createCrmLead({db,tenantId:'tenant-a',actorId:'',idempotencyKey,draft:sample}),/CRM_ACTOR_REQUIRED/);
  assert.equal(writes.length,0);
});
test('lead list always scopes tenant+slug and bounds pagination',async()=>{
  const {db,reads}=transactionalDb();
  const result=await listCrmLeads({db,tenantId:'tenant-a',take:10,skip:20});
  assert.equal(result.length,1);
  assert.deepEqual(reads[0],{
    where:{tenantId:'tenant-a',moduleSlug:CRM_LEAD_MODULE,status:{not:'archived'}},
    take:10,skip:20,orderBy:[{createdAt:'desc'},{id:'desc'}]
  });
});
test('lead list rejects foreign tenant records returned by a broken repository',async()=>{
  const db={moduleRecord:{findMany:async()=>[row({tenantId:'tenant-b'})]}};
  await assert.rejects(listCrmLeads({db,tenantId:'tenant-a'}),/CRM_TENANT_DATA_LEAK_BLOCKED/);
});
test('invalid offsets and unbounded page sizes are refused',async()=>{
  const {db}=transactionalDb();
  for(const value of [0,-1,101,1.5,Infinity])await assert.rejects(listCrmLeads({db,tenantId:'tenant-a',take:value}),/CRM_PAGE_LIMIT/);
  for(const value of [-1,10001,NaN])await assert.rejects(listCrmLeads({db,tenantId:'tenant-a',skip:value}),/CRM_PAGE_OFFSET/);
  assert.equal(CRM_LEAD_MAX_PAGE,100);
});
test('serialization exposes only CRM payload and not other ModuleRecords',()=>{
  const r=serializeCrmLead(row());
  assert.equal(r.stage,'new');
  assert.equal(r.ownerId,'actor-1');
  assert.ok(Object.isFrozen(r));
  assert.throws(()=>serializeCrmLead(row({moduleSlug:'tasks'})),/NOT_CRM_LEAD/);
});
test('real route enforces tenant, sales permissions and server-owned actor',()=>{
  const route=readFileSync(new URL('../backend/src/modules/crm/crm-leads.routes.ts',import.meta.url),'utf8');
  assert.match(route,/router\.use\(requireTenant\)/);
  assert.match(route,/router\.get\('\/',requirePermission\('sales\.view'\)/);
  assert.match(route,/router\.post\('\/',requirePermission\('sales\.manage'\)/);
  assert.match(route,/if \(!ctx\.userId\) throw new HttpError\(403/);
  assert.match(route,/actorId:ctx\.userId/);
  assert.match(route,/req\.header\('Idempotency-Key'\)/);
  assert.match(route,/error instanceof CrmLeadReplayError/);
  assert.match(route,/validateBody\(leadDraftSchema\)/);
  assert.match(route,/\.strict\(\)/);
  assert.doesNotMatch(route,/prisma\.client\.(?:create|update|upsert)/);
});
test('mounted under existing module manifest without expanding 51 route entries',()=>{
  const moduleRoute=readFileSync(new URL('../backend/src/modules/modules/modules.routes.ts',import.meta.url),'utf8');
  const manifest=readFileSync(new URL('../backend/src/modules/route-manifest.ts',import.meta.url),'utf8');
  assert.match(moduleRoute,/router\.use\('\/crm\/leads',crmLeadRoutes\)/);
  assert.match(manifest,/id: 'modules'/);
  assert.doesNotMatch(manifest,/id: 'crm'/);
});
test('production asset copy contains actual CRM ESM lead store',()=>{
  const asset=readFileSync(new URL('../backend/scripts/copy-runtime-assets.mjs',import.meta.url),'utf8');
  assert.match(asset,/src\/modules\/crm\/crm-lead-store\.mjs/);
  assert.match(asset,/dist\/src\/modules\/crm\/crm-lead-store\.mjs/);
});

test('CRM lead storage namespace cannot be reached through generic Stitch records',()=>{
  const registry=JSON.parse(readFileSync(new URL('../backend/src/modules/modules/module-registry.json',import.meta.url),'utf8'));
  assert.equal(registry.some(item=>item.slug===CRM_LEAD_MODULE),false);
  const source=readFileSync(new URL('../backend/src/modules/modules/modules.routes.ts',import.meta.url),'utf8');
  assert.match(source,/if \(!allowed\.has\(req\.params\.slug\)\)/);
});


test('tenant-keyed idempotency UUID is deterministic and canonical',()=>{
 const first=deterministicLeadId('tenant-a',idempotencyKey);
 assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(first,deterministicLeadId('tenant-a',idempotencyKey.toUpperCase()));
 assert.notEqual(first,deterministicLeadId('tenant-b',idempotencyKey));
});
test('invalid attempt keys cannot write CRM lead',async()=>{
 const {db,writes}=transactionalDb();
 for(const key of ['', 'not-a-uuid','00000000-0000-0000-0000-000000000000']){
  await assert.rejects(createCrmLead({db,tenantId:'tenant-a',actorId:'actor-1',idempotencyKey:key,draft:sample}),/CRM_IDEMPOTENCY_KEY_REQUIRED/);
 }
 assert.equal(writes.length,0);
});
test('unique PK conflict maps to CRM replay error instead of inserting again',async()=>{
 let calls=0;
 const db={$transaction:async run=>run({
  moduleRecord:{create:async()=>{calls++;throw Object.assign(new Error('unique'),{code:'P2002'});}},
  auditLog:{create:async()=>{throw Error('AUDIT_SHOULD_NOT_RUN');}}
 })};
 await assert.rejects(createCrmLead({db,tenantId:'tenant-a',actorId:'actor-1',idempotencyKey,draft:sample}),CrmLeadReplayError);
 assert.equal(calls,1);
});
test('non-uniqueness transaction errors preserve error semantics',async()=>{
 const db={$transaction:async()=>{throw Error('DB_UNAVAILABLE')}};
 await assert.rejects(createCrmLead({db,tenantId:'tenant-a',actorId:'actor-1',idempotencyKey,draft:sample}),/DB_UNAVAILABLE/);
});
