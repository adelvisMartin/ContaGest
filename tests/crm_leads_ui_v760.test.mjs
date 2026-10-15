import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCrmLeadService, normalizeCrmLeadDraft, CRM_LEADS_ENDPOINT, validateLeadStageAction } from '../frontend/src/services/crmLeadService.mjs';

const KEY_A='aacaa84f-03d2-42e1-8039-e4f47b39ad42';
const KEY_B='ce796bd2-0afe-422c-8210-42903a6c345e';
const lead={name:'  Prospección Acme  ',rif:' J-12345678-9 ',email:'ventas@example.com',phone:' '};
const fake=(overrides={})=>({get:async()=>[],request:async()=>({id:'lead-a'}),...overrides});

test('normalizes allowlisted form fields and discards UI or session authority',()=>{
 assert.deepEqual(normalizeCrmLeadDraft({...lead,tenantId:'foreign',actorId:'spoof',status:'won'}),{
  name:'Prospección Acme',rif:'J-12345678-9',email:'ventas@example.com'
 });
});
test('requires a named prospect and a legal/contact channel',()=>{
 for(const draft of [null,{}, {name:'A',email:'test@example.com'}, {name:'Ok'}, {name:'Ok',email:'bad email'}])
  assert.throws(()=>normalizeCrmLeadDraft(draft));
});
test('uses authenticated BackendApi.request with UUIDv4 header; no secondary Client authority',async()=>{
 let called;
 const api=fake({request:async(path,opts)=>{called={path,opts};return{id:'lead-a'}}});
 const service=createCrmLeadService({api,uuidFactory:()=>KEY_A});
 assert.equal((await service.create(lead)).id,'lead-a');
 assert.equal(called.path,CRM_LEADS_ENDPOINT);
 assert.equal(called.opts.method,'POST');
 assert.deepEqual(called.opts.headers,{'Idempotency-Key':KEY_A});
 assert.deepEqual(called.opts.body,{name:'Prospección Acme',rif:'J-12345678-9',email:'ventas@example.com'});
});
test('same draft reuses idempotency key after transport failures, never generates a second lead key',async()=>{
 let keys=[],n=0;
 const service=createCrmLeadService({api:fake({request:async(_,opts)=>{keys.push(opts.headers['Idempotency-Key']);if(n++===0)throw new Error('network');return{id:'ok'};}}),uuidFactory:()=>KEY_A});
 await assert.rejects(service.create(lead),/network/);
 await service.create({...lead,name:'Prospección Acme'});
 assert.deepEqual(keys,[KEY_A,KEY_A]);
});
test('HTTP 409 retains pending key for manual replay',async()=>{
 let attempts=0,keys=[];
 const service=createCrmLeadService({api:fake({request:async(_,opts)=>{keys.push(opts.headers['Idempotency-Key']);if(attempts++===0)throw Object.assign(new Error('duplicate'),{status:409});return{id:'ok'};}}),uuidFactory:()=>KEY_A});
 await assert.rejects(service.create(lead)); await service.create(lead);
 assert.deepEqual(keys,[KEY_A,KEY_A]);
});
test('different draft or a confirmed creation rotates UUID key',async()=>{
 let keys=[],id=0;const values=[KEY_A,KEY_B,KEY_A];
 const service=createCrmLeadService({api:fake({request:async(_,opts)=>{keys.push(opts.headers['Idempotency-Key']);return{id:'lead'};}}),uuidFactory:()=>values[id++]});
 await service.create(lead);await service.create({...lead,name:'Nuevo prospecto'});
 assert.deepEqual(keys,[KEY_A,KEY_B]);
});
test('rejects weak UUID generation and never calls the network',async()=>{
 let requests=0;const service=createCrmLeadService({api:fake({request:async()=>{requests++}}),uuidFactory:()=>undefined});
 await assert.rejects(service.create(lead),/CRM_SECURE_UUID_REQUIRED/);
 assert.equal(requests,0);
});
test('list rejects non-array response and uses bounded canonical endpoint',async()=>{
 let path;const service=createCrmLeadService({api:fake({get:async x=>{path=x;return[{id:'a'}]}}),uuidFactory:()=>KEY_A});
 assert.deepEqual(await service.list(),[{id:'a'}]);assert.equal(path,CRM_LEADS_ENDPOINT+'?take=50&skip=0');
 const bad=createCrmLeadService({api:fake({get:async()=>({wrong:1})})});
 await assert.rejects(bad.list(),/CRM_LEADS_INVALID_RESPONSE/);
});
test('UI embeds prospect list/form inside canonical Clients screen, not a second Client master',()=>{
 const ui=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 assert.match(ui,/id="crmLeadForm"/); assert.match(ui,/id="crmLeadResults"/);
 assert.match(ui,/createCrmLeadService/); assert.match(ui,/await crmLeads\.create\(data\)/);
 assert.match(ui,/await crmLeads\.list\(\)/);assert.match(ui,/role="status" aria-live="polite"/);
 assert.doesNotMatch(ui,/Store\.update\(\(draft\).*crmLeads/);
});

const EXISTING_LEAD_ID='00a94043-3ec9-5cef-9019-443c9da5369b';
const EXISTING_DATE='2026-10-15T17:30:12.230Z';
const existing=(stage='new')=>({
  id:EXISTING_LEAD_ID,stage,updatedAt:EXISTING_DATE,name:'Lead'
});
test('lead stage service calls canonical PATCH with exactly expected server revision',async()=>{
 let call;
 const service=createCrmLeadService({api:fake({request:async(path,opts)=>{
  call={path,opts};return {id:EXISTING_LEAD_ID,stage:'qualified',updatedAt:'2026-10-15T18:00:00.000Z'};
 }})});
 const result=await service.changeStage(existing(),'qualified');
 assert.equal(call.path,CRM_LEADS_ENDPOINT+'/'+EXISTING_LEAD_ID+'/stage');
 assert.equal(call.opts.method,'PATCH');
 assert.deepEqual(call.opts.body,{nextStage:'qualified',expectedUpdatedAt:EXISTING_DATE});
 assert.deepEqual(result,{id:EXISTING_LEAD_ID,stage:'qualified',updatedAt:'2026-10-15T18:00:00.000Z'});
});
test('lead stage action never permits opportunity proposal, won or terminal reopening',()=>{
 for(const [stage,next] of [
  ['new','proposal'],['new','won'],['qualified','won'],['lost','qualified'],
  ['qualified','qualified'],['unknown','lost']
 ])assert.throws(()=>validateLeadStageAction(existing(stage),next),/CRM_STAGE_ACTION_INVALID/);
 assert.equal(validateLeadStageAction(existing('qualified'),'lost').nextStage,'lost');
});
test('invalid ID or timestamp blocks stage PATCH before any API call',async()=>{
 let calls=0;
 const svc=createCrmLeadService({api:fake({request:async()=>{calls++;return{}}})});
 for(const data of [
  {...existing(),id:'../../bad'},
  {...existing(),updatedAt:'2026-02-30T17:30:12.230Z'},
  {...existing(),updatedAt:'2026-10-15T17:30:12+00:00'}
 ])await assert.rejects(svc.changeStage(data,'qualified'),/CRM_STAGE_ACTION_INVALID/);
 assert.equal(calls,0);
});
test('conflict 409 does not automatically retry a stale stage PATCH',async()=>{
 let calls=0;
 const svc=createCrmLeadService({api:fake({request:async()=>{calls++;throw Object.assign(new Error('stale'),{status:409});}})});
 await assert.rejects(svc.changeStage(existing(),'qualified'),/stale/);
 assert.equal(calls,1);
});
test('UI stage controls use existing server rows, accessible errors and refresh',()=>{
 const ui=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 assert.match(ui,/data:\{'crm-stage-id':lead\.id,'crm-next-stage':'qualified'\}/);
 assert.match(ui,/data:\{'crm-stage-id':lead\.id,'crm-next-stage':'lost'\}/);
 assert.match(ui,/loadedCrmLeads\.find\(item=>item\.id===button\.dataset\.crmStageId\)/);
 assert.match(ui,/await crmLeads\.changeStage\(lead,button\.dataset\.crmNextStage\)/);
 assert.match(ui,/await refreshCrmLeads\(\)/);
 assert.match(ui,/error\?\.status===409/);
 assert.doesNotMatch(ui,/Store\.update\(\(draft\).*stageRequestInFlight/);
});
