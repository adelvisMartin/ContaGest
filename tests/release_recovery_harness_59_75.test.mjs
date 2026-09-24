import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('59/75 visual strict keeps unbound forms visible but delegates their failure ownership',()=>{
  const source=read('scripts/visual-system-audit.mjs');
  assert.match(source,/item\.code !== 'unbound-form'/);
  assert.match(source,/if \(strict && \(structural > 0 \|\| pageCritical > 0\)\)/);
  const gate=read('scripts/visual-source-gate-v16.mjs');
  assert.match(gate,/if\(finding\.code==='unbound-form'\)continue/);
});

test('59/75 real persistence test owns its restricted-user fixture',()=>{
  const source=read('qa/postmerge-backend-persistence-v17.test.ts');
  assert.match(source,/prisma\.userProfile\.upsert/);
  assert.match(source,/QA Restricted User/);
  assert.match(source,/t\.after\(async\(\)=>/);
  assert.doesNotMatch(source,/Temporary QA user .* not found/);
});

test('59/75 browser preqa verifies the serverless Chromium executable by launching it',()=>{
  const source=read('scripts/vercel-browser-preqa-v16.mjs');
  assert.match(source,/chromium as playwrightChromium/);
  assert.match(source,/playwrightChromium\.launch/);
  assert.match(source,/await browser\.close\(\)/);
  assert.match(source,/launchVerified:true/);
  assert.match(source,/Chromium serverless no superó el smoke launch real/);
  assert.doesNotMatch(source,/Capa AL2023 no activa/);
});

test('59/75 root browser QA entrypoints are explicit and executable',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:browser:functional'],'npx playwright test qa/erp-functional-smoke-v14.spec.mjs qa/module-actions-runtime-v163.spec.mjs --project=chromium --workers=1');
  assert.match(pkg.scripts['test:browser'],/test:browser:58/);
  assert.match(pkg.scripts['test:browser'],/test:browser:functional/);
  assert.match(pkg.scripts['test:browser'],/test:browser:a11y/);
  assert.match(pkg.scripts['test:browser'],/test:browser:contrast/);
});


test('59/75 visual matrix never clicks a disabled dialog trigger',()=>{
  const source=read('qa/erp-visual-overlap-v4951.spec.mjs');
  assert.match(source,/isEnabled\(\)/);
  assert.match(source,/if\(!trigger\)return \[\]/);
  assert.doesNotMatch(source,/getByRole\('button',[\s\S]{0,120}\.first\(\)/);
});

test('59/75 veterinary financial panel remains valid JSX',()=>{
  const source=read('frontend/src/components/veterinary/VeterinaryFinancialPanel.jsx');
  assert.doesNotMatch(source,/\bgap=\.\d/);
  assert.match(source,/gap=\{\.5\}/);
});

test('59/75 fitness root contains mobile width and horizontally scrollable tabs',()=>{
  const source=read('frontend/src/pages/GymManagementPage.jsx');
  assert.match(source,/cg-vertical-page cg-gym-page[\s\S]{0,180}minWidth:0/);
  assert.match(source,/overflowX:'hidden'/);
  assert.match(source,/cg-gym-v1124-tabs/);
  assert.match(source,/flexWrap="wrap"/);
  assert.match(source,/xs:'minmax\(0,1fr\)'/);
});
