import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decideClientRegistrationPreflight,
  checkClientRegistrationBeforeSave
} from '../frontend/src/services/clientRegistrationPreflight.mjs';

const clear = () => ({
  status:'REVIEW_NEW',reason:'NO_EXISTING_CLIENT_MATCH',
  candidates:[],reviewOnly:true,conversionAuthorized:false
});
const verdict = (status,reason,candidates=['opaque-client-uuid']) => ({
  status,reason,candidates,reviewOnly:true,conversionAuthorized:false
});

test('REVIEW_NEW permits only a separate canonical server-create attempt, not conversion',()=>{
 const result=decideClientRegistrationPreflight(clear());
 assert.equal(result.maySubmit,true);
 assert.equal(result.reason,'REVIEW_NEW');
 assert.ok(Object.isFrozen(result));
 assert.doesNotMatch(JSON.stringify(result),/opaque-client/);
});
test('all supported fiscal conflicts block registration without exposing Client IDs',()=>{
 const scenarios=[
  ['REVIEW_EXISTING','EXISTING_CLIENT_AUTHORITY'],
  ['BLOCKED','AMBIGUOUS_CLIENT_MATCH'],
  ['BLOCKED','CONFLICTING_RIF_EMAIL'],
  ['BLOCKED','UNVERIFIABLE_CLIENT_RIF'],
  ['BLOCKED','CANDIDATE_LIMIT_EXCEEDED'],
  ['BLOCKED','CLIENT_RIF_REQUIRED']
 ];
 for(const [status,reason] of scenarios){
  const v=decideClientRegistrationPreflight(verdict(status,reason));
  assert.equal(v.maySubmit,false,reason);
  assert.doesNotMatch(JSON.stringify(v),/opaque-client-uuid/,reason);
 }
});
test('fails closed if server hints automatic conversion or omits security flags',()=>{
 const broken=[
  {...clear(),conversionAuthorized:true},
  {...clear(),reviewOnly:false},
  {...clear(),candidates:['not-empty']},
  {...clear(),candidates:null},
  {...clear(),status:'NEW'},
  {...clear(),reason:'other'},
  {...clear(),candidates:[null]},null,[],{},
  {status:'BLOCKED',reason:'REVIEW_NEW',candidates:[],reviewOnly:true,conversionAuthorized:false}
 ];
 for(const value of broken)assert.equal(decideClientRegistrationPreflight(value).maySubmit,false);
});
test('rejects fake REVIEW_EXISTING reason and malformed candidate IDs',()=>{
 assert.equal(decideClientRegistrationPreflight(verdict('REVIEW_EXISTING','NO_EXISTING_CLIENT_MATCH')).reason,'PREFLIGHT_INVALID');
 assert.equal(decideClientRegistrationPreflight(verdict('REVIEW_EXISTING','EXISTING_CLIENT_AUTHORITY',[''])).reason,'PREFLIGHT_INVALID');
});
test('requests only fiscal identifiers over caller-supplied canonical BackendApi adapter',async()=>{
 let path,payload,calls=0;
 const res=await checkClientRegistrationBeforeSave(
  {name:'Secret name',rif:' J-12345678-9 ',email:' CONTACT@example.com ',phone:'999999'},
  async(p,body)=>{path=p;payload=body;calls++;return clear()}
 );
 assert.equal(calls,1);
 assert.equal(path,'/clients/preflight');
 assert.deepEqual(payload,{rif:'J-12345678-9',email:'CONTACT@example.com'});
 assert.equal(res.maySubmit,true);
});
test('omits optional email without allowing a name or phone to become identity',async()=>{
 let payload;
 await checkClientRegistrationBeforeSave({rif:'J123456789',phone:'123'},async(_,x)=>{payload=x;return clear()});
 assert.deepEqual(payload,{rif:'J123456789'});
});
test('transport, 401, 403, 429 and timeout cannot trigger local client fallback',async()=>{
 for(const status of [0,401,403,429,503]){
  const result=await checkClientRegistrationBeforeSave({rif:'J123456789'},async()=>{
   const err=new Error('private backend diagnostic');err.status=status;throw err;
  });
  assert.equal(result.maySubmit,false);
  assert.equal(result.reason,'PREFLIGHT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result),/private backend diagnostic/);
 }
});
test('invalid submission or missing requester never touches network',async()=>{
 let calls=0;const req=async()=>{calls++;return clear()};
 for(const value of [null,{}, {rif:''}, {rif:'a'.repeat(41)}, {rif:'J123456789',email:'@'.repeat(255)}]){
  const result=await checkClientRegistrationBeforeSave(value,req);
  assert.equal(result.maySubmit,false);
 }
 assert.equal(calls,0);
 assert.equal((await checkClientRegistrationBeforeSave({rif:'J123456789'},null)).maySubmit,false);
});
test('UI binds preflight to server creation with no local Client fallback',()=>{
 const src=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 const requestAt=src.indexOf('await checkClientRegistrationBeforeSave(');
 const createAt=src.indexOf('await SupabaseSyncService.createClient(data)');
 assert.ok(requestAt>0&&createAt>requestAt);
 assert.match(src,/if \(!verdict\.maySubmit\) \{[\s\S]*?return;/);
 assert.match(src,/BackendApi\.post\(path, payload\)/);
 assert.doesNotMatch(src,/draft\.clients\.unshift|uid\('cli'\)|allowFallback/);
});
test('UI provides a keyboard-accessible status region and never prints raw IDs',()=>{
 const src=readFileSync(new URL('../frontend/src/pages/ClientsPage.js',import.meta.url),'utf8');
 assert.match(src,/id="clientPreflightFeedback" role="status" aria-live="polite"/);
 assert.match(src,/feedback\.textContent = verdict\.message/);
 assert.doesNotMatch(src,/feedback\.innerHTML|verdict\.candidates\.join/);
});
