import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const settings=read('frontend/src/pages/SettingsPage.js');
const login=read('frontend/src/pages/LoginPage.js');
const runtime=read('frontend/src/styles/erp-runtime.css');
const visual=read('frontend/src/styles/contagest-visual-system-v12.css');

test('settings route uses canonical sections and button-based navigation',()=>{
  for(const token of ['settings-navigation','cgx-section-head','cgx-section-body','cg-record-fields','cgx-dashboard-grid','cgx-module-standard']){
    assert.ok(settings.includes(token),`settings must use ${token}`);
  }
  assert.match(settings,/settingsNavButton/);
  assert.match(settings,/data-settings-jump/);
  assert.match(settings,/aria-current="page"/);
  assert.doesNotMatch(settings,/class="surface settings-sidebar"/);
  assert.doesNotMatch(settings,/<nav><button type="button" data-settings-jump=/);
});

test('settings keeps backend and persistence workflows intact',()=>{
  assert.match(settings,/mountSubmit\('#settingsForm'/);
  assert.match(settings,/DataSyncService\.health/);
  assert.match(settings,/DataSyncService\.pushAll/);
  assert.match(settings,/DataSyncService\.pullAll/);
  assert.match(settings,/Store\.reset\(\)/);
  assert.match(settings,/companyLogoDataUrl/);
});

test('canonical buttons have visible non-hover variant backgrounds',()=>{
  assert.match(visual,/body \.cgx-btn,body :where\(\.btn/);
  assert.match(runtime,/body \.cgx-btn\.cgx-btn-primary[\s\S]*background:var\(--cg-v-brand\)!important/);
  assert.match(runtime,/body \.cgx-btn\.cgx-btn-primary:hover[\s\S]*background:var\(--cg-v-brand-hover\)!important/);
  assert.match(runtime,/body \.cgx-btn\.cgx-btn-secondary[\s\S]*background:var\(--cg-v-surface\)!important/);
  assert.match(runtime,/body \.cgx-btn\.cgx-btn-danger[\s\S]*background:var\(--cg-v-danger-soft\)!important/);
});

test('login submit uses the shared primary style without a page-level color override',()=>{
  assert.match(login,/className:'w-full login-submit'/);
  assert.doesNotMatch(login,/login-submit[^\n]*style=/);
  assert.doesNotMatch(login,/color:var\(--cg-v-bg\)!important/);
  assert.match(login,/AuthService\.login/);
  assert.match(login,/AuthService\.completeCoordinateLogin/);
});
