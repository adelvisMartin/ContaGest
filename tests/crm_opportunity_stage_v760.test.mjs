import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planOpportunityLoss,markCrmOpportunityLost,
  CrmOpportunityNotFoundError,CrmOpportunityStaleError,CrmOpportunityStageError
} from '../backend/src/modules/crm/crm-opportunity-stage.mjs';

const OP_ID='f1bdc4b1-b7dd-51c1-90c2-6df63a2762e0';
const REV='2026-10-15T18:30:00.000Z';
const REV2='2026-10-15T18:31:00.000Z';
const before=(override={})=>({
  id:OP_ID,tenantId:'tenant-a',moduleSlug:'crm-opportunities',status:'qualified',
  updatedAt:new Date(REV),...override
});
const input=(override={})=>({
  tenantId:'tenant-a',actorId:'actor-a',opportunityId:OP_ID,
  expectedUpdatedAt:REV,...override
});
function store({first=before(),last=before({status:'lost',updatedAt:new Date(REV2)}),count=1,auditFails=false}={}){
  const attempted=[],committed=[];
  return {
    attempted,committed,db:{
      async $transaction(fn){
        let reads=0;
        const tx={
          moduleRecord:{
            findFirst:async args=>{attempted.push(['read',args]);return reads++===0?first:last;},
            updateMany:async args=>{attempted.push(['cas',args]);return{count};}
          },
          auditLog:{
            create:async args=>{
              attempted.push(['audit',args]);if(auditFails)throw Error('AUDIT_ABORTED');return{id:'audit'};
            }
          }
        };
        const result=await fn(tx);
        committed.push(...attempted.filter(x=>x[0]!=='read'));
        return result;
      }
    }
  };
}
test('qualified→lost is the only standalone transition before Quote authority',()=>{
 assert.deepEqual(planOpportunityLoss({stage:'qualified',expectedUpdatedAt:REV}),{
  from:'qualified',to:'lost',expectedUpdatedAt:REV
 });
 for(const stage of ['new','proposal','won','lost','negotiation']){
  assert.throws(()=>planOpportunityLoss({stage,expectedUpdatedAt:REV}),CrmOpportunityStageError);
 }
});
test('requires exact UTC milliseconds and rejects invalid calendar dates',()=>{
 for(const revision of [undefined,'2026-10-15T18:30:00Z','2026-02-30T18:30:00.000Z','2026-10-15T18:30:00.000+00:00']){
  assert.throws(()=>planOpportunityLoss({stage:'qualified',expectedUpdatedAt:revision}),/CRM_OPPORTUNITY_REVISION_REQUIRED/);
 }
});
test('successful tenant CAS, minimal AuditLog and final read share one transaction',async()=>{
 const s=store();
 const result=await markCrmOpportunityLost({...input(),db:s.db,ipAddress:'127.0.0.1'});
 assert.deepEqual(result,{id:OP_ID,stage:'lost',updatedAt:REV2});
 assert.ok(Object.isFrozen(result));
 assert.deepEqual(s.attempted.map(x=>x[0]),['read','cas','audit','read']);
 assert.equal(s.committed.length,2);
 assert.deepEqual(s.attempted[0][1].where,{id:OP_ID,tenantId:'tenant-a',moduleSlug:'crm-opportunities'});
 assert.deepEqual(s.attempted[1][1].where,{
  id:OP_ID,tenantId:'tenant-a',moduleSlug:'crm-opportunities',
  status:'qualified',updatedAt:new Date(REV)
 });
 assert.deepEqual(s.attempted[1][1].data,{status:'lost'});
 const audit=s.attempted[2][1].data;
 assert.equal(audit.tenantId,'tenant-a');
 assert.equal(audit.userId,'actor-a');
 assert.equal(audit.action,'crm.opportunity.stage.lost');
 assert.deepEqual(audit.before,{moduleSlug:'crm-opportunities',stage:'qualified'});
 assert.deepEqual(audit.after,{moduleSlug:'crm-opportunities',stage:'lost'});
 assert.doesNotMatch(JSON.stringify(audit),/USD|expectedValue|probability|ventas@example/);
});
test('absent opportunity is 404 semantic error with no attempted write',async()=>{
 const s=store({first:null});
 await assert.rejects(markCrmOpportunityLost({...input(),db:s.db}),CrmOpportunityNotFoundError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
 assert.deepEqual(s.committed,[]);
});
test('fake repository cannot return another tenant or ModuleRecord type',async()=>{
 for(const row of [
  before({tenantId:'tenant-b'}),
  before({moduleSlug:'projects'}),
  before({id:'f00c5d99-70d2-563f-8cfa-000000000000'})
 ]){
  const s=store({first:row});
  await assert.rejects(markCrmOpportunityLost({...input(),db:s.db}),CrmOpportunityNotFoundError);
  assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
 }
});
test('terminal lost or unauthorized proposal/won stages cannot transition',async()=>{
 for(const status of ['lost','proposal','won']){
  const s=store({first:before({status})});
  await assert.rejects(markCrmOpportunityLost({...input(),db:s.db}),CrmOpportunityStageError);
  assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
 }
});
test('stale revision stops without update or audit',async()=>{
 const s=store();
 await assert.rejects(markCrmOpportunityLost({...input({expectedUpdatedAt:REV2}),db:s.db}),CrmOpportunityStaleError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read']);
});
test('CAS loser returns conflict and skips audit',async()=>{
 const s=store({count:0});
 await assert.rejects(markCrmOpportunityLost({...input(),db:s.db}),CrmOpportunityStaleError);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read','cas']);
 assert.deepEqual(s.committed,[]);
});
test('audit failure rolls back conditional update in transaction',async()=>{
 const s=store({auditFails:true});
 await assert.rejects(markCrmOpportunityLost({...input(),db:s.db}),/AUDIT_ABORTED/);
 assert.deepEqual(s.attempted.map(x=>x[0]),['read','cas','audit']);
 assert.deepEqual(s.committed,[]);
});
test('invalid final row aborts whole transaction before commit',async()=>{
 for(const last of [null,before({status:'qualified'}),before({tenantId:'tenant-b',status:'lost'})]){
  const s=store({last});
  await assert.rejects(markCrmOpportunityLost({...input(),db:s.db}),/CRM_OPPORTUNITY_POST_WRITE_INVALID/);
  assert.deepEqual(s.committed,[]);
 }
});
test('tenant actor ID and revision fail before any Prisma query',async()=>{
 const s=store();
 for(const patch of [
  {tenantId:''},{actorId:''},{opportunityId:'../../leak'},
  {expectedUpdatedAt:'junk'}
 ]){
  await assert.rejects(markCrmOpportunityLost({...input(patch),db:s.db}));
 }
 assert.deepEqual(s.attempted,[]);
});
test('route uses RBAC and maps 404, 409 and invalid UUID without Client mutations',()=>{
 const src=readFileSync(new URL('../backend/src/modules/crm/crm-opportunities.routes.ts',import.meta.url),'utf8');
 assert.match(src,/router\.patch\('\/:id\/lost',requirePermission\('sales\.manage'\)/);
 assert.match(src,/validateBody\(lossSchema\)/);
 assert.match(src,/CrmOpportunityNotFoundError/);
 assert.match(src,/CrmOpportunityStaleError/);
 assert.match(src,/CrmOpportunityStageError/);
 assert.match(src,/Cache-Control','private, no-store'/);
 assert.doesNotMatch(src,/prisma\.client\.(?:create|update|upsert)/);
});
test('production backend dist includes opportunity stage ESM',()=>{
 const src=readFileSync(new URL('../backend/scripts/copy-runtime-assets.mjs',import.meta.url),'utf8');
 assert.match(src,/src\/modules\/crm\/crm-opportunity-stage\.mjs/);
 assert.match(src,/dist\/src\/modules\/crm\/crm-opportunity-stage\.mjs/);
});
