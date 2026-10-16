import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRateCard,listProjectRateCards,projectRateCardId,
 validateProjectRateCardDraft,ProjectRateCardConflict,ProjectRateCardForbidden,
 PROJECT_RATE_CARD_SLUG} from '../backend/src/modules/projects/project-rate-card-store.ts';
const tenant='cb0054f7-ef51-4580-888a-087701fca814';
const projectId='130849ad-a46d-5adb-a286-2774fd36bfac';
const clientId='bd24f62c-54f7-4c84-918a-df3ef1d6eaf0';
const managerId='37fe6297-4bd3-4e9c-ad1f-51f7220b29fd';
const memberId='9236ec7b-5eaf-44c2-9526-6b8ebce8d58e';
const draft={memberId,hourlyRateExact:'100.25',currency:'USD',effectiveFromUtc:'2026-11-01T00:00:00.000Z',expectedRevision:0};
const project=(status='active')=>({id:projectId,tenantId:tenant,moduleSlug:'project-workspace-v761',status,payload:{schemaVersion:1,clientId,managerId}});
const task=()=>({tenantId:tenant,moduleSlug:'project-task-v761',status:'in_progress',payload:{schemaVersion:1,projectId,clientId,assigneeId:memberId}});
const card=(revision=1)=>({id:projectRateCardId(tenant,projectId,memberId,revision),tenantId:tenant,moduleSlug:PROJECT_RATE_CARD_SLUG,
 status:'fixed',payload:{schemaVersion:1,projectId,clientId,memberId,revision,hourlyRateExact:'100.25',currency:'USD',effectiveFromUtc:'2026-11-01T00:00:00.000Z'},createdAt:new Date()});
function mock({projectRow=project(),taskRow=task(),member=true,manager=true,client=true,previous=null,rows=[card()],conflict=null,auditFail=false}={}){
 const calls=[],committed=[];
 const db={$transaction:async(fn,mode)=>{
  calls.push(['tx',mode]);const pending=[];
  const tx={moduleRecord:{findFirst:async({where})=>{
   calls.push(['find',where]);return where.moduleSlug==='project-workspace-v761'?projectRow:where.moduleSlug==='project-task-v761'?taskRow:previous;
  },create:async({data})=>{
   calls.push(['create',data]);if(conflict)throw Object.assign(new Error('conflict'),{code:conflict});pending.push(data);
   return {...card(data.payload.revision),...data,createdAt:new Date()};
  },findMany:async(q)=>{calls.push(['list',q]);return rows;}},userProfile:{findFirst:async({where})=>where.id===managerId?(manager?{id:managerId,tenantId:tenant}:null):(member?{id:memberId,tenantId:tenant}:null)},
   client:{findFirst:async()=>client?{id:clientId,tenantId:tenant}:null},auditLog:{create:async x=>{calls.push(['audit',x.data]);if(auditFail)throw Error('AUDIT_FAIL');}}};
  const res=await fn(tx);committed.push(...pending);return res;
 }};
 return {db,calls,committed};
}
const create=(f,extra={})=>createProjectRateCard({db:f.db,tenantId:tenant,actorId:managerId,projectId,draft,...extra});
test('writes exact decimal v1 with tenant, manager and same-transaction audit',async()=>{
 const f=mock(),result=await create(f);
 assert.equal(result.hourlyRateExact,'100.25');assert.equal(result.revision,1);
 assert.equal(result.billableAuthorized,false);assert.equal(result.invoiceAuthorized,false);
 assert.equal(f.committed.length,1);assert.equal(f.committed[0].id,projectRateCardId(tenant,projectId,memberId,1));
 assert.deepEqual(f.calls[0],['tx',{isolationLevel:'Serializable'}]);
 assert.equal(f.calls.find(x=>x[0]==='audit')[1].action,'project.rate-card.version.create');
});
test('requires previous version and increasing effective instant',async()=>{
 const x=mock({previous:card()});const y=await create(x,{draft:{...draft,expectedRevision:1,effectiveFromUtc:'2026-12-01T00:00:00.000Z'}});
 assert.equal(y.revision,2);
 for(const f of [mock(),mock({previous:card()})]){
  await assert.rejects(create(f,{draft:{...draft,expectedRevision:1,effectiveFromUtc:f.calls.length?'2026-12-01T00:00:00.000Z':'2026-11-01T00:00:00.000Z'}}),ProjectRateCardConflict);
 }
});
test('deterministic unique id partitions tenant, project, member, revision',()=>{
 const id=projectRateCardId(tenant,projectId,memberId,1);
 assert.notEqual(id,projectRateCardId(tenant,projectId,memberId,2));
 assert.notEqual(id,projectRateCardId(tenant,projectId,managerId,1));
 assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('duplicate, SSI retry, and audit failure are fail-closed with no committed rate',async()=>{
 for(const flags of [{conflict:'P2002'},{conflict:'P2034'},{auditFail:true}]){
  const f=mock(flags);await assert.rejects(create(f));assert.equal(f.committed.length,0);
 }
});
test('strict draft input rejects client financial authority and binary floats',()=>{
 for(const field of ['tenantId','projectId','invoiceId','billable','tax','managerId']){
  assert.throws(()=>validateProjectRateCardDraft({...draft,[field]:true}),/UNKNOWN_FIELD/);
 }
 for(const value of [0,1.23,'0.00','1.2','1.234','1e3',' 1.00',null]){
  assert.throws(()=>validateProjectRateCardDraft({...draft,hourlyRateExact:value}),/DECIMAL_INVALID/);
 }
 assert.equal(validateProjectRateCardDraft({...draft,hourlyRateExact:'999999999999.99'}).hourlyRateExact,'999999999999.99');
});
test('invalid effective UTC, currency and revision rejected before opening transaction',async()=>{
 for(const data of [{currency:'usd'},{currency:'USDX'},{effectiveFromUtc:'2026-02-30T00:00:00.000Z'},
 {effectiveFromUtc:'2026-11-01T00:00:00Z'},{expectedRevision:-1},{expectedRevision:1024}]){
  const f=mock();await assert.rejects(create(f,{draft:{...draft,...data}}));assert.equal(f.calls.length,0);
 }
});
test('inactive/cross-tenant project, member, client or manager cannot save',async()=>{
 for(const flags of [{projectRow:project('archived')},{projectRow:{...project(),tenantId:'foreign'}},
  {member:false},{manager:false},{client:false},{taskRow:null}]){
  const f=mock(flags);await assert.rejects(create(f));assert.equal(f.committed.length,0);
 }
 const f=mock();await assert.rejects(create(f,{actorId:memberId}),ProjectRateCardForbidden);
});
test('history is private and validates every persisted row before displaying',async()=>{
 const f=mock({rows:[card()]});const result=await listProjectRateCards({db:f.db,tenantId:tenant,actorId:managerId,projectId,memberId});
 assert.equal(result.items[0].revision,1);assert.equal(result.items[0].invoiceAuthorized,false);
 const where=f.calls.find(x=>x[0]==='list')[1].where;
 assert.equal(where.tenantId,tenant);assert.equal(where.moduleSlug,PROJECT_RATE_CARD_SLUG);
 const foreign=mock({rows:[{...card(),tenantId:'foreign'}]});
 await assert.rejects(listProjectRateCards({db:foreign.db,tenantId:tenant,actorId:managerId,projectId,memberId}));
 const blocked=mock();await assert.rejects(listProjectRateCards({db:blocked.db,tenantId:tenant,actorId:memberId,projectId,memberId}),ProjectRateCardForbidden);
});
test('paged history signals extra row and refuses invalid page size',async()=>{
 const f=mock({rows:[card(1),card(1)]});const r=await listProjectRateCards({db:f.db,tenantId:tenant,actorId:managerId,projectId,memberId,take:1});
 assert.equal(r.items.length,1);assert.equal(r.pagination.hasMore,true);assert.equal(r.pagination.nextSkip,1);
 await assert.rejects(listProjectRateCards({db:f.db,tenantId:tenant,actorId:managerId,projectId,memberId,take:101}),/PAGE_INVALID/);
});
