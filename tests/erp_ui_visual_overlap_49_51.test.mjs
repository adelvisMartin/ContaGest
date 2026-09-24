import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('49/51 owns the full anti-overlap viewport matrix',()=>{
  const source=read('qa/erp-visual-overlap-v4951.spec.mjs');
  for(const token of ['360','390','430','768','1366','1920','light','dark',"200%-reflow-proxy",'effectiveZoomWidth','LONG_TEXT']) assert.ok(source.includes(token),token);
});

test('49/51 audits overflow clipping occlusion touch targets keyboard focus and dialogs',()=>{
  const source=read('qa/erp-visual-overlap-v4951.spec.mjs');
  for(const token of ['document-overflow','outside-viewport','occluded-center','touch-height','focus-clipped','dialog-clipped','MuiTabs-scroller','[role="tablist"]',"keyboard.press('Tab')","keyboard.press('Escape')"]) assert.ok(source.includes(token),token);
});

test('49/51 is wired into the canonical 58x5 browser runner',()=>{
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  assert.match(runner,/49\/51 anti-overlap visual matrix/);
  assert.match(runner,/qa\/erp-visual-overlap-v4951\.spec\.mjs/);
});

test('49/51 workflow observes spec and contract changes',()=>{
  const workflow=read('.github/workflows/erp-ui-58x5-v251.yml');
  assert.ok(workflow.includes("qa/erp-visual-overlap-v4951.spec.mjs"));
  assert.ok(workflow.includes("tests/erp_ui_visual_overlap_49_51.test.mjs"));
});


test('49/51 waits for canonical migrated React owners instead of the retired standard wrapper',()=>{
  const source=read('qa/erp-visual-overlap-v4951.spec.mjs');
  for(const selector of ['#dentistryReactRoot .cg-dentistry-workspace','#veterinaryUnifiedRoot .cg-vet-dossier','#gymReactRoot .cg-gym-page']) assert.ok(source.includes(selector),selector);
  assert.doesNotMatch(source,/#pages \.cgx-module-standard/);
  assert.match(source,/ROUTE_READY_SELECTOR\[route\]/);
});
