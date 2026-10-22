import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
// v4 CSS is a reviewed, ordered stack: app entrypoint, generated tokens and
// locally imported compatibility/component/convergence layers.
const canonicalCss = [
  'app.css',
  'platform-tokens-v1.css',
  'ui-system-v3-compat.css',
  'ui-system-v4.css',
  'ui-system-v4-convergence.css'
];
const css=canonicalCss.map(name => readFileSync(resolve(root,'frontend/public/hipico-control/assets/css',name),'utf8')).join('\n');
const ui=readFileSync(resolve(root,'frontend/public/hipico-control/assets/js/ui.js'),'utf8');
const app=readFileSync(resolve(root,'frontend/public/hipico-control/assets/js/app.js'),'utf8');
const guide=readFileSync(resolve(root,'frontend/public/hipico-control/STYLE-GUIDE.md'),'utf8');

test('Editorial Race Control stays inside the canonical Hípico UI authorities',()=>{
  assert.match(guide,/ordered multi-file CSS architecture/i);
  assert.match(guide,/All views reuse the same Button, IconButton/i);
  assert.match(guide,/assets\/css\/app\.css/);
  // Semantic tokens, not a frozen dark-only legacy hex palette, own colors.
  assert.match(css,/--hc-bg/);
  assert.match(css,/--hc-surface/);
  assert.match(css,/:root\[data-theme="dark"\]/);
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
