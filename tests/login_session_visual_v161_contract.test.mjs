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

test('login v16.2 is the active enterprise auth surface and keeps credentials out of source',()=>{
  const page=read('frontend','src','pages','LoginPage.js');
  const adapters=read('frontend','src','styles','module-adapters.css');
  const runtime=read('frontend','src','styles','erp-runtime.css');
  const hotfix=read('frontend','public','login-hotfix-v162.css');
  assert.match(page,/login-shell-v162/);
  assert.match(page,/sessionStorage\.getItem\('cg_post_login_route'\)/);
  assert.match(page,/AccessControlService\.canAccessRoute/);
  assert.doesNotMatch(page,/Equipo interno|admin@erp\.local/);
  assert.match(adapters,/Authentication product surface/);
  assert.match(adapters,/login-shell\.login-shell-v161/);
  assert.match(adapters,/input:-webkit-autofill/);
  assert.match(adapters,/login-license-details summary>span/);
  assert.match(adapters,/--cg-v-/);
  assert.doesNotMatch(adapters,/linear-gradient|radial-gradient/);
  assert.match(hotfix,/login-shell-v162/);
  assert.match(hotfix,/login-captcha\.is-error/);
  assert.match(hotfix,/login-panel/);
  assert.doesNotMatch(hotfix,/linear-gradient|radial-gradient/);
  assert.doesNotMatch(runtime,/auth-shell\.css/);
  assert.match(runtime,/@import '\.\/module-adapters\.css'/);
  assert.match(runtime,/@import '\.\/contagest-visual-system-v12\.css'/);
});

test('shared shell and every mobile module control use the 44px touch contract',()=>{
  const layout=read('frontend','src','components','layout.js');
  const shell=read('frontend','src','styles','shell-contract.css');
  const primitives=read('frontend','src','styles','runtime-primitives-v13.css');
  const hotfix=read('frontend','public','login-hotfix-v162.css');
  assert.match(layout,/return `<button type="button" class="menu-link hf-menu-item/);
  assert.match(layout,/<button type="button" class="hf-sidebar-account"/);
  assert.match(layout,/<button id="btnUserMenu" type="button"/);
  assert.match(shell,/--cg-header-mobile:\s*60px/);
  assert.match(shell,/#btnCommandPalette\.hf-command-trigger[\s\S]*var\(--cg-v-control-touch\)/);
  assert.match(shell,/#btnOpenSidebar,[\s\S]*#btnTema,[\s\S]*#btnUserMenu[\s\S]*var\(--cg-v-control-touch\)/);
  assert.match(shell,/#pages :where\(button,summary,input:not/);
  assert.match(hotfix,/min-height:44px/);
  assert.match(hotfix,/min-height:46px/);
  assert.match(hotfix,/min-height:48px/);
  assert.match(primitives,/@media \(max-width:760px\)[\s\S]*MuiButton-root[\s\S]*--cg-v-control-touch/);
  assert.match(primitives,/html\.dark[\s\S]*cgx-btn-primary[\s\S]*color:var\(--cg-v-bg\) !important/);
});

test('MUI follows React 19 slot APIs, mobile touch, non-dead breadcrumbs and dark primary contrast',()=>{
  const mui=read('frontend','src','components','muiRuntime.js');
  assert.match(mui,/subtle:'#808690'/);
  assert.match(mui,/subtle:'#707783'/);
  assert.match(mui,/const onBrand=dark\?'#111214':'#ffffff'/);
  assert.match(mui,/primary:\{main:palette\.brand,contrastText:onBrand\}/);
  assert.match(mui,/MuiIconButton:[\s\S]*max-width:760px[\s\S]*minWidth:44,minHeight:44/);
  assert.match(mui,/slotProps:\{inputLabel:\{shrink:true\}\}/);
  assert.match(mui,/htmlInput:\{min:fallback\.min/);
  assert.doesNotMatch(mui,/\bInputProps\s*:/);
  assert.doesNotMatch(mui,/\bInputLabelProps\s*:/);
  assert.match(mui,/if\(!item\.route\)return React\.createElement\(Mui\.Typography/);
});

test('PR browser gate covers every module at three phone widths, real navigation and observable action clicks',()=>{
  const runner=read('scripts','vercel-browser-preqa-v16.mjs');
  const spec=read('qa','mobile-deep-v162.spec.mjs');
  const navigation=read('qa','mobile-navigation-v163.spec.mjs');
  const actions=read('qa','module-actions-runtime-v163.spec.mjs');
  assert.match(runner,/qa\/mobile-deep-v162\.spec\.mjs/);
  assert.match(runner,/qa\/mobile-navigation-v163\.spec\.mjs/);
  assert.match(runner,/qa\/module-actions-runtime-v163\.spec\.mjs/);
  assert.match(spec,/MODULE_VISUAL_CATALOG/);
  assert.match(spec,/name:'phone-360',width:360,height:800/);
  assert.match(spec,/name:'phone-390',width:390,height:844/);
  assert.match(spec,/name:'phone-430',width:430,height:932/);
  assert.match(spec,/short-target/);
  assert.match(spec,/overlapFindings/);
  assert.match(spec,/occludedTargets/);
  assert.match(spec,/primary action contrast stays readable/);
  assert.match(navigation,/every actual sidebar route button navigates/);
  assert.match(navigation,/command palette opens, filters, navigates and closes/);
  assert.match(actions,/every visible module action and submit has a safe runtime contract and an observable effect/);
  assert.match(actions,/QA controlled backend refusal/);
  assert.match(actions,/route-button-did-not-navigate/);
  assert.match(actions,/valid-submit-no-effect/);
});

test('Vercel serverless artifact rejects the retired XLSX runtime dependency chain',()=>{
  const stage=read('frontend','scripts','stage-backend.mjs');
  assert.doesNotMatch(stage,/packages:\s*['"]external['"]/);
  assert.match(stage,/external:\s*EXTERNAL_RUNTIME_PACKAGES/);
  const declaration=stage.match(/const EXTERNAL_RUNTIME_PACKAGES\s*=\s*\[([\s\S]*?)\];/)?.[1]||'';
  assert.ok(declaration.length>0,'external runtime package declaration missing');
  assert.doesNotMatch(declaration,/['"]exceljs['"]/);
  assert.match(stage,/forbiddenXlsxRuntime/);
  assert.match(stage,/@excel\\\.js\\\/jszip|@excel\.js\/jszip/);
  assert.match(stage,/es-pako/);
});

test('XLSX runtime is internal so export dependencies cannot break auth bootstrap',()=>{
  const exportsRoute=read('backend','src','modules','exports','exports.routes.ts');
  const writer=read('backend','src','modules','exports','xlsx-writer.ts');
  assert.doesNotMatch(exportsRoute,/exceljs/i);
  assert.match(exportsRoute,/buildXlsxWorkbook/);
  assert.match(exportsRoute,/XLSX_EXPORT_LIMIT_EXCEEDED/);
  assert.match(writer,/deflateRawSync/);
  assert.match(writer,/t="inlineStr"/);
  assert.match(writer,/maxTotalCells/);
});

test('service worker cannot serve stale javascript or css ahead of the deployed network bundle',()=>{
  const sw=read('frontend','public','sw.js');
  assert.match(sw,/contagest-ve-v11-16-2/);
  assert.match(sw,/request\.destination === 'script' \|\| request\.destination === 'style'/);
  assert.match(sw,/event\.respondWith\(networkFirst\(request\)\)/);
  assert.match(sw,/fetch\(request, \{ cache:'no-store' \}\)/);
});
