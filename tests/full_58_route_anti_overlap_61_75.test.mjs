import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('61/75 covers the canonical 58-route catalog with the complete viewport/theme matrix',()=>{
  const spec=read('qa/erp-visual-overlap-v6175.spec.mjs');
  assert.match(spec,/MODULE_VISUAL_CATALOG/);
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

test('61/75 runs sharded under the canonical 58x5 browser runner',()=>{
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  assert.match(runner,/61\/75 anti-overlap shard/);
  assert.match(runner,/qa\/erp-visual-overlap-v6175\.spec\.mjs/);
  assert.match(runner,/full anti-overlap 58-route matrix/);
});

test('61/75 workflow watches its spec helper and contract',()=>{
  const workflow=read('.github/workflows/erp-ui-58x5-v251.yml');
  for(const path of ['qa/erp-visual-overlap-v6175.spec.mjs','qa/support/anti-overlap-audit.mjs','tests/full_58_route_anti_overlap_61_75.test.mjs'])assert.ok(workflow.includes(path),path);
});
