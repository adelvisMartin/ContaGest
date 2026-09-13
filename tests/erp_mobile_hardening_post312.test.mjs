import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ErpUi } from '../frontend/src/components/ui/erp.js';

const css = readFileSync(new URL('../frontend/src/styles/erp-runtime.css', import.meta.url), 'utf8');

test('ERP data-table primitive emits the canonical responsive wrapper aliases', () => {
  const html = ErpUi.table({
    columns: [{ key: 'name', label: 'Nombre' }],
    rows: [{ name: 'Ada' }],
    caption: 'Personas'
  });
  assert.match(html, /class="cg-ui-table-wrap cgx-table-wrap table-wrap cgx-table-normalized"/);
  assert.match(html, /<caption class="sr-only">Personas<\/caption>/);
  assert.match(html, /<th scope="col">Nombre<\/th>/);
  assert.match(html, /<td>Ada<\/td>/);
});

test('mobile runtime keeps tables contained and form controls touch-safe without global overflow hacks', () => {
  assert.match(css, /#pages \.cgx-table-wrap[\s\S]*overflow-x:auto/);
  assert.match(css, /@media \(max-width:767px\)[\s\S]*min-height:44px/);
  assert.match(css, /#pages input:not\(\[type="checkbox"\]\)[\s\S]*font-size:16px/);
  assert.match(css, /body \.hf-app-sidebar\.hf-sidebar\.is-collapsed[\s\S]*pointer-events:none/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/i);
});
