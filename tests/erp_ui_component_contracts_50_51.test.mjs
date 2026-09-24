import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('50/51 canonical Cg primitives keep accessible component contracts',()=>{
  const source=read('frontend/src/components/ui/cg/CgPrimitives.jsx');
  for(const token of [
    'export function CgPageHeader',
    'export function CgButton',
    'export function CgIconButton',
    'export function CgTextField',
    'export function CgSelect',
    'export function CgDialog',
    'export function CgDataTable',
    'export function CgEmptyState',
    'export function CgState'
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/CgIconButton requires an accessible label/);
  assert.match(source,/CgTextField requires a persistent label/);
  assert.match(source,/CgSelect requires a persistent label/);
  assert.match(source,/CgDialog requires an accessible title/);
  assert.match(source,/aria-labelledby=\{titleId\}/);
  assert.match(source,/scope="col"/);
});

test('50/51 canonical TextField boundary normalizes removed MUI v9 props into slotProps',()=>{
  const source=read('frontend/src/components/ui/cg/CgPrimitives.jsx');
  for(const token of ['normalizeTextFieldSlots','mergeSlotProp','slotProps={normalizedSlotProps}','htmlInput','formHelperText']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/<TextField[^>]*\binputProps=/);
  assert.match(source,/sx=\{\{ gap: 2, justifyContent: 'space-between'/);
});

test('50/51 focus and reduced-motion remain globally owned by the visual system',()=>{
  const css=read('frontend/src/styles/contagest-visual-system-v12.css');
  assert.match(css,/:focus-visible\s*\{/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/animation-duration:\.01ms!important/);
  assert.match(css,/transition-duration:\.01ms!important/);
});

test('50/51 migrated Wave A owners do not recreate local Cg component implementations',()=>{
  const files=[
    'frontend/src/pages/DentistryPracticePage.jsx',
    'frontend/src/pages/VeterinaryClinicPageV1123.jsx',
    'frontend/src/pages/GymManagementPage.jsx'
  ];
  const localClone=/function\s+(CgPageHeader|CgButton|CgIconButton|CgTextField|CgSelect|CgDialog|CgDataTable|CgEmptyState|CgState)\b|const\s+(CgPageHeader|CgButton|CgIconButton|CgTextField|CgSelect|CgDialog|CgDataTable|CgEmptyState|CgState)\s*=/;
  for(const file of files){
    const source=read(file);
    assert.doesNotMatch(source,localClone,file);
  }
});

test('50/51 canonical state components cover loading error and empty semantics without local duplicate APIs',()=>{
  const source=read('frontend/src/components/ui/cg/CgPrimitives.jsx');
  assert.match(source,/export function CgEmptyState/);
  assert.match(source,/export function CgState/);
  assert.match(source,/severity = 'info'/);
  assert.match(source,/No hay registros representativos para esta vista/);
});

test('50/51 browser contract is wired into the canonical 58x5 runner and workflow',()=>{
  const runner=read('scripts/erp-browser-58x5-v251.mjs');
  const workflow=read('.github/workflows/erp-ui-58x5-v251.yml');
  assert.match(runner,/50\/51 reusable component contracts/);
  assert.match(runner,/qa\/erp-component-contracts-v5051\.spec\.mjs/);
  assert.ok(workflow.includes("tests/erp_ui_component_contracts_50_51.test.mjs"));
});
