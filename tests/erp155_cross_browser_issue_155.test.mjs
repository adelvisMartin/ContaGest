import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config=fs.readFileSync(new URL('../playwright.config.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/erp-system-qa-campaign-v155.yml',import.meta.url),'utf8');

test('Playwright declares Chromium Firefox and WebKit engines for release QA',()=>{
  assert.match(config,/name:\s*'chromium'/);
  assert.match(config,/name:\s*'firefox'/);
  assert.match(config,/Desktop Firefox/);
  assert.match(config,/name:\s*'webkit-safari'/);
});

test('ERP #155 runs the full role viewport matrix on Firefox and WebKit without polluting canonical Chromium aggregation',()=>{
  assert.match(workflow,/cross-browser-matrix:/);
  assert.match(workflow,/project:\s*firefox[\s\S]*engine:\s*firefox/);
  assert.match(workflow,/project:\s*webkit-safari[\s\S]*engine:\s*webkit/);
  assert.match(workflow,/role:\s*\[admin, operator, read-only\]/);
  for(const viewport of ['phone-360','phone-390','phone-430','tablet-768','desktop-1366','desktop-1920','phone-360-landscape','phone-390-landscape','phone-430-landscape']){
    assert.match(workflow,new RegExp(`- ${viewport.replaceAll('-','\\-')}`));
  }
  assert.match(workflow,/playwright install --with-deps \$\{\{ matrix\.browser\.engine \}\}/);
  assert.match(workflow,/--project=\$\{\{ matrix\.browser\.project \}\}/);
  assert.match(workflow,/crossbrowser155-\$\{\{ matrix\.browser\.project \}\}/);
  assert.match(workflow,/needs:\s*\[contract, browser-matrix, cross-browser-matrix, regression-pack\]/);
  assert.match(workflow,/needs\.cross-browser-matrix\.result/);
  assert.match(workflow,/pattern:\s*erp155-\*/);
});

test('CAPTCHA #221 responsive browser regression is required on all three engines',()=>{
  assert.match(workflow,/Install Chromium Firefox and WebKit/);
  assert.match(workflow,/--project=chromium/);
  assert.match(workflow,/--project=firefox/);
  assert.match(workflow,/--project=webkit-safari/);
});
