import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('61/75 covers the canonical 60-route catalog with the complete viewport/theme matrix',()=>{
  const spec=read('qa/erp-visual-overlap-v6175.spec.mjs');
  assert.match(spec,/MODULE_VISUAL_CATALOG/);
  assert.equal(MODULE_VISUAL_CATALOG.length,60,'shared visual route catalog must have 60 entries');
  assert.equal(new Set(MODULE_VISUAL_CATALOG.map(item=>item.route)).size,60,'duplicate route would drop sharded coverage');
  assert.match(spec,/for\(const item of MODULE_VISUAL_CATALOG\)/);
  for(const token of ['360','390','430','768','1366','1920','light','dark','LONG_TEXT','200%-reflow-proxy'])assert.ok(spec.includes(token),token);
});

test('61/75 preserves overlap focus dialog and touch checks without fixed sleeps',()=>{
  const helper=read('qa/support/anti-overlap-audit.mjs');
  const spec=read('qa/erp-visual-overlap-v6175.spec.mjs');
  for(const token of ['document-overflow','outside-viewport','occluded-center','touch-height','focus-clipped','dialog-clipped'])assert.ok(helper.includes(token),token);
  assert.doesNotMatch(spec,/waitForTimeout|new Promise\([^\n]*setTimeout/);
  assert.match(spec,/data-rendered-route/);
  assert.match(spec,/waitForFunction/);
});

test('61/75 sharded grep matches actual 60-route Playwright test titles',()=>{
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  const spec=read('qa/erp-visual-overlap-v6175.spec.mjs');
  assert.match(runner,/61\/75 anti-overlap shard/);
  assert.match(runner,/qa\/erp-visual-overlap-v6175\.spec\.mjs/);
  assert.match(runner,/MODULE_VISUAL_CATALOG\.length!==60/);
  const match=runner.match(/runGroup\('61\/75 anti-overlap shard[^]*?'qa\/erp-visual-overlap-v6175\.spec\.mjs','--grep',routePattern\+'([^']+)'/);
  assert.ok(match,'runner must select the intended visual spec using a route-qualified grep');
  const suffix=match[1];
  assert.equal(suffix,' · full anti-overlap 60-route matrix');
  assert.ok(spec.includes('${item.route}'+suffix),
    'Playwright test title and sharded grep must be identical; otherwise zero visual tests run');
});

test('61/75 workflow watches its spec helper and contract',()=>{
  const workflow=read('.github/workflows/erp-ui-58x5-v251.yml');
  for(const path of ['qa/erp-visual-overlap-v6175.spec.mjs','qa/support/anti-overlap-audit.mjs','tests/full_58_route_anti_overlap_61_75.test.mjs'])assert.ok(workflow.includes(path),path);
});
