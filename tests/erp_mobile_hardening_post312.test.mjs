import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ErpUi } from '../frontend/src/components/ui/erp.js';

const css = readFileSync(new URL('../frontend/src/styles/erp-runtime.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/app.js', import.meta.url), 'utf8');

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

test('mobile drawer open state wins over collapsed hiding and survives same-route rerenders', () => {
  const collapsedSelector = 'body .hf-app-sidebar.hf-sidebar.is-collapsed';
  const openSelector = 'body.cg-menu-open .hf-app-sidebar.hf-sidebar';
  const collapsedIndex = css.indexOf(collapsedSelector);
  const openIndex = css.indexOf(openSelector);

  assert.ok(collapsedIndex >= 0, 'collapsed mobile sidebar rule must exist');
  assert.ok(openIndex > collapsedIndex, 'open mobile sidebar rule must follow collapsed rule so equal-specificity cascade reopens it');
  assert.match(css.slice(collapsedIndex, openIndex), /visibility:hidden;[\s\S]*pointer-events:none;/);
  assert.match(css.slice(openIndex), /visibility:visible;[\s\S]*pointer-events:auto;/);
  assert.match(app, /preserveMobileOpen=mobile\(\)&&document\.body\.classList\.contains\('cg-menu-open'\)&&renderedRoute===currentRoute/);
});
