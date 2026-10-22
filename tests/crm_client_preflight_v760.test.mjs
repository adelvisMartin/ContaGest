import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {canonicalClientPreflight, canonicalRifVariants, CLIENT_PREFLIGHT_MAX_CANDIDATES} from '../backend/src/modules/crm/client-match-preflight.mjs';

const lead={rif:'J-12345678-9',email:' TEAM@EXAMPLE.COM '};
const client=(o={})=>({id:'client-a',tenantId:'tenant-a',active:true,rif:'J123456789',email:'old@example.com',...o});
const db=(rows,spy)=>({findMany:async args=>{spy?.(args);return rows}});
const inspect=async(rows,opts={})=>canonicalClientPreflight({tenantId:'tenant-a',lead,clientReader:db(rows,opts.spy)});

test('normalizes RIF variant spellings without widening to fuzzy search',()=>{
 assert.deepEqual([...canonicalRifVariants('J123456789')],['J123456789','J-123456789','J-12345678-9','J-12.345.678-9']);
 assert.deepEqual(canonicalRifVariants('Jbad'),[]);
});
test('always pushes tenant, active, exact RIF or email, selected fields and cap to Prisma',async()=>{
 let query;
 const result=await inspect([client()],{spy:q=>query=q});
 assert.deepEqual(query.where.tenantId,'tenant-a');
 assert.equal(query.where.active,true);
 assert.deepEqual(query.where.OR,[
  {rif:{in:['J123456789','J-123456789','J-12345678-9','J-12.345.678-9'],mode:'insensitive'}},
  {email:{equals:'team@example.com',mode:'insensitive'}}
 ]);
 assert.deepEqual(query.select,{id:true,tenantId:true,active:true,rif:true,email:true});
 assert.deepEqual(query.orderBy,{id:'asc'});
 assert.equal(query.take,201);
 assert.equal(result.reviewOnly,true);
 assert.equal(result.conversionAuthorized,false);
});
test('returns existing canonical ID without exposing RIF/email',async()=>{
 const r=await inspect([client()]);
 assert.deepEqual(r,{status:'REVIEW_EXISTING',reason:'EXISTING_CLIENT_AUTHORITY',candidates:['client-a'],reviewOnly:true,conversionAuthorized:false});
 assert.doesNotMatch(JSON.stringify(r),/J123456789|team@example.com|old@example.com/);
});
test('unknown taxpayer remains review-only and cannot authorize conversion',async()=>{
 const r=await inspect([]);
 assert.equal(r.status,'REVIEW_NEW');
 assert.equal(r.conversionAuthorized,false);
});
test('shared email with conflicting legal RIF is blocked',async()=>{
 const r=await inspect([client({rif:'V123456789',email:'team@example.com'})]);
 assert.deepEqual(r,{status:'BLOCKED',reason:'CONFLICTING_RIF_EMAIL',candidates:['client-a'],reviewOnly:true,conversionAuthorized:false});
});
test('multiple candidates preserve legacy ambiguity result',async()=>{
 const r=await inspect([client(),client({id:'client-b',rif:'V123456789',email:'team@example.com'})]);
 assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'AMBIGUOUS_CLIENT_MATCH');
 assert.deepEqual(r.candidates,['client-a','client-b']);
});
test('rejects foreign and inactive Client rows even when repository returns them unexpectedly',async()=>{
 const r=await inspect([client({tenantId:'tenant-b'}),client({active:false})]);
 assert.equal(r.status,'REVIEW_NEW');assert.deepEqual(r.candidates,[]);
});
test('fails closed when too many clients match rather than reporting false clear',async()=>{
 const rows=Array.from({length:CLIENT_PREFLIGHT_MAX_CANDIDATES+1},(_,i)=>client({id:'client-'+i}));
 const r=await inspect(rows);
 assert.deepEqual(r,{status:'BLOCKED',reason:'CANDIDATE_LIMIT_EXCEEDED',candidates:[],reviewOnly:true,conversionAuthorized:false});
});
test('does not convert database failures into permission to create',async()=>{
 await assert.rejects(canonicalClientPreflight({tenantId:'tenant-a',lead,clientReader:{findMany:async()=>{throw Error('db unavailable')}}}),/db unavailable/);
});
test('rejects empty tenant, malformed identity and invalid readers before access',async()=>{
 await assert.rejects(canonicalClientPreflight({tenantId:'',lead,clientReader:db([])}),/TENANT_REQUIRED/);
 await assert.rejects(canonicalClientPreflight({tenantId:'tenant-a',lead:{rif:'invalid'},clientReader:db([])}),/INVALID_LEAD_IDENTITY/);
 await assert.rejects(canonicalClientPreflight({tenantId:'tenant-a',lead:{email:'invalid'},clientReader:db([])}),/INVALID_LEAD_IDENTITY/);
 await assert.rejects(canonicalClientPreflight({tenantId:'tenant-a',lead:{},clientReader:db([])}),/INVALID_LEAD_IDENTITY/);
 await assert.rejects(canonicalClientPreflight({tenantId:'tenant-a',lead,clientReader:{}}),/CLIENT_AUTHORITY_REQUIRED/);
});
test('permits email-only lookup for review but never authorizes new client',async()=>{
 let where;
 const r=await canonicalClientPreflight({tenantId:'tenant-a',lead:{email:'TEAM@example.com'},clientReader:db([],(q)=>{where=q.where})});
 assert.deepEqual(where.OR,[{email:{equals:'team@example.com',mode:'insensitive'}}]);
 assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'CLIENT_RIF_REQUIRED');
});
test('production route uses tenant+client permission, strict payload, no write and canonical Prisma client',()=>{
 const route=fs.readFileSync(new URL('../backend/src/modules/crm/crm.routes.ts',import.meta.url),'utf8');
 assert.match(route,/router\.use\(requireTenant, requirePermission\('clients\.manage'\)\)/);
 assert.match(route,/post\('\/preflight'/);
 assert.match(route,/preflightSchema\.safeParse\(req\.body\)/);
 assert.match(route,/\.strict\(\)/);
 assert.match(route,/clientReader:prisma\.client/);
 assert.doesNotMatch(route,/\.create\(|\.update\(|\.upsert\(|\.delete\(/);
});
test('client route composition preserves existing CRUD without extending architecture route count',()=>{
 const manifest=fs.readFileSync(new URL('../backend/src/modules/route-manifest.ts',import.meta.url),'utf8');
 assert.match(manifest,/createCrudRouter\(\{ model:'client'/);
 assert.match(manifest,/clientRouter\.use\(crmClientPreflightRoutes\)/);
 assert.match(manifest,/id: 'clients'.+router: clientRouter/);
 assert.doesNotMatch(manifest,/id: 'crm',/);
});

test('compiled-backend asset copy includes every declared CRM ESM dependency and preserves bytes',()=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'cg-crm-asset-'));
 try {
  const copySource=fs.readFileSync(new URL('../backend/scripts/copy-runtime-assets.mjs',import.meta.url),'utf8');
  // Keep the executable copy contract aligned with the real source-of-truth list.
  // This explicit allowlist catches missing runtime modules or unexpected asset additions.
  const assets=[
   'src/shared/contracts/accessManifestRuntime.js',
   'src/modules/crm/crm-domain.mjs',
   'src/modules/crm/client-match-preflight.mjs',
   'src/modules/crm/crm-lead-store.mjs',
   'src/modules/crm/crm-lead-stage.mjs',
   'src/modules/crm/crm-opportunity-store.mjs',
   'src/modules/crm/crm-opportunity-stage.mjs',
   'src/modules/crm/crm-forecast.mjs'
  ];
  const declared=[...copySource.matchAll(/source:\s*'([^']+)'/g)].map(([,value])=>value);
  assert.deepEqual(declared,assets,'every shipped runtime asset must be covered by the fixture');
  for(const asset of assets){
   const sourceFile=new URL('../backend/'+asset,import.meta.url);
   const sourceBytes=fs.readFileSync(sourceFile);
   const location=path.join(work,asset);
   fs.mkdirSync(path.dirname(location),{recursive:true});
   fs.writeFileSync(location,sourceBytes);
  }
  fs.mkdirSync(path.join(work,'scripts'),{recursive:true});
  const script=path.join(work,'scripts','copy-runtime-assets.mjs');
  fs.writeFileSync(script,copySource);
  const result=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  for(const asset of assets){
   assert.deepEqual(fs.readFileSync(path.join(work,'dist',asset)),fs.readFileSync(path.join(work,asset)),asset);
  }
 } finally { fs.rmSync(work,{recursive:true,force:true}); }
});

test('exact dotted RIF matches canonical taxpayer, no fuzzy inference or auto-conversion', async()=>{
 let variants=[];
 const out=await canonicalClientPreflight({
  tenantId:'tenant-a',lead:{rif:'J-12345678-9'},
  clientReader:{findMany:async query=>{
   variants=query.where.OR[0].rif.in;
   return variants.includes('J-12.345.678-9')
    ? [client({rif:'J-12.345.678-9',email:'different@example.com'})]
    : [];
  }}
 });
 assert.ok(variants.includes('J-12.345.678-9'));
 assert.equal(out.status,'REVIEW_EXISTING');
 assert.equal(out.conversionAuthorized,false);
});

test('canonical preflight blocks malformed legacy fiscal identity on same-email Client',async()=>{
 const out=await inspect([client({rif:'NOT_A_RIF',email:'team@example.com'})]);
 assert.deepEqual(out,{
   status:'BLOCKED', reason:'UNVERIFIABLE_CLIENT_RIF',candidates:['client-a'],
   reviewOnly:true,conversionAuthorized:false
 });
 assert.doesNotMatch(JSON.stringify(out),/NOT_A_RIF|team@example/);
});

test('preflight HTTP verdict disables intermediary and private-browser caching',()=>{
 const route=fs.readFileSync(new URL('../backend/src/modules/crm/crm.routes.ts',import.meta.url),'utf8');
 assert.match(route,/res\.setHeader\('Cache-Control', 'private, no-store'\)/);
});


test('sensitive CRM preflight reuses the central expensive rate limiter after RBAC',()=>{
 const route=fs.readFileSync(new URL('../backend/src/modules/crm/crm.routes.ts',import.meta.url),'utf8');
 assert.match(route,/import \{ expensiveOperationRateLimit \} from '\.\.\/\.\.\/shared\/middleware\/security\.js';/);
 const auth=route.indexOf("router.use(requireTenant, requirePermission('clients.manage'))");
 const preflight=route.indexOf("router.post('/preflight', expensiveOperationRateLimit, asyncHandler(");
 assert.ok(auth>=0 && preflight>auth, 'tenant and RBAC middleware must precede preflight limiter');
 assert.equal((route.match(/router\.post\('\/preflight'/g)||[]).length,1);
 assert.doesNotMatch(route,/router\.use\(expensiveOperationRateLimit\)/);
 assert.match(route,/res\.setHeader\('Cache-Control', 'private, no-store'\)/);
});
