import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CRM_OPPORTUNITY_MODULE, CRM_OPPORTUNITY_MAX_PAGE, opportunityIdForLead,
  validateOpportunityDraft, serializeCrmOpportunity, createOpportunityFromQualifiedLead,
  listCrmOpportunities, CrmOpportunityConflictError, CrmOpportunityLeadNotFoundError
} from '../backend/src/modules/crm/crm-opportunity-store.mjs';

const leadId='8ac836d4-04d8-5190-a2a1-0ca3ff1d4812';
const revised='2026-10-15T17:30:12.230Z';
const draft={title:'Servicio empresarial',currency:'USD',expectedValue:'1099.9',probability:70,expectedLeadUpdatedAt:revised};
const existingLead=(options={})=>({
  id:leadId,tenantId:'tenant-a',moduleSlug:'crm-leads',status:'qualified',updatedAt:new Date(revised),...options
});
const record=(data={})=>({
  id:opportunityIdForLead('tenant-a',leadId),tenantId:'tenant-a',moduleSlug:CRM_OPPORTUNITY_MODULE,
  title:'Servicio empresarial',status:'qualified',
  payload:{schemaVersion:1,leadId,ownerId:'actor-a',currency:'USD',expectedValue:'1099.90',probability:70},
  createdAt:new Date(revised),updatedAt:new Date(revised),...data
});
const request=(extra={})=>({tenantId:'tenant-a',actorId:'actor-a',leadId,draft,...extra});
function fakeStore({lead=existingLead(),count=1,failAudit=false,failDuplicate=false}={}){
  const attempted=[],committed=[];
  const db={
    async $transaction(fn){
      const tx={
        moduleRecord:{
          findFirst:async arg=>{attempted.push(['read',arg]);return lead;},
          updateMany:async arg=>{attempted.push(['cas',arg]);return{count};},
          create:async arg=>{
            attempted.push(['create',arg]);
            if(failDuplicate)throw Object.assign(new Error('unique'),{code:'P2002'});
            return record({tenantId:arg.data.tenantId,title:arg.data.title,status:arg.data.status,payload:arg.data.payload});
          }
        },
        auditLog:{create:async arg=>{attempted.push(['audit',arg]);if(failAudit)throw Error('AUDIT_ABORT');return{id:'audit'}}}
      };
      const result=await fn(tx);
      committed.push(...attempted.filter(x=>['cas','create','audit'].includes(x[0])));
      return result;
    },
    moduleRecord:{findMany:async arg=>{attempted.push(['list',arg]);return[record()]}}
  };
  return {db,attempted,committed};
}
test('one tenant+lead maps to stable UUIDv5-shaped opportunity ID',()=>{
 const id=opportunityIdForLead('tenant-a',leadId);
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(id,opportunityIdForLead('tenant-a',leadId.toUpperCase()));
 assert.notEqual(id,opportunityIdForLead('tenant-b',leadId));
 assert.throws(()=>opportunityIdForLead('tenant-a','../other'));
});
test('normalizes fixed-scale positive amount without float imprecision',()=>{
 assert.deepEqual(validateOpportunityDraft(draft),{
  title:'Servicio empresarial',currency:'USD',expectedValue:'1099.90',probability:70,expectedLeadUpdatedAt:revised
 });
});
test('rejects invalid money/currency/probability and invalid timestamps',()=>{
 for(const patch of [
  {expectedValue:'0'},{expectedValue:'-1'},{expectedValue:'1.001'},
  {expectedValue:12.34},{currency:'Bs'},{currency:'usd'},
  {probability:101},{probability:0.5},{probability:'50'},
  {title:' '},{expectedLeadUpdatedAt:'2026-02-30T17:30:12.230Z'}
 ])assert.throws(()=>validateOpportunityDraft({...draft,...patch}));
});
test('qualified lead opportunity and private audit commit in one transaction',async()=>{
 const s=fakeStore();
 const result=await createOpportunityFromQualifiedLead({...request(),db:s.db,ipAddress:'127.0.0.1'});
 assert.equal(result.id,opportunityIdForLead('tenant-a',leadId));
 assert.equal(result.leadId,leadId);
 assert.equal(result.expectedValue,'1099.90');
 assert.equal(result.stage,'qualified');
 assert.equal(s.attempted.map(x=>x[0]).join(','),'read,cas,create,audit');
 assert.equal(s.committed.length,3);
 assert.deepEqual(s.attempted[0][1].where,{id:leadId,tenantId:'tenant-a',moduleSlug:'crm-leads'});
 const lock=s.attempted[1][1];
 assert.equal(lock.where.status,'qualified');
 assert.equal(lock.where.updatedAt.toISOString(),revised);
 assert.equal(lock.where.tenantId,'tenant-a');
 assert.deepEqual(lock.data,{status:'qualified'});
 const create=s.attempted[2][1].data;
 assert.equal(create.id,opportunityIdForLead('tenant-a',leadId));
 assert.equal(create.tenantId,'tenant-a');
 assert.equal(create.moduleSlug,CRM_OPPORTUNITY_MODULE);
 assert.equal(create.payload.ownerId,'actor-a');
 const audit=s.attempted[3][1].data;
 assert.equal(audit.action,'crm.opportunity.create');
 assert.equal(audit.entityId,create.id);
 assert.doesNotMatch(JSON.stringify(audit.after),/USD|1099.90|ventas@example/);
});
test('missing or foreign-tenant lead aborts with no writes',async()=>{
 const s=fakeStore({lead:null});
 await assert.rejects(createOpportunityFromQualifiedLead({...request(),db:s.db}),CrmOpportunityLeadNotFoundError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
 assert.equal(s.committed.length,0);
});
test('foreign, mis-typed, or mismatched lead from broken reader fails closed',async()=>{
 for(const row of [
  existingLead({tenantId:'tenant-b'}),
  existingLead({moduleSlug:'crm-leads-foreign'}),
  existingLead({id:'f5b9ec95-a0c4-55ab-a91e-7484d741b82d'})
 ]){
  const s=fakeStore({lead:row});
  await assert.rejects(createOpportunityFromQualifiedLead({...request(),db:s.db}),CrmOpportunityLeadNotFoundError);
  assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
  assert.equal(s.committed.length,0);
 }
});
test('lead not qualified or previously lost blocks opportunity creation',async()=>{
 for(const status of ['new','lost','won']){
  const s=fakeStore({lead:existingLead({status})});
  await assert.rejects(createOpportunityFromQualifiedLead({...request(),db:s.db}),CrmOpportunityConflictError);
  assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
 }
});
test('stale last-modified value stops before acquiring update lock',async()=>{
 const s=fakeStore();
 await assert.rejects(createOpportunityFromQualifiedLead({...request({draft:{...draft,expectedLeadUpdatedAt:'2026-10-15T18:00:00.000Z'}}),db:s.db}),CrmOpportunityConflictError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
});
test('concurrent qualified→lost CAS loser never creates opportunity or audit',async()=>{
 const s=fakeStore({count:0});
 await assert.rejects(createOpportunityFromQualifiedLead({...request(),db:s.db}),CrmOpportunityConflictError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read','cas']);
 assert.equal(s.committed.length,0);
});
test('second opportunity maps unique database conflict to 409 domain conflict',async()=>{
 const s=fakeStore({failDuplicate:true});
 await assert.rejects(createOpportunityFromQualifiedLead({...request(),db:s.db}),CrmOpportunityConflictError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read','cas','create']);
 assert.equal(s.committed.length,0);
});
test('audit failure causes full transaction rollback',async()=>{
 const s=fakeStore({failAudit:true});
 await assert.rejects(createOpportunityFromQualifiedLead({...request(),db:s.db}),/AUDIT_ABORT/);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read','cas','create','audit']);
 assert.equal(s.committed.length,0);
});
test('tenant actor and unknown input fail before database access',async()=>{
 const s=fakeStore();
 for(const x of [
  {tenantId:''},{actorId:''},{leadId:'xxx'},
  {draft:{...draft,expectedValue:'0'}}
 ]) await assert.rejects(createOpportunityFromQualifiedLead({...request(x),db:s.db}));
 assert.equal(s.attempted.length,0);
});
test('list enforces bound, tenant, record authority and deterministic order',async()=>{
 const s=fakeStore();
 const result=await listCrmOpportunities({db:s.db,tenantId:'tenant-a',take:10,skip:5});
 assert.equal(result.length,1);
 assert.deepEqual(s.attempted[0][1],{
  where:{tenantId:'tenant-a',moduleSlug:CRM_OPPORTUNITY_MODULE,status:{not:'archived'}},
  take:10,skip:5,orderBy:[{createdAt:'desc'},{id:'desc'}]
 });
 assert.equal(CRM_OPPORTUNITY_MAX_PAGE,100);
});
test('rejects invalid pagination and leaked rows from broken Prisma delegate',async()=>{
 const s=fakeStore();
 for(const take of [-1,0,101,1.4])await assert.rejects(listCrmOpportunities({db:s.db,tenantId:'tenant-a',take}));
 for(const skip of [-1,10001,0.5])await assert.rejects(listCrmOpportunities({db:s.db,tenantId:'tenant-a',skip}));
 const db={moduleRecord:{findMany:async()=>[record({tenantId:'tenant-b'})]}};
 await assert.rejects(listCrmOpportunities({db,tenantId:'tenant-a'}),/CRM_OPPORTUNITY_TENANT_LEAK_BLOCKED/);
});
test('opportunity serializer rejects other ModuleRecord domains',()=>{
 assert.throws(()=>serializeCrmOpportunity(record({moduleSlug:'crm-leads'})));
 assert.equal(serializeCrmOpportunity(record()).currency,'USD');
});
test('router maps qualified lead, permission and duplicate errors without Client writes',()=>{
 const route=readFileSync(new URL('../backend/src/modules/crm/crm-opportunities.routes.ts',import.meta.url),'utf8');
 assert.match(route,/router\.use\(requireTenant\)/);
 assert.match(route,/requirePermission\('sales\.manage'\)/);
 assert.match(route,/requirePermission\('sales\.view'\)/);
 assert.match(route,/validateBody\(opportunitySchema\)/);
 assert.match(route,/CrmOpportunityConflictError/);
 assert.match(route,/CrmOpportunityLeadNotFoundError/);
 assert.match(route,/\.strict\(\)/);
 assert.doesNotMatch(route,/prisma\.client\.(create|update|upsert)/);
});
test('new routes share module manifest and backend dist gets new ESM module',()=>{
 const mod=readFileSync(new URL('../backend/src/modules/modules/modules.routes.ts',import.meta.url),'utf8');
 const copy=readFileSync(new URL('../backend/scripts/copy-runtime-assets.mjs',import.meta.url),'utf8');
 assert.match(mod,/router\.use\('\/crm\/opportunities',crmOpportunityRoutes\)/);
 assert.match(copy,/src\/modules\/crm\/crm-opportunity-store\.mjs/);
 assert.match(copy,/dist\/src\/modules\/crm\/crm-opportunity-store\.mjs/);
});
