import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ERP_E2E_REQUIRED_ASSERTIONS_V155, ERP_E2E_VIEWPORTS_V155 } from '../qa/support/erp-e2e-matrix-v155.mjs';
import { ERP_MOBILE_MIGRATION_V181 } from '../qa/support/erp-mobile-migration-v181.mjs';
import { fixtureForRequest } from '../qa/support/erp-system-fixtures-v155.mjs';

const campaign=()=>fs.readFileSync('qa/erp-system-campaign-v155.spec.mjs','utf8');
const workflow=()=>fs.readFileSync('.github/workflows/erp-system-qa-campaign-v155.yml','utf8');

test('49/51 keeps the exact anti-overlap viewport matrix including 1920 desktop',()=>{
  assert.deepEqual(
    ERP_E2E_VIEWPORTS_V155.filter((item)=>!item.name.includes('landscape')).map(({width,height})=>[width,height]),
    [[360,800],[390,844],[430,932],[768,1024],[1366,768],[1920,1080]]
  );
  assert.ok(ERP_MOBILE_MIGRATION_V181.every((item)=>[360,390,430].every((width)=>item.requiredViewports.includes(width))));
});

test('49/51 long synthetic boundary data remains part of the canonical fixture campaign',()=>{
  const fixture=fixtureForRequest({url:'http://qa.local/api/v1/clients',state:'boundary'});
  assert.match(JSON.stringify(fixture.body),/QA-LARGO-ÁÉÍÓÚ-漢字/);
});

test('49/51 campaign checks keyboard, themes, 200 percent zoom, clipping, occlusion, dialogs and touch targets',()=>{
  const source=campaign();
  for(const token of [
    'keyboard-focus',
    'auditThemeModes',
    "['light','dark']",
    'auditZoom200',
    "style.zoom='2'",
    'CLIPPED_OPERATIONAL_TEXT',
    'INTERACTIVE_OCCLUDED',
    'DIALOG_OUTSIDE_VIEWPORT',
    'DIALOG_HORIZONTAL_OVERFLOW',
    'TOUCH_TARGET_UNDERSIZED',
    'MOBILE_INPUT_FONT_LT_16'
  ]) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/ZOOM_125_HORIZONTAL_OVERFLOW/);
});

test('49/51 canonical assertions fail closed on every requested visual risk',()=>{
  for(const assertion of [
    'long-data-boundary-layout',
    'keyboard-focus-observable',
    'light-dark-layout',
    'zoom-200-layout',
    'dialog-within-viewport',
    'no-interactive-occlusion',
    'touch-targets-mobile'
  ]) assert.ok(ERP_E2E_REQUIRED_ASSERTIONS_V155.includes(assertion),assertion);
});

test('49/51 visual branch executes the existing #155 campaign instead of creating a parallel workflow',()=>{
  const source=workflow();
  assert.match(source,/test\/erp-visual-matrix-/);
  assert.match(source,/qa\/erp-system-campaign-v155\.spec\.mjs/);
  assert.match(source,/qa\/erp-mobile-58-v181\.spec\.mjs|test:browser:58/);
});
