import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

test('router rejects stale async page commits and tracks rendered route identity',()=>{
  const app=read('frontend','src','app.js');
  assert.match(app,/renderGeneration/);
  assert.match(app,/renderSnapshotMatches/);
  assert.match(app,/navigation\?\.revision/);
  assert.match(app,/if\(!renderSnapshotMatches\(state,requested,generation\)\)\{pending=true;return;\}/);
  assert.match(app,/data-rendered-route/);
  assert.match(app,/if\(pending\)\{pending=false;queueMicrotask\(\(\)=>render\(\{force:true\}\)/);
});

test('MUI custom navigation events bridge to the canonical URL navigation service',()=>{
  const app=read('frontend','src','app.js');
  assert.match(app,/window\.addEventListener\('cg:navigate'/);
  assert.match(app,/navigate\(route,event\.detail\?\.params\|\|\{\},event\.detail\?\.options\|\|\{\}\)/);
});

test('canonical forms are not implicitly remounted as a second MUI layer',()=>{
  const mui=read('frontend','src','components','muiRuntime.js');
  const mountAll=mui.slice(mui.indexOf('export const MuiRuntime='));
  assert.doesNotMatch(mountAll,/mountNativeFields\(ctx\)/);
  assert.match(mountAll,/data-mui-select-field/);
  assert.match(mountAll,/data-mui-breadcrumbs/);
});

test('mobile shell removes sidebar counts and prevents icon label compression',()=>{
  const shell=read('frontend','src','styles','shell-contract.css');
  assert.match(shell,/\.hf-area-meta small \{ display:none!important; \}/);
  assert.match(shell,/#btnCloseSidebar/);
  assert.match(shell,/#btnWhatsappSupport/);
  assert.match(shell,/Icon and text are separate flex items/);
  assert.match(shell,/\.cg-gym-v1124-tabs/);
  assert.match(shell,/min-width:max-content!important/);
});

test('dark compatibility buttons inherit high contrast foreground and icons inherit currentColor',()=>{
  const primitives=read('frontend','src','styles','runtime-primitives-v13.css');
  assert.match(primitives,/html\.dark :where\(\.btn-primary[\s\S]*color:var\(--cg-v-bg\) !important/);
  assert.match(primitives,/html\.dark :where\(\.btn-secondary[\s\S]*color:var\(--cg-v-text\)!important/);
  assert.match(primitives,/>:where\(i,svg\) \{ flex:0 0 auto; color:currentColor!important; \}/);
});

test('React Doctor current workflow and project skill are wired into QA',()=>{
  const pkg=JSON.parse(read('package.json'));
  const skill=read('.agents','skills','react-doctor','SKILL.md');
  const agents=read('AGENTS.md');
  assert.equal(pkg.scripts['doctor:changed'],'npx --yes react-doctor@latest --verbose --scope changed');
  assert.equal(pkg.scripts['doctor:design'],'npx --yes react-doctor@latest design --verbose');
  assert.equal(pkg.scripts['doctor:install-skill'],'npx --yes react-doctor@latest install');
  assert.match(pkg.scripts['qa:ui:58'],/doctor:changed/);
  assert.match(pkg.scripts['qa:ui:58'],/test:browser:58/);
  assert.match(skill,/version: 1\.2\.0/);
  assert.match(agents,/58 independent iterations/);
});

test('exhaustive browser audit defines one Playwright test per registered route and six contexts',()=>{
  const spec=read('qa','exhaustive-route-v164.spec.mjs');
  const transitions=read('qa','route-transition-v164.spec.mjs');
  assert.match(spec,/for\(const item of MODULE_VISUAL_CATALOG\)/);
  assert.match(spec,/desktop-light/);
  assert.match(spec,/desktop-dark/);
  assert.match(spec,/mobile-light/);
  assert.match(spec,/mobile-dark/);
  assert.match(spec,/mobile-edge-360-dark/);
  assert.match(spec,/tablet-768-dark/);
  assert.match(spec,/icon-text-overlap/);
  assert.match(spec,/double-form-layer/);
  assert.match(spec,/button-contrast/);
  assert.match(spec,/clipped-operational-text/);
  assert.match(transitions,/rapid navigation cannot let an older async page overwrite the final route/);
  assert.match(transitions,/data-rendered-route/);
});
