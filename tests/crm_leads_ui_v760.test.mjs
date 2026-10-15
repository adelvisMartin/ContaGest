import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCrmLeadService, normalizeCrmLeadDraft, CRM_LEADS_ENDPOINT } from '../frontend/src/services/crmLeadService.mjs';

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
