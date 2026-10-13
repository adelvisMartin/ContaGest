import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIG_MANIFEST_V665 as MANIFEST} from '../config/environment-manifest-v665.mjs';
import {checkEnvironmentManifest,loadVersionedSamples,parseTemplateInventory} from '../scripts/check-environment-manifest-v665.mjs';

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


test('#665 malformed dotenv lines cannot hide new public environment variables',()=>{
 for(const bad of [
  'VITE_NEW_SECRET: should-not-be-printed',
  'VITE_NEW_SECRET should-not-be-printed',
  'export VITE_NEW_SECRET should-not-be-printed',
  'set VITE_NEW_SECRET=should-not-be-printed'
 ]){
  const report=check({frontend:samples.frontend+'\n'+bad});
  assert.equal(report.status,'FAIL',bad.split(' ')[0]);
  assert.ok(report.findings.some(f=>f.code==='MANIFEST_MALFORMED_SAMPLE_LINE'));
  assert.doesNotMatch(JSON.stringify(report),/should-not-be-printed/);
 }
});

test('#665 malformed or unterminated quoted values cannot pass as string types',()=>{
 for(const fragment of [
  'VITE_MARKETING_DEMO_URL="/landing',
  "VITE_MARKETING_DEMO_URL='/landing",
  'VITE_MARKETING_DEMO_URL="/landing" trailing-untrusted',
  'VITE_API_BASE_URL="https://example.org/api" unexpected'
 ]){
  const key=fragment.split('=')[0];
  const edited=samples.frontend.replace(
    new RegExp('^'+key+'=.*$','m'),fragment
  );
  const report=check({frontend:edited});
  assert.ok(report.findings.some(f=>f.code==='MANIFEST_MALFORMED_SAMPLE_LINE'&&f.key===key),fragment);
  assert.equal(report.status,'FAIL');
  assert.doesNotMatch(JSON.stringify(report),/trailing-untrusted|unexpected/);
 }
 const valid=parseTemplateInventory(
  'VITE_HEADING="Control #1" # comentario\n' +
  "VITE_PATH='/landing?ref=1' # comentario"
 );
 assert.deepEqual(valid.malformed,[]);
 assert.equal(valid.entries.get('VITE_HEADING'),'Control #1');
 assert.equal(valid.entries.get('VITE_PATH'),'/landing?ref=1');
});

test('#665 malformed sample diagnostics never include credential material',()=>{
 const source='=top-secret-string\n' +
   'JWT_SECRET="unclosed-secret-string\n' +
   'VITE_NEW_TOKEN: another-private-value';
 const parser=parseTemplateInventory(source);
 assert.equal(parser.malformed.length,3);
 const report=check({backend:samples.backend+'\n'+source});
 assert.equal(report.status,'FAIL');
 assert.ok(report.findings.some(f=>f.code==='MANIFEST_MALFORMED_SAMPLE_LINE'));
 for(const value of ['top-secret-string','unclosed-secret-string','another-private-value']){
  assert.equal(JSON.stringify(report).includes(value),false);
 }
});


test('#665 deleting frontend or LAB Bridge owner can never produce a manifest PASS',()=>{
 for(const owner of ['backend','frontend','bridge','build']){
  const missing=JSON.parse(JSON.stringify(MANIFEST));
  delete missing.surfaces[owner];
  delete missing.variables[owner];
  const result=checkEnvironmentManifest(samples,missing);
  assert.equal(result.status,'FAIL',owner);
  assert.ok(result.findings.some(f=>f.code==='MANIFEST_REQUIRED_SURFACE_INVALID'&&f.owner===owner));
  assert.ok(result.findings.some(f=>f.code==='MANIFEST_OWNER_CATALOG_MISSING'&&f.owner===owner));
 }
});

test('#665 changing template paths or emptying a catalog fails closed',()=>{
 for(const owner of ['backend','frontend','bridge']){
  const different=JSON.parse(JSON.stringify(MANIFEST));
  different.surfaces[owner].examplePath='../../private/.env';
  assert.ok(checkEnvironmentManifest(samples,different).findings.some(f=>
    f.code==='MANIFEST_REQUIRED_SURFACE_INVALID'&&f.owner===owner));
  const disabled=JSON.parse(JSON.stringify(MANIFEST));
  disabled.surfaces[owner].examplePath=null;
  disabled.variables[owner]={};
  const result=checkEnvironmentManifest(samples,disabled);
  assert.ok(result.findings.some(f=>f.code==='MANIFEST_REQUIRED_SURFACE_INVALID'&&f.owner===owner));
  assert.ok(result.findings.some(f=>f.code==='MANIFEST_OWNER_CATALOG_MISSING'&&f.owner===owner));
 }
});

test('#665 undeclared surfaces/catalogs are rejected without reading their paths',()=>{
 const registry=JSON.parse(JSON.stringify(MANIFEST));
 registry.surfaces.external={examplePath:'../../private/.env'};
 registry.variables.external={PRIVATE_TOKEN:{
  type:'secret',visibility:'server',sensitive:true,requiredWhen:'optional',sample:'required'
 }};
 const result=checkEnvironmentManifest(samples,registry);
 assert.equal(result.status,'FAIL');
 assert.ok(result.findings.some(f=>f.code==='MANIFEST_UNEXPECTED_SURFACE'&&f.owner==='external'));
 assert.ok(result.findings.some(f=>f.code==='MANIFEST_UNEXPECTED_CATALOG'&&f.owner==='external'));
 const source=readFileSync(new URL('../scripts/check-environment-manifest-v665.mjs',import.meta.url),'utf8');
 const loader=source.slice(source.indexOf('export function loadVersionedSamples(){'));
 assert.match(loader,/Object\.entries\(EXPECTED_SURFACES\)/);
 assert.doesNotMatch(loader,/Object\.entries\(CONFIG_MANIFEST_V665\.surfaces\)/);
});
