import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Execute the actual recovery functions from the PWA module against an isolated
// network and URL harness. No Supabase secrets or live accounts are accessed.
const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/password-recovery.js', import.meta.url), 'utf8');
const start = source.indexOf('const RECOVERY_URL_PARAMS =');
const end = source.indexOf('function passwordScore(', start);
assert.ok(start > 0 && end > start, 'password recovery implementation boundaries changed');
const isolated = source.slice(start, end).replace(/^export /gm, '');
const compiled = '(function(){ let recoveryAccessToken = "", recoveryError = "", recoveryUpdateInFlight = false;\n' +
  isolated + '\nreturn {read:readRecoveryContext, update:updateRecoveredPassword, get:()=>({token:recoveryAccessToken,error:recoveryError,inFlight:recoveryUpdateInFlight})};})()';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness({href='https://example.test/hipico-control/#type=recovery&access_token=RECOVERY_TOKEN', signOut, fetch}={}) {
  let current = new URL(href);
  const replaced = [];
  const requests = [];
  const location = {
    get href() { return current.toString(); },
    get hash() { return current.hash; },
    get search() { return current.search; }
  };
  const history = {state:{}, replaceState(_state,_unused,url) { replaced.push(url); current=new URL(url); }};
  let logCalls=0;
  const api = vm.runInNewContext(compiled,{
    URL,URLSearchParams,location,history,
    CLOUD_CONFIG:{supabaseUrl:'https://auth.example.test',publishableKey:'sb_publishable_synthetic'},
    signOut:signOut || (async()=>{}),
    fetch:async(url,options)=>{requests.push({url:String(url),options});return fetch
      ? fetch(String(url),options) : {ok:true,status:200};},
    console:{warn(){logCalls++;}}
  });
  api.read();
  return {api,requests,replaced,get url(){return current.toString()},get warnings(){return logCalls}};
}
const PASSWORD = 'Strong-Synthetic-Password-123!';

test('#267 duplicates cannot launch multiple password updates while signOut is pending', async()=>{
  const pause=deferred();let signs=0;
  const h=harness({signOut:async()=>{signs++;await pause.promise;}});
  const first=h.api.update(PASSWORD);
  assert.equal(h.api.get().inFlight,true);
  await assert.rejects(h.api.update(PASSWORD),/RECOVERY_ALREADY_IN_PROGRESS/);
  assert.equal(signs,1);
  assert.equal(h.requests.length,0);
  pause.resolve();
  assert.equal(await first,true);
  assert.equal(h.requests.filter(x=>x.url.includes('/auth/v1/user')).length,1);
  assert.equal(h.api.get().inFlight,false);
});

test('#267 duplicate submission during pending Supabase PUT is rejected without a second fetch', async()=>{
  const pause=deferred();
  const h=harness({fetch:async url=>url.endsWith('/auth/v1/user')?pause.promise:{ok:true,status:200}});
  const first=h.api.update(PASSWORD);
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.api.get().inFlight,true);
  await assert.rejects(h.api.update(PASSWORD),/RECOVERY_ALREADY_IN_PROGRESS/);
  pause.resolve({ok:true,status:200});
  assert.equal(await first,true);
  assert.equal(h.requests.filter(x=>x.url.includes('/auth/v1/user')).length,1);
});

test('#267 successful reset consumes in-memory token before optional profile RPC', async()=>{
  const pause=deferred();
  const rpcStarted=deferred();
  const h=harness({fetch:async url=>{
    if (url.includes('/hipico_mark_password_changed')) {
      rpcStarted.resolve();
      return pause.promise;
    }
    return {ok:true,status:200};
  }});
  const first=h.api.update(PASSWORD);
  // Wait for the actual RPC boundary, not an arbitrary number of microtasks.
  // If the RPC was accidentally removed, the first operation must settle,
  // making this assertion fail instead of hanging on an unobserved request.
  await Promise.race([
    rpcStarted.promise,
    first.then(()=>{throw new Error('RECOVERY_RPC_NOT_INVOKED')})
  ]);
  assert.equal(h.api.get().token,'');
  assert.equal(h.api.get().inFlight,true);
  pause.resolve({ok:true,status:200});
  assert.equal(await first,true);
  await assert.rejects(h.api.update(PASSWORD),/enlace de recuperación no es válido/);
});

test('#267 expiration 401/403 revokes recovery token and allows no reuse', async()=>{
  for (const status of [401,403]) {
    const h=harness({fetch:async url=>url.endsWith('/auth/v1/user')?{ok:false,status}:{ok:true,status:200}});
    await assert.rejects(h.api.update(PASSWORD),/RECOVERY_PROVIDER_UNAVAILABLE/);
    assert.equal(h.api.get().token,'');
    assert.equal(h.api.get().inFlight,false);
    const n=h.requests.length;
    await assert.rejects(h.api.update(PASSWORD),/enlace de recuperación no es válido/);
    assert.equal(h.requests.length,n);
  }
});

test('#267 recoverable 500 failure unlocks the attempt but never leaks raw provider body', async()=>{
  let attempts=0;let bodyReads=0;
  const h=harness({fetch:async url=>{
    if(url.endsWith('/auth/v1/user') && ++attempts===1)return {ok:false,status:500,
      json(){bodyReads++;return {message:'email=secret@example.org&token=PRIVATE'};}};
    return {ok:true,status:200};
  }});
  await assert.rejects(h.api.update(PASSWORD),error=>error.message==='RECOVERY_PROVIDER_UNAVAILABLE' &&
      !/secret|PRIVATE|@/.test(error.message));
  assert.equal(bodyReads,0);
  assert.equal(h.api.get().inFlight,false);
  assert.equal(h.api.get().token,'RECOVERY_TOKEN');
  assert.equal(await h.api.update(PASSWORD),true);
  assert.equal(attempts,2);
});

test('#267 invalid callback never stores raw provider description even if it contains secrets',()=>{
  const h=harness({href:'https://example.test/hipico-control/?retry=1#type=recovery&access_token=SENSITIVE&error_description=email%3Dprivate%40example.org%26token%3DSECRET'});
  assert.equal(h.api.get().token,'');
  assert.equal(h.api.get().error,'INVALID_RECOVERY_LINK');
  assert.doesNotMatch(JSON.stringify(h.api.get()),/private|example.org|SECRET|SENSITIVE/);
  assert.equal(h.url,'https://example.test/hipico-control/?retry=1');
  assert.equal(h.replaced.length,1);
});

test('#267 invalid callback after valid recovery cannot reuse previous token',()=>{
  const h=harness();
  assert.equal(h.api.get().token,'RECOVERY_TOKEN');
  // Re-read a cleaned URL; the old recovery capability must be invalidated.
  h.api.read();
  assert.equal(h.api.get().token,'');
});

test('#267 valid recovery callback is cleaned without consuming legitimate query keys',()=>{
  const h=harness({href:'https://example.test/hipico-control/?lang=es#type=recovery&access_token=RECOVERY_TOKEN&refresh_token=PRIVATE'});
  assert.equal(h.api.get().token,'RECOVERY_TOKEN');
  assert.equal(h.url,'https://example.test/hipico-control/?lang=es');
  assert.equal(h.api.get().error,'');
});

test('#267 policy retains publishable key and no extra privileged API or profile mutation',()=>{
  assert.match(source,/authHeaders\(token\)/);
  assert.match(source,/await signOut\(\);/);
  assert.match(source,/\/auth\/v1\/user/);
  assert.match(source,/method: 'PUT'/);
  assert.doesNotMatch(source,/service[_-]?role|sb_secret_|encrypted_password/i);
  assert.match(source,/if \(recoveryUpdateInFlight\) return;/);
});
