import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG_MANIFEST_V665 as MANIFEST} from '../config/environment-manifest-v665.mjs';
import {checkEnvironmentManifest,loadVersionedSamples} from '../scripts/check-environment-manifest-v665.mjs';

const samples=loadVersionedSamples();
const check=(part={})=>checkEnvironmentManifest({...samples,...part});

test('#665 every current versioned sample is owned and typed',()=>{
 assert.deepEqual(check(),{status:'PASS',findings:[]});
 assert.ok(Object.keys(MANIFEST.variables.backend).length>=90);
 assert.equal(Object.keys(MANIFEST.variables.frontend).length,6);
 assert.ok(Object.keys(MANIFEST.variables.bridge).length>=41);
});
test('#665 newly introduced frontend keys require ownership registration',()=>{
 const report=check({frontend:samples.frontend+'\nVITE_NEW_TOKEN=never-publish-this'});
 assert.ok(report.findings.some(f=>f.code==='MANIFEST_UNREGISTERED_KEY'&&f.key==='VITE_NEW_TOKEN'));
 assert.equal(JSON.stringify(report).includes('never-publish-this'),false);
});
test('#665 outbound fail-safe defaults cannot drift in templates',()=>{
 for(const [owner,key] of [
  ['backend','HIPICO_CLOUD_SEND_ENABLED'],
  ['backend','HIPICO_SOURCE_AUTO_REPLY_ENABLED'],
  ['backend','HIPICO_OUTBOX_WORKER_ENABLED'],
  ['bridge','HIPICO_SOURCE_AUTO_REPLY_ENABLED'],
  ['bridge','HIPICO_LAB_SEND_ENABLED'],
  ['bridge','HIPICO_HISTORY_SYNC_ON_START']]){
  const changed=samples[owner].replace(new RegExp('^'+key+'=false$','m'),key+'=true');
  assert.ok(check({[owner]:changed}).findings.some(f=>f.code==='MANIFEST_UNSAFE_DEFAULT'&&f.key===key),key);
 }
});
test('#665 aliases retain parity with canonical backend names',()=>{
 for(const [legacy,canonical] of [
  ['HIPICO_SOURCE_CHANNEL_KEY','HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY'],
  ['WHATSAPP_GRAPH_VERSION','WHATSAPP_GRAPH_API_VERSION']]){
  const changed=samples.backend.replace(new RegExp('^'+legacy+'=.*$','m'),legacy+'=conflicting');
  assert.ok(check({backend:changed}).findings.some(f=>f.code==='MANIFEST_ALIAS_DRIFT'&&f.key===legacy),canonical);
 }
});
test('#665 service role secrets never become frontend public properties',()=>{
 assert.equal(MANIFEST.variables.backend.SUPABASE_SERVICE_ROLE_KEY.sensitive,true);
 assert.equal(MANIFEST.variables.backend.SUPABASE_SERVICE_ROLE_KEY.visibility,'server');
 assert.equal(MANIFEST.variables.frontend.VITE_SUPABASE_ANON_KEY.visibility,'public');
 assert.equal(MANIFEST.variables.frontend.VITE_SUPABASE_ANON_KEY.sensitive,false);
 assert.equal(MANIFEST.variables.backend.DATABASE_URL.aliasFor,undefined);
});
test('#665 registry rejects invalid public sensitivity and missing core template keys',()=>{
 const changed=structuredClone(MANIFEST);
 changed.variables.frontend.VITE_SUPABASE_ANON_KEY.sensitive=true;
 assert.ok(checkEnvironmentManifest(samples,changed).findings.some(f=>f.code==='MANIFEST_PUBLIC_SECRET'));
 // A contradictory type:secret + sensitive:false is still private material.
 // The front-end bundle may never publish a credential by metadata override.
 const hiddenSecret=structuredClone(MANIFEST);
 hiddenSecret.variables.frontend.VITE_SUPABASE_ANON_KEY.type='secret';
 hiddenSecret.variables.frontend.VITE_SUPABASE_ANON_KEY.sensitive=false;
 assert.ok(checkEnvironmentManifest(samples,hiddenSecret).findings.some(f=>
   f.code==='MANIFEST_PUBLIC_SECRET'&&f.key==='VITE_SUPABASE_ANON_KEY'));
 const missing=samples.bridge.replace(/^HIPICO_SOURCE_AUTO_REPLY_ENABLED=false\r?\n/m,'');
 assert.ok(check({bridge:missing}).findings.some(f=>f.code==='MANIFEST_MISSING_SAMPLE_KEY'));
});
test('#665 startup contract from merged #955 cannot be switched on in checked-in template',()=>{
 const result=check({backend:samples.backend.replace('ALLOW_DEV_TENANT_HEADER=false','ALLOW_DEV_TENANT_HEADER=true')});
 assert.ok(result.findings.some(f=>f.code==='MANIFEST_UNSAFE_DEFAULT'&&f.key==='ALLOW_DEV_TENANT_HEADER'));
});

test('#665 typed examples reject nonboolean, invalid numeric, unsupported enum and malformed URL',()=>{
 for(const [owner,key,from,bad] of [
  ['backend','PORT','3030','not-a-number'],
  ['backend','MOCK_BCV_RATE','36.25','thirty-six'],
  ['backend','NODE_ENV','development','production-preview'],
  ['backend','READINESS_CACHE_MS','2000','1.5'],
  ['bridge','HIPICO_POLL_MS','1000','2 seconds'],
  ['bridge','HIPICO_LAB_SEND_ENABLED','false','enabled'],
  ['bridge','HIPICO_TRANSPORT_ADAPTER','playwright-web','unsupported-adapter'],
  ['frontend','VITE_API_BASE_URL','http://localhost:3030/api/v1','not-an-endpoint']
 ]){
  assert.ok(samples[owner].includes(key+'='+from),key);
  const result=check({[owner]:samples[owner].replace(key+'='+from,key+'='+bad)});
  assert.ok(result.findings.some(x=>x.code==='MANIFEST_SAMPLE_TYPE_INVALID'&&x.key===key),key);
  assert.equal(JSON.stringify(result).includes(bad),false);
 }
});

test('#665 valid Supabase placeholders and relative marketing links remain supported',()=>{
 assert.equal(check().status,'PASS');
 const changed=samples.frontend.replace('VITE_MARKETING_DEMO_URL=/?module=login',
   'VITE_MARKETING_DEMO_URL=/landing?campaign=demo');
 assert.equal(check({frontend:changed}).status,'PASS');
});

test('#665 missing or duplicate enum values fail the registry validation',()=>{
 const empty=JSON.parse(JSON.stringify(MANIFEST));
 empty.variables.backend.NODE_ENV.allowedValues=[];
 assert.ok(checkEnvironmentManifest(samples,empty).findings.some(x=>x.code==='MANIFEST_ENUM_VALUES_INVALID'));
 const duplicate=JSON.parse(JSON.stringify(MANIFEST));
 duplicate.variables.backend.NODE_ENV.allowedValues=['development','development'];
 assert.ok(checkEnvironmentManifest(samples,duplicate).findings.some(x=>x.code==='MANIFEST_ENUM_VALUES_INVALID'));
});

test('#665 malformed active template lines fail closed without leaking values',()=>{
  for(const [owner,line] of [
    ['frontend','VITE_BAD-TOKEN=secret-do-not-echo'],
    ['frontend','VITE_DANGLING="secret-do-not-echo'],
    ['backend','PORT:3030'],
    ['bridge','export HIPICO_LAB_SEND_ENABLED false']
  ]){
    const report=check({[owner]:samples[owner]+'\n'+line});
    assert.equal(report.status,'FAIL',owner);
    assert.ok(report.findings.some(f=>f.code==='MANIFEST_INVALID_SAMPLE_LINE'&&f.owner===owner),owner);
    assert.equal(JSON.stringify(report).includes('secret-do-not-echo'),false);
    assert.equal(JSON.stringify(report).includes(line),false);
  }
  assert.equal(check({backend:samples.backend+'\n# note: ignored\n'}).status,'PASS');
});

test('#665 blank booleans counts and enumerations are invalid, blank secrets stay valid',()=>{
  for(const [owner,key,value] of [
    ['backend','PORT','3030'],
    ['backend','NODE_ENV','development'],
    ['backend','ALLOW_DEV_TENANT_HEADER','false'],
    ['bridge','HIPICO_POLL_MS','1000'],
    ['bridge','HIPICO_LAB_SEND_ENABLED','false']
  ]){
    const original=key+'='+value;
    assert.ok(samples[owner].includes(original),original);
    const report=check({[owner]:samples[owner].replace(original,key+'=')});
    assert.ok(report.findings.some(f=>f.code==='MANIFEST_SAMPLE_TYPE_INVALID'&&f.key===key),original);
  }
  assert.equal(check().status,'PASS');
});

test('#665 URL protocols are scoped to frontend/API, Bridge and PostgreSQL roles',()=>{
 for(const [owner,key,unsafe] of [
  ['frontend','VITE_API_BASE_URL','postgresql://postgres@example.test:5432/postgres'],
  ['frontend','VITE_API_BASE_URL','/api/v1'],
  ['frontend','VITE_SUPABASE_URL','postgresql://postgres@example.test:5432/postgres'],
  ['backend','DATABASE_RUNTIME_URL','https://db.example.test/postgres'],
  ['backend','DIRECT_DATABASE_URL','https://db.example.test/postgres'],
  ['bridge','HIPICO_INGEST_URL','postgresql://postgres@example.test:5432/postgres'],
  ['frontend','VITE_MARKETING_DEMO_URL','postgresql://postgres@example.test:5432/postgres']
 ]){
  const before=samples[owner];
  const expression=new RegExp('^'+key+'=.*$','m');
  assert.match(before,expression,key+' must exist in the versioned template');
  const modified=before.replace(expression,key+'='+unsafe);
  const results=check({[owner]:modified});
  assert.ok(results.findings.some(x=>x.code==='MANIFEST_SAMPLE_TYPE_INVALID'&&x.key===key),owner+'/'+key);
  assert.ok(!JSON.stringify(results).includes(unsafe),'auditor must not reveal URLs');
 }
 assert.equal(check({frontend:samples.frontend.replace(
  /^VITE_MARKETING_DEMO_URL=.*$/m,'VITE_MARKETING_DEMO_URL=/landing?campaign=demo'
 )}).status,'PASS','marketing deep link is the only frontend relative URL role');
});

test('#665 missing, duplicate and cross-owner URL policies fail closed',()=>{
 for(const change of [
  m=>{delete m.variables.frontend.VITE_API_BASE_URL.allowedSchemes;},
  m=>{m.variables.bridge.HIPICO_INGEST_URL.allowedSchemes=['http:','http:'];},
  m=>{m.variables.backend.APP_URL.allowRelative=true;},
  m=>{m.variables.frontend.VITE_SUPABASE_ANON_KEY.allowedSchemes=['https:'];}
 ]){
  const altered=JSON.parse(JSON.stringify(MANIFEST));
  change(altered);
  const report=checkEnvironmentManifest(samples,altered);
  assert.ok(report.findings.some(x=>x.code==='MANIFEST_URL_POLICY_INVALID'),JSON.stringify(report.findings));
 }
});


test('#665 manifest missing frontend owner or altered sample paths fails closed',()=>{
 const clone=()=>JSON.parse(JSON.stringify(MANIFEST));
 const scenarios=[
  {code:'MANIFEST_SURFACE_PATH_INVALID',owner:'frontend',change:m=>{delete m.surfaces.frontend;}},
  {code:'MANIFEST_SURFACE_CATALOG_MISSING',owner:'frontend',change:m=>{delete m.variables.frontend;}},
  {code:'MANIFEST_SURFACE_PATH_INVALID',owner:'backend',change:m=>{m.surfaces.backend.examplePath='frontend/.env.example';}},
  {code:'MANIFEST_SURFACE_PATH_INVALID',owner:'frontend',change:m=>{m.surfaces.frontend.examplePath=null;}},
  {code:'MANIFEST_SURFACE_PATH_INVALID',owner:'build',change:m=>{m.surfaces.build.examplePath='backend/.env.example';}},
  {code:'MANIFEST_UNKNOWN_SURFACE',owner:'shadow',change:m=>{m.surfaces.shadow={examplePath:null};}},
  {code:'MANIFEST_UNKNOWN_SURFACE',owner:'shadow',change:m=>{m.variables.shadow={};}}
 ];
 for(const {code,owner,change} of scenarios){
   const altered=clone();
   change(altered);
   const report=checkEnvironmentManifest(samples,altered);
   assert.equal(report.status,'FAIL',owner);
   assert.ok(report.findings.some(f=>f.code===code&&f.owner===owner),owner+'/'+code);
 }
});

test('#665 malformed top-level manifest returns safe codes, never a bypass or exception',()=>{
 for(const bad of [null,{}, {surfaces:null,variables:{}},{surfaces:{},variables:null},{surfaces:[],variables:{}}]){
   const result=checkEnvironmentManifest(samples,bad);
   assert.equal(result.status,'FAIL');
   assert.ok(result.findings.some(f=>f.code==='MANIFEST_STRUCTURE_INVALID'||
       f.code==='MANIFEST_SURFACE_PATH_INVALID'));
   assert.equal(JSON.stringify(result).includes('SUPABASE_SERVICE_ROLE_KEY='),false);
 }
});

test('#665 sample loader cannot be redirected by mutable manifest metadata',()=>{
 const previous=MANIFEST.surfaces.frontend.examplePath;
 try{
  // Swap to another *public versioned* sample, never a private credential file.
  MANIFEST.surfaces.frontend.examplePath='backend/.env.example';
  assert.deepEqual(loadVersionedSamples(),samples);
 }finally{
  MANIFEST.surfaces.frontend.examplePath=previous;
 }
});

test('#665 empty mandatory owner catalog fails instead of silently skipping checks',()=>{
 for(const owner of ['backend','frontend','bridge','build']){
  const altered=structuredClone(MANIFEST);
  altered.variables[owner]={};
  const report=checkEnvironmentManifest(samples,altered);
  assert.equal(report.status,'FAIL',owner);
  assert.ok(report.findings.some(f=>f.code==='MANIFEST_SURFACE_CATALOG_MISSING'&&f.owner===owner),owner);
 }
});

test('#665 HTTP(S) template URLs cannot embed usernames or passwords',()=>{
 for(const [owner,key,bad] of [
  ['frontend','VITE_API_BASE_URL','https://synthetic-user:synthetic-pass@api.example.test/v1'],
  ['frontend','VITE_MARKETING_DEMO_URL','https://synthetic-user@site.example.test/landing'],
  ['backend','APP_URL','https://synthetic-user:synthetic-pass@site.example.test/'],
  ['backend','SECURITY_ALERT_WEBHOOK_URL','https://synthetic-user@hooks.example.test/'],
  ['bridge','HIPICO_INGEST_URL','https://synthetic-user:synthetic-pass@bridge.example.test/events'],
  ['bridge','HIPICO_BRIDGE_HEALTH_URL','http://synthetic-user@127.0.0.1:3000/health']
 ]){
  const expression=new RegExp('^'+key+'=.*$','m');
  assert.match(samples[owner],expression);
  const report=check({[owner]:samples[owner].replace(expression,key+'='+bad)});
  assert.ok(report.findings.some(f=>f.code==='MANIFEST_SAMPLE_TYPE_INVALID'&&f.owner===owner&&f.key===key),owner+'/'+key);
  assert.equal(JSON.stringify(report).includes('synthetic-user'),false);
  assert.equal(JSON.stringify(report).includes('synthetic-pass'),false);
 }
});

test('#665 authenticated PostgreSQL connections remain server-only valid samples',()=>{
 const updated=samples.backend.replace(/^DATABASE_RUNTIME_URL=.*$/m,
  'DATABASE_RUNTIME_URL=postgresql://synthetic-user:synthetic-pass@db.example.test:5432/fixture');
 assert.ok(updated!==samples.backend);
 const report=check({backend:updated});
 assert.equal(report.status,'PASS',JSON.stringify(report.findings));
 assert.equal(MANIFEST.variables.backend.DATABASE_RUNTIME_URL.visibility,'server');
 assert.equal(MANIFEST.variables.backend.DATABASE_RUNTIME_URL.sensitive,true);
});

test('#665 malformed per-key metadata fails closed without TypeError or disclosure',()=>{
 for(const [owner,key] of [
  ['backend','PORT'],
  ['frontend','VITE_API_BASE_URL'],
  ['bridge','HIPICO_INGEST_URL'],
  ['build','GITHUB_SHA']
 ]){
  for(const malformed of [null,false,42,[], 'synthetic-private-value']){
   const corrupted=structuredClone(MANIFEST);
   corrupted.variables[owner][key]=malformed;
   const report=checkEnvironmentManifest(samples,corrupted);
   assert.equal(report.status,'FAIL',owner+'/'+key);
   assert.ok(report.findings.some(f=>
    f.code==='MANIFEST_INVALID_ENTRY'&&f.owner===owner&&f.key===key
   ),owner+'/'+key);
   assert.equal(JSON.stringify(report).includes('synthetic-private-value'),false);
  }
 }
});

test('#665 public frontend URL query and fragments never carry credential parameters',()=>{
 for(const [key, url] of [
  ['VITE_API_BASE_URL','https://api.example.test/v1?access_token=synthetic-private-query'],
  ['VITE_SUPABASE_URL','https://supabase.example.test/?client_secret=synthetic-private-query'],
  ['VITE_API_BASE_URL','http://localhost:3030/api?api_key=synthetic-private-query'],
  ['VITE_MARKETING_DEMO_URL','/?module=login&token=synthetic-private-query'],
  ['VITE_MARKETING_DEMO_URL','/?module=login#access_token=synthetic-private-fragment'],
  ['VITE_MARKETING_DEMO_URL','/#/welcome?service_role_key=synthetic-private-fragment'],
  ['VITE_MARKETING_DEMO_URL','https://public.example.test/?utm_campaign=demo#/?jwt=synthetic-private-fragment']
 ]){
  const altered=samples.frontend.replace(new RegExp('^'+key+'=.*$','m'),key+'='+url);
  const report=check({frontend:altered});
  assert.ok(report.findings.some(f=>f.code==='MANIFEST_SAMPLE_TYPE_INVALID'&&
    f.owner==='frontend'&&f.key===key),key);
  assert.equal(JSON.stringify(report).includes('synthetic-private-'),false);
 }
 // Marketing navigation is still permitted, including safe query/hash routes.
 const safe=samples.frontend.replace(/^VITE_MARKETING_DEMO_URL=.*$/m,
   'VITE_MARKETING_DEMO_URL=/?module=login&utm_source=home#screen?tab=sales');
 assert.equal(check({frontend:safe}).status,'PASS');
 // Database credentials remain valid in a backend-only connection URL.
 const db=samples.backend.replace(/^DATABASE_RUNTIME_URL=.*$/m,
  'DATABASE_RUNTIME_URL=postgresql://synthetic-user:synthetic-pass@db.example.test:5432/fixture');
 assert.equal(check({backend:db}).status,'PASS');
});
