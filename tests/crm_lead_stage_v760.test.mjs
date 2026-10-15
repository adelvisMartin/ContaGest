import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planLeadStageTransition, transitionCrmLeadStage,
  CrmLeadConflictError, CrmLeadNotFoundError, CrmLeadStageError
} from '../backend/src/modules/crm/crm-lead-stage.mjs';

const LEAD_ID='00a94043-3ec9-5cef-9019-443c9da5369b';
const OLD='2026-10-15T17:30:12.230Z';
const NEW='2026-10-15T17:31:00.000Z';
const record=(status='new')=>({id:LEAD_ID,tenantId:'tenant-a',moduleSlug:'crm-leads',status,updatedAt:new Date(OLD)});
const request=(overrides={})=>({
 tenantId:'tenant-a',actorId:'actor-1',leadId:LEAD_ID,nextStage:'qualified',
 expectedUpdatedAt:OLD,...overrides
});
function store({row=record(),count=1,auditError=false,afterRow}={}){
 const calls=[],persisted=[];
 return {
  calls,persisted,
  db:{$transaction:async(callback)=>{
   const tx={
    moduleRecord:{
     findFirst:async args=>{calls.push(['read',args]);return calls.filter(x=>x[0]==='read').length===1?row:afterRow===undefined?record('qualified'):afterRow},
     updateMany:async args=>{calls.push(['update',args]);return{count}},
    },
    auditLog:{create:async args=>{calls.push(['audit',args]);if(auditError)throw Error('AUDIT_ROLLBACK');return{id:'audit-a'}}}
   };
   const result=await callback(tx);
   persisted.push(...calls.filter(x=>x[0]==='update'||x[0]==='audit'));return result;
  }}
 };
}
test('pure lead transition allows only new→qualified/lost and qualified→lost',()=>{
 assert.equal(planLeadStageTransition({from:'new',to:'qualified',expectedUpdatedAt:OLD}).to,'qualified');
 assert.equal(planLeadStageTransition({from:'new',to:'lost',expectedUpdatedAt:OLD}).to,'lost');
 assert.equal(planLeadStageTransition({from:'qualified',to:'lost',expectedUpdatedAt:OLD}).to,'lost');
});
test('lead stages never impersonate opportunity proposals or won revenue',()=>{
 for(const [from,to] of [['new','won'],['qualified','proposal'],['lost','qualified'],['qualified','qualified'],['won','lost']])
  assert.throws(()=>planLeadStageTransition({from,to,expectedUpdatedAt:OLD}),CrmLeadStageError);
});
test('strict revision requires canonical UTC millisecond timestamp',()=>{
 for(const at of ['', '2026-10-15T17:30:12Z','2026-02-30T17:30:12.230Z','2026-10-15T17:30:12.230+00:00',null])
  assert.throws(()=>planLeadStageTransition({from:'new',to:'qualified',expectedUpdatedAt:at}),/CRM_LEAD_REVISION_REQUIRED/);
});
test('transaction writes tenant-scoped conditional stage plus privacy-minimal audit',async()=>{
 const s=store();
 const result=await transitionCrmLeadStage({...request(),db:s.db,ipAddress:'127.0.0.1'});
 assert.deepEqual(result,{id:LEAD_ID,stage:'qualified',updatedAt:OLD});
 assert.ok(Object.isFrozen(result));
 assert.deepEqual(s.calls.map(x=>x[0]),['read','update','audit','read']);
 assert.deepEqual(s.calls[0][1].where,{id:LEAD_ID,tenantId:'tenant-a',moduleSlug:'crm-leads'});
 const update=s.calls[1][1];
 assert.equal(update.where.tenantId,'tenant-a');
 assert.equal(update.where.moduleSlug,'crm-leads');
 assert.equal(update.where.status,'new');
 assert.equal(update.where.updatedAt.toISOString(),OLD);
 assert.deepEqual(update.data,{status:'qualified'});
 const audit=s.calls[2][1].data;
 assert.equal(audit.userId,'actor-1');
 assert.equal(audit.action,'crm.lead.stage.change');
 assert.deepEqual(audit.before,{moduleSlug:'crm-leads',stage:'new'});
 assert.deepEqual(audit.after,{moduleSlug:'crm-leads',stage:'qualified'});
 assert.doesNotMatch(JSON.stringify(audit),/ventas@example|J12345678/);
 assert.equal(s.persisted.length,2);
});
test('missing foreign-tenant lead returns not found without audit or update',async()=>{
 const s=store({row:null});
 await assert.rejects(transitionCrmLeadStage({...request(),db:s.db}),CrmLeadNotFoundError);
 assert.deepEqual(s.calls.map(x=>x[0]),['read']);
 assert.deepEqual(s.persisted,[]);
});
test('stale revision returns 409 semantic conflict before update',async()=>{
 const s=store();
 await assert.rejects(transitionCrmLeadStage({...request({expectedUpdatedAt:NEW}),db:s.db}),CrmLeadConflictError);
 assert.deepEqual(s.calls.map(x=>x[0]),['read']);
});
test('lost lead may not be reactivated or finalized',async()=>{
 const s=store({row:record('lost')});
 await assert.rejects(transitionCrmLeadStage({...request(),db:s.db}),CrmLeadStageError);
 assert.deepEqual(s.calls.map(x=>x[0]),['read']);
});
test('concurrent updateMany count 0 aborts without audit',async()=>{
 const s=store({count:0});
 await assert.rejects(transitionCrmLeadStage({...request(),db:s.db}),CrmLeadConflictError);
 assert.deepEqual(s.calls.map(x=>x[0]),['read','update']);
 assert.equal(s.persisted.length,0);
});
test('audit write failure aborts update in same interactive transaction',async()=>{
 const s=store({auditError:true});
 await assert.rejects(transitionCrmLeadStage({...request(),db:s.db}),/AUDIT_ROLLBACK/);
 assert.deepEqual(s.calls.map(x=>x[0]),['read','update','audit']);
 assert.equal(s.persisted.length,0);
});
test('tenant, actor and lead identifier validated before DB access',async()=>{
 const s=store();
 for(const input of [
  {tenantId:'',actorId:'actor-1'}, {actorId:''}, {leadId:'../../bad'},
  {expectedUpdatedAt:'invalid'}, {nextStage:'proposal'}
 ]) await assert.rejects(transitionCrmLeadStage({...request(input),db:s.db}));
 assert.equal(s.calls.length,0);
});
test('post-update response cannot leak a row from another tenant',async()=>{
 const s=store({afterRow:{...record('qualified'),tenantId:'tenant-b'}});
 await assert.rejects(transitionCrmLeadStage({...request(),db:s.db}),/CRM_STAGE_POST_WRITE_INVALID/);
 assert.equal(s.persisted.length,0);
});
test('route requires manage permission, strict schema and maps stale/foreign to HTTP errors',()=>{
 const route=readFileSync(new URL('../backend/src/modules/crm/crm-leads.routes.ts',import.meta.url),'utf8');
 assert.match(route,/router\.patch\('\/:id\/stage',requirePermission\('sales\.manage'\)/);
 assert.match(route,/validateBody\(stageBodySchema\)/);
 assert.match(route,/expectedUpdatedAt:z\.string\(\)\.datetime/);
 assert.match(route,/\.strict\(\)/);
 assert.match(route,/error instanceof CrmLeadConflictError/);
 assert.match(route,/error instanceof CrmLeadNotFoundError/);
 assert.match(route,/ctx\.userId/);
});
test('production dist includes the stage module without introducing DDL',()=>{
 const copy=readFileSync(new URL('../backend/scripts/copy-runtime-assets.mjs',import.meta.url),'utf8');
 assert.match(copy,/src\/modules\/crm\/crm-lead-stage\.mjs/);
 assert.match(copy,/dist\/src\/modules\/crm\/crm-lead-stage\.mjs/);
});
