import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const css=readFileSync(resolve(root,'frontend/public/hipico-control/assets/css/app.css'),'utf8');
const ui=readFileSync(resolve(root,'frontend/public/hipico-control/assets/js/ui.js'),'utf8');
const app=readFileSync(resolve(root,'frontend/public/hipico-control/assets/js/app.js'),'utf8');
const guide=readFileSync(resolve(root,'frontend/public/hipico-control/STYLE-GUIDE.md'),'utf8');

test('Editorial Race Control stays inside the canonical Hípico UI authorities',()=>{
  assert.match(guide,/assets\/css\/app\.css.*única hoja CSS global/s);
  assert.match(guide,/assets\/js\/ui\.js.*única biblioteca de primitivas/s);
  assert.match(css,/--hc-bg:\s*#0f1012/);
  assert.match(css,/--hc-surface:\s*#17181b/);
  assert.match(css,/\.more-dashboard\s*\{/);
  assert.match(css,/\.filter-grid\s*\{[^}]*align-items:\s*end/s);
  assert.match(css,/\.filter-grid \.date-button small\s*\{\s*display:\s*none/s);
});

test('native history selects are progressively enhanced to an accessible themed listbox',()=>{
  assert.match(app,/select class="select" name="participant"/);
  assert.match(ui,/select\.select:not\(\[data-ui-select-enhanced\]\)/);
  assert.match(ui,/setAttribute\('role', 'listbox'\)/);
  assert.match(ui,/setAttribute\('role', 'option'\)/);
  assert.match(ui,/event\.key === 'ArrowDown'/);
  assert.match(ui,/event\.key === 'Escape'/);
  assert.match(ui,/typeahead/);
  assert.match(css,/\.select-popover\s*\{/);
  assert.match(css,/\.select-option\.is-selected/);
});

test('race header exposes a fast context change without mutating historical race records in place',()=>{
  assert.match(ui,/dataset\.uiRaceChange = 'true'/);
  assert.match(ui,/button\.dataset\.action = 'new-race'/);
  assert.match(ui,/Cambiar carrera/);
  assert.doesNotMatch(ui,/data-action=['"]edit-race['"]/);
});
