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

test('shared shell controls are explicit buttons and mobile touch geometry is at least 44px',()=>{
  const layout=read('frontend','src','components','layout.js');
  const shell=read('frontend','src','styles','shell-contract.css');
  const primitives=read('frontend','src','styles','runtime-primitives-v13.css');
  assert.match(layout,/return `<button type="button" class="menu-link hf-menu-item/);
  assert.match(layout,/<button type="button" class="hf-sidebar-account"/);
  assert.match(layout,/<button id="btnUserMenu" type="button"/);
  assert.match(shell,/--cg-header-mobile:\s*60px/);
  assert.match(shell,/#btnCommandPalette\.hf-command-trigger[\s\S]*var\(--cg-v-control-touch\)/);
  assert.match(shell,/#btnTema,[\s\S]*#btnUserMenu,[\s\S]*#btnOpenSidebar[\s\S]*var\(--cg-v-control-touch\)/);
  assert.match(primitives,/@media \(max-width:760px\)[\s\S]*MuiButton-root[\s\S]*--cg-v-control-touch/);
  assert.match(primitives,/html\.dark[\s\S]*cgx-btn-primary[\s\S]*color:var\(--cg-v-bg\) !important/);
});

test('MUI follows mobile touch, non-dead breadcrumbs and accessible dark primary contrast',()=>{
  const mui=read('frontend','src','components','muiRuntime.js');
  assert.match(mui,/subtle:'#808690'/);
  assert.match(mui,/subtle:'#707783'/);
  assert.match(mui,/const onBrand=dark\?'#111214':'#ffffff'/);
  assert.match(mui,/primary: \{ main: palette\.brand, contrastText:onBrand \}/);
  assert.match(mui,/MuiIconButton:[\s\S]*max-width:760px[\s\S]*minWidth:44,minHeight:44/);
  assert.match(mui,/if\(!item\.route\)return React\.createElement\(Mui\.Typography/);
});

test('PR browser gate includes deep mobile audit for the complete module catalog',()=>{
  const runner=read('scripts','vercel-browser-preqa-v16.mjs');
  const spec=read('qa','mobile-deep-v162.spec.mjs');
  assert.match(runner,/qa\/mobile-deep-v162\.spec\.mjs/);
  assert.match(spec,/MODULE_VISUAL_CATALOG/);
  assert.match(spec,/width:390,height:844/);
  assert.match(spec,/short-target/);
  assert.match(spec,/overlapFindings/);
  assert.match(spec,/primary action contrast stays readable/);
});

test('service worker cannot serve stale javascript or css ahead of the deployed network bundle',()=>{
  const sw=read('frontend','public','sw.js');
  assert.match(sw,/contagest-ve-v11-16-1/);
  assert.match(sw,/request\.destination === 'script' \|\| request\.destination === 'style'/);
  assert.match(sw,/event\.respondWith\(networkFirst\(request\)\)/);
  assert.match(sw,/fetch\(request, \{ cache:'no-store' \}\)/);
});