import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const recoveryPath = 'frontend/public/hipico-control/assets/js/password-recovery.js';
const canonicalCssPath = 'frontend/public/hipico-control/assets/css/app.css';
const compatibilityCssPath = 'frontend/public/hipico-control/assets/css/ui-system-v3-compat.css';
const indexPath = 'frontend/public/hipico-control/index.html';

test('#267 exposes password recovery from the auth screen without enabling public signup', async () => {
  const [recovery, index, runtime] = await Promise.all([
    fs.readFile(recoveryPath, 'utf8'),
    fs.readFile(indexPath, 'utf8'),
    fs.readFile('frontend/public/hipico-control/runtime-config.js', 'utf8')
  ]);
  assert.match(index, /password-recovery\.js/);
  assert.match(recovery, /¿Olvidaste tu contraseña\?/);
  assert.match(recovery, /recover-password/);
  assert.match(runtime, /"allowSignup"\s*:\s*false/);
});

test('#267 requests Supabase recovery with publishable credentials and an explicit app redirect', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  assert.match(source, /\/auth\/v1\/recover\?redirect_to=/);
  assert.match(source, /CLOUD_CONFIG\.publishableKey/);
  assert.match(source, /recoveryRedirectUrl\(\)/);
  assert.doesNotMatch(source, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i);
});

test('#267 consumes recovery token in memory, clears URL and updates auth user only', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  assert.match(source, /type === 'recovery'/);
  assert.match(source, /access_token/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /method:\s*'PUT'/);
  assert.match(source, /JSON\.stringify\(\{ password: nextPassword \}\)/);
  assert.doesNotMatch(source, /hipico_profiles|auth\.users|encrypted_password/);
});

test('#267 forces a fresh sign-in by clearing the cached cloud session before changing the credential', async () => {
  const [recovery, supabase] = await Promise.all([
    fs.readFile(recoveryPath, 'utf8'),
    fs.readFile('frontend/public/hipico-control/assets/js/supabase.js', 'utf8')
  ]);
  assert.match(recovery, /import \{ signOut \} from '\.\/supabase\.js';/);
  const signOutIndex = recovery.indexOf('await signOut();');
  const passwordUpdateIndex = recovery.indexOf('/auth/v1/user');
  assert.ok(signOutIndex >= 0, 'recovery must clear the regular PWA session');
  assert.ok(passwordUpdateIndex > signOutIndex, 'regular session must be cleared before password update');
  assert.match(supabase, /export async function signOut\(\)[\s\S]*?await persistSession\(null\);/);
});

test('#267 validates password/confirmation and avoids account enumeration copy', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  assert.match(source, /nextPassword\.length < 10/);
  assert.match(source, /password !== confirm/);
  assert.match(source, /Si el correo pertenece a una cuenta válida/);
  assert.match(source, /autocomplete="new-password"/);
});

test('#267 recovery presentation uses the canonical UI and remains mobile-safe', async () => {
  const [entrypoint, compatibleStyles] = await Promise.all([
    fs.readFile(canonicalCssPath, 'utf8'),
    fs.readFile(compatibilityCssPath, 'utf8')
  ]);
  assert.match(entrypoint, /@import url\("\.\/ui-system-v3-compat\.css"\) layer\(legacy\)/);
  assert.match(compatibleStyles, /\.auth-card--recovery\s*\{/);
  assert.match(compatibleStyles, /width:\s*min\(100%,\s*520px\)/);
  assert.match(compatibleStyles, /grid-template-columns:\s*1fr/);
  assert.match(compatibleStyles, /@media \(max-width:\s*780px\)/);
  await assert.rejects(fs.access('frontend/public/hipico-control/assets/css/password-recovery.css'));
  await assert.rejects(fs.access('frontend/public/hipico-control/assets/css/ui-system.css'));
});


test('#267 removes invalid recovery credentials from URL without accepting them as a session', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  const start = source.indexOf('const RECOVERY_URL_PARAMS =');
  const end = source.indexOf('async function parseError(', start);
  assert.ok(start >= 0 && end > start, 'password recovery URL boundary missing');
  const isolated = source.slice(start, end);
  function run(href) {
    let current = new URL(href);
    const location = {
      get href() { return current.toString(); },
      get hash() { return current.hash; },
      get search() { return current.search; }
    };
    const history = {
      state: {},
      replaced: 0,
      replaceState(_state, _unused, nextUrl) {
        this.replaced += 1;
        current = new URL(nextUrl);
      }
    };
    const api = vm.runInNewContext(
      '(function(){ let recoveryAccessToken="",recoveryError="";'
      + isolated
      + ';return {run:readRecoveryContext,clean:cleanAppUrl,'
      + 'state:()=>({token:recoveryAccessToken,error:recoveryError})};})()',
      { URL, URLSearchParams, location, history }
    );
    api.run();
    return { url:current, replaced:history.replaced, ...api.state() };
  }
  const recovered=run('https://example.org/hipico-control/?retry=1#type=recovery&access_token=sensitive&refresh_token=private');
  assert.equal(recovered.token,'sensitive');
  assert.equal(recovered.error,'');
  assert.equal(recovered.url.toString(),'https://example.org/hipico-control/?retry=1');
  assert.equal(recovered.replaced,1);

  for(const url of [
    'https://example.org/hipico-control/#type=signup&access_token=secret',
    'https://example.org/hipico-control/?access_token=secret&refresh_token=private&retry=1',
    'https://example.org/hipico-control/?type=recovery&code=auth-code&token_hash=one-time',
    'https://example.org/hipico-control/#error=access_denied&error_description=private'
  ]){
    const state=run(url);
    assert.equal(state.token,'','invalid recovery context cannot grant access');
    assert.ok(state.error,'invalid context must show a generic error');
    assert.equal(state.url.hash,'');
    assert.equal(state.replaced,1);
    for(const key of ['access_token','refresh_token','code','token_hash','error','error_description','type'])
      assert.equal(state.url.searchParams.has(key),false,key);
  }
  const regular=run('https://example.org/hipico-control/?retry=1');
  assert.equal(regular.replaced,0);
  assert.equal(regular.error,'');
  assert.equal(regular.url.searchParams.get('retry'),'1');
  assert.doesNotMatch(source,/service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i);
});
