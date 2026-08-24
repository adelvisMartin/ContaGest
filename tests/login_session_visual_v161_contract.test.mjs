import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

test('protected requests share one refresh and expire the browser session once',()=>{
  const api=read('frontend','src','services','backendApi.js');
  assert.match(api,/let refreshInFlight\s*=\s*null/);
  assert.match(api,/function refreshCookieSessionSingleFlight\(api\)/);
  assert.match(api,/if\s*\(refreshInFlight\)\s*return refreshInFlight/);
  assert.match(api,/await refreshCookieSessionSingleFlight\(this\)/);
  assert.match(api,/cg:auth-expired/);
  assert.match(api,/expireBrowserSession/);
  assert.doesNotMatch(api,/await refreshCookieSession\(this\)/);
});

test('application validates backend cookie session before mounting protected routes',()=>{
  const app=read('frontend','src','app.js');
  assert.match(app,/appReady=false/);
  assert.match(app,/async function bootstrapApp\(\)/);
  assert.match(app,/applyAuthenticatedSession\(await AuthService\.me\(\)\)/);
  assert.match(app,/if\(appReady\)render\(\)/);
  assert.match(app,/window\.addEventListener\('cg:auth-expired'/);
  assert.match(app,/rememberProtectedRoute\(requested\)/);
  assert.match(app,/updateViaCache:'none'/);
});

test('login is a scoped enterprise product surface inside the existing visual owner graph',()=>{
  const page=read('frontend','src','pages','LoginPage.js');
  const adapters=read('frontend','src','styles','module-adapters.css');
  const runtime=read('frontend','src','styles','erp-runtime.css');
  assert.match(page,/login-shell-v161/);
  assert.match(page,/sessionStorage\.getItem\('cg_post_login_route'\)/);
  assert.match(page,/AccessControlService\.canAccessRoute/);
  assert.doesNotMatch(page,/Equipo interno|admin@erp\.local/);
  assert.match(adapters,/Authentication product surface/);
  assert.match(adapters,/login-shell\.login-shell-v161/);
  assert.match(adapters,/input:-webkit-autofill/);
  assert.match(adapters,/login-license-details summary>span/);
  assert.match(adapters,/--cg-v-/);
  assert.doesNotMatch(adapters,/linear-gradient|radial-gradient/);
  assert.doesNotMatch(runtime,/auth-shell\.css/);
  assert.match(runtime,/@import '\.\/module-adapters\.css'/);
  assert.match(runtime,/@import '\.\/contagest-visual-system-v12\.css'/);
});

test('service worker cannot serve stale javascript or css ahead of the deployed network bundle',()=>{
  const sw=read('frontend','public','sw.js');
  assert.match(sw,/contagest-ve-v11-16-1/);
  assert.match(sw,/request\.destination === 'script' \|\| request\.destination === 'style'/);
  assert.match(sw,/event\.respondWith\(networkFirst\(request\)\)/);
  assert.match(sw,/fetch\(request, \{ cache:'no-store' \}\)/);
});
