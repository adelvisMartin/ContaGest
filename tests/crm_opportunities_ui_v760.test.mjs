import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createCrmOpportunityService,validateOpportunityForm,validateOpportunityLossAction,CRM_OPPORTUNITY_ENDPOINT
} from '../frontend/src/services/crmOpportunityService.mjs';

const ID='8ac836d4-04d8-5190-a2a1-0ca3ff1d4812';
const AT='2026-10-15T17:30:12.230Z';
const LEAD={id:ID,stage:'qualified',updatedAt:AT,name:'Prospecto'};
const INPUT={title:'  Venta empresarial  ',currency:'USD',expectedValue:'1099.90',probability:'70'};
const fake=(extra={})=>({
  get:async()=>[],request:async()=>({id:'opp-1',leadId:ID,stage:'qualified'}),...extra
});
test('builds strictly allowlisted opportunity request using server-owned lead revision',()=>{
 assert.deepEqual(validateOpportunityForm(LEAD,{...INPUT,tenantId:'spoof',ownerId:'spoof',clientId:'spoof'}),{
  leadId:ID,payload:{
    title:'Venta empresarial',currency:'USD',expectedValue:'1099.90',probability:70,
    expectedLeadUpdatedAt:AT
  }
 });
});
test('qualified lead is required; never use lost/new or forged ID or stale timestamp',()=>{
 for(const lead of [
  {...LEAD,stage:'new'},{...LEAD,stage:'lost'},
  {...LEAD,id:'../../bad'},{...LEAD,updatedAt:'2026-02-30T17:30:12.230Z'},
  {...LEAD,updatedAt:'2026-10-15T17:30:12Z'},null
 ])assert.throws(()=>validateOpportunityForm(lead,INPUT));
});
test('form rejects invalid currency, zero/negative/fractional excess and invalid probability',()=>{
 for(const patch of [
  {currency:'Bs'},{currency:'usd'},{expectedValue:'0'},{expectedValue:'0.00'},
  {expectedValue:'-5'},{expectedValue:'1.001'},{expectedValue:1234},
  {probability:'101'},{probability:'50.4'},{probability:''},
  {title:'a'},{title:' '}
 ])assert.throws(()=>validateOpportunityForm(LEAD,{...INPUT,...patch}));
});
test('smallest positive decimal and zero probability are accepted',()=>{
 assert.equal(validateOpportunityForm(LEAD,{...INPUT,expectedValue:'0.01',probability:'0'}).payload.probability,0);
});
test('POST reuses canonical BackendApi request and sends no tenant or customer',async()=>{
 let call;
 const api=fake({request:async(path,opts)=>{
  call={path,opts};
  return{id:'opp-1',leadId:ID,stage:'qualified'};
 }});
 const service=createCrmOpportunityService({api});
 const out=await service.createFromLead(LEAD,INPUT);
 assert.equal(out.id,'opp-1');
 assert.equal(call.path,CRM_OPPORTUNITY_ENDPOINT+'/from-lead/'+ID);
 assert.equal(call.opts.method,'POST');
 assert.deepEqual(call.opts.body,{
  title:'Venta empresarial',currency:'USD',expectedValue:'1099.90',probability:70,
  expectedLeadUpdatedAt:AT
 });
 assert.doesNotMatch(JSON.stringify(call.opts),/tenantId|actorId|clientId/);
});
test('409 error cannot automatically retry or generate an alternative opportunity',async()=>{
 let calls=0;
 const svc=createCrmOpportunityService({api:fake({request:async()=>{
  calls++;throw Object.assign(new Error('duplicate'),{status:409});
 }})});
 await assert.rejects(svc.createFromLead(LEAD,INPUT),/duplicate/);
 assert.equal(calls,1);
});
test('malformed API create response blocks confirmed success',async()=>{
 const svc=createCrmOpportunityService({api:fake({request:async()=>({id:'x',leadId:'wrong',stage:'qualified'})})});
 await assert.rejects(svc.createFromLead(LEAD,INPUT),/CRM_OPPORTUNITY_RESULT_INVALID/);
});
test('list uses bounded canonical endpoint and rejects non-array data',async()=>{
 let request;
 const svc=createCrmOpportunityService({api:fake({get:async(path)=>{request=path;return[{id:'opp'}]}})});
 assert.deepEqual(await svc.list(),[{id:'opp'}]);
 assert.equal(request,CRM_OPPORTUNITY_ENDPOINT+'?take=50&skip=0');
 const bad=createCrmOpportunityService({api:fake({get:async()=>({data:[]})})});
 await assert.rejects(bad.list(),/CRM_OPPORTUNITY_LIST_INVALID/);
});
test('service rejects incomplete API transport before any network call',()=>{
 assert.throws(()=>createCrmOpportunityService({api:null}),/CRM_OPPORTUNITY_API_REQUIRED/);
 assert.throws(()=>createCrmOpportunityService({api:{get:async()=>[]}}),/CRM_OPPORTUNITY_API_REQUIRED/);
});
test('Clients screen restricts selection to qualified lead and uses server CAS token',()=>{
 const ui=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 assert.match(ui,/data:\{'crm-opportunity-lead-id':lead\.id\}/);
 assert.match(ui,/item\.stage==='qualified'/);
 assert.match(ui,/await crmOpportunities\.createFromLead\(selectedOpportunityLead,data\)/);
 assert.match(ui,/await refreshCrmOpportunities\(\)/);
 assert.match(ui,/await refreshCrmLeads\(\)/);
 assert.match(ui,/id="crmOpportunitySelected" role="status" aria-live="polite"/);
});
test('Clients screen displays read-only money data without local or fiscal writes',()=>{
 const ui=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 assert.match(ui,/id="crmOpportunityForm"/);
 assert.match(ui,/id="crmOpportunityResults"/);
 assert.match(ui,/safe\(item\.expectedValue\)\+' '\+safe\(item\.currency\)/);
 assert.doesNotMatch(ui,/Store\.update\(\(draft\).*crmOpportunities/);
 assert.doesNotMatch(ui,/prisma\.client\.(create|update)/);
});


const EXISTING_OPPORTUNITY_ID='f1bdc4b1-b7dd-51c1-90c2-6df63a2762e0';
const EXISTING_OPPORTUNITY_UPDATED='2026-10-15T18:30:00.000Z';
const opportunity=(stage='qualified')=>({
  id:EXISTING_OPPORTUNITY_ID,stage,updatedAt:EXISTING_OPPORTUNITY_UPDATED
});
test('loss action supplies only canonical ID + revision and checks qualified stage',()=>{
 assert.deepEqual(validateOpportunityLossAction(opportunity()),{
  id:EXISTING_OPPORTUNITY_ID,expectedUpdatedAt:EXISTING_OPPORTUNITY_UPDATED
 });
 assert.ok(Object.isFrozen(validateOpportunityLossAction(opportunity())));
});
test('opportunity loss refuses terminal, malicious IDs and invalid revisions',()=>{
 for(const value of [
  opportunity('lost'),opportunity('won'),opportunity('proposal'),
  {...opportunity(),id:'../../other-tenant'},
  {...opportunity(),updatedAt:'2026-02-30T18:30:00.000Z'},
  {...opportunity(),updatedAt:'2026-10-15T18:30:00Z'},null
 ])assert.throws(()=>validateOpportunityLossAction(value),/CRM_OPPORTUNITY_LOSS_INVALID/);
});
test('loss service PATCH is authenticated through canonical API and uses server revision',async()=>{
 let call;
 const svc=createCrmOpportunityService({api:fake({request:async(path,opts)=>{
  call={path,opts};return{id:EXISTING_OPPORTUNITY_ID,stage:'lost',updatedAt:'2026-10-15T18:31:00.000Z'};
 }})});
 const out=await svc.markLost(opportunity());
 assert.equal(out.stage,'lost');
 assert.equal(call.path,CRM_OPPORTUNITY_ENDPOINT+'/'+EXISTING_OPPORTUNITY_ID+'/lost');
 assert.equal(call.opts.method,'PATCH');
 assert.deepEqual(call.opts.body,{expectedUpdatedAt:EXISTING_OPPORTUNITY_UPDATED});
 assert.doesNotMatch(JSON.stringify(call),/tenantId|actorId|clientId/);
});
test('HTTP 409 is propagated exactly once, no automatic retry or local opportunity mutation',async()=>{
 let calls=0;
 const svc=createCrmOpportunityService({api:fake({request:async()=>{
  calls++;throw Object.assign(new Error('stale opportunity'),{status:409});
 }})});
 await assert.rejects(svc.markLost(opportunity()),/stale opportunity/);
 assert.equal(calls,1);
});
test('bad loss response is not treated as a committed transition',async()=>{
 const svc=createCrmOpportunityService({api:fake({request:async()=>({id:'wrong',stage:'lost'})})});
 await assert.rejects(svc.markLost(opportunity()),/CRM_OPPORTUNITY_LOSS_RESULT_INVALID/);
});
test('UI binds only qualified opportunity buttons with server revision and refresh on conflict',()=>{
 const ui=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 assert.match(ui,/item\.stage==='qualified'/);
 assert.match(ui,/data:\{'crm-opportunity-loss-id':item\.id\}/);
 assert.match(ui,/loadedCrmOpportunities\.find\(row=>/);
 assert.match(ui,/await crmOpportunities\.markLost\(opportunity\)/);
 assert.match(ui,/error\?\.status===409/);
 assert.match(ui,/await refreshCrmOpportunities\(\)/);
 assert.doesNotMatch(ui,/Store\.update\(\(draft\).*crmOpportunityLossId/);
});
