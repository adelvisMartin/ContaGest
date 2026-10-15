import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('63/75 keeps Chromium as the canonical pull-request browser authority',()=>{
  const workflow=read('.github/workflows/erp-ui-58x5-v251.yml');
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/Install Chromium/);
  assert.match(runner,/--project=chromium/);
  assert.match(runner,/MODULE_VISUAL_CATALOG\.length!==60/);
  assert.equal(MODULE_VISUAL_CATALOG.length,60);
  assert.equal(new Set(MODULE_VISUAL_CATALOG.map(item=>item.route)).size,60);
});

test('63/75 Firefox and WebKit cover critical plus health/fitness routes on pull requests',()=>{
  const workflow=read('.github/workflows/erp-cross-browser-v6375.yml');
  const runner=read('scripts/erp-cross-browser-v6375.mjs');
  assert.match(workflow,/project: firefox[\s\S]*engine: firefox/);
  assert.match(workflow,/project: webkit-safari[\s\S]*engine: webkit/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/CG_CROSS_BROWSER_SCOPE:[\s\S]*critical/);
  assert.match(runner,/CRITICAL_VISUAL_ROUTES/);
  assert.match(runner,/\['health','fitness'\]/);
  assert.match(runner,/qa\/exhaustive-route-v164\.spec\.mjs/);
});

test('63/75 nightly scope expands Firefox and WebKit to all 60 canonical routes',()=>{
  const workflow=read('.github/workflows/erp-cross-browser-v6375.yml');
  const runner=read('scripts/erp-cross-browser-v6375.mjs');
  assert.match(workflow,/schedule:[\s\S]*cron:/);
  assert.match(workflow,/github\.event_name == 'schedule' && 'full'/);
  assert.match(runner,/scope==='full'\?MODULE_VISUAL_CATALOG\.map/);
  assert.match(runner,/MODULE_VISUAL_CATALOG\.length!==60/);
});

test('63/75 compatibility evidence is exact-SHA, deterministic and fail-closed',()=>{
  const workflow=read('.github/workflows/erp-cross-browser-v6375.yml');
  const runner=read('scripts/erp-cross-browser-v6375.mjs');
  assert.match(workflow,/CANDIDATE_SHA/);
  assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$CANDIDATE_SHA"/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
  assert.doesNotMatch(runner,/--project=chromium/);
  assert.doesNotMatch(runner,/waitForTimeout|--grep-invert|\.skip\(|\.only\(/);
});
