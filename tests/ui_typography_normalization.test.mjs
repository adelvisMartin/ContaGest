import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const runtimeEntry = read('frontend/src/styles/erp-runtime.css');
const compatibilityEntry = read('frontend/src/styles/compact-enterprise-v1110.css');
const css = read('frontend/src/styles/ui-normalization-v142.css');

test('cross-module normalization is loaded last by the actual runtime entrypoint', () => {
  const systemIndex = runtimeEntry.indexOf("@import './erp-system.css';");
  const normalizationIndex = runtimeEntry.indexOf("@import './ui-normalization-v142.css';");
  assert.ok(systemIndex >= 0, 'canonical ERP stylesheet import is required');
  assert.ok(normalizationIndex > systemIndex, 'normalization must load after the canonical ERP stylesheet');
  assert.equal(runtimeEntry.trim().split('\n').at(-1), "@import './ui-normalization-v142.css';", 'normalization must remain the final runtime import');
});

test('legacy compatibility entrypoint also receives the same normalization contract', () => {
  assert.match(compatibilityEntry, /@import '\.\/ui-normalization-v142\.css';/);
});

test('shared KPI cards explicitly remove decorative pseudo-element circles', () => {
  for (const selector of ['.cgx-metric', '.kpi', '.pl-kpi', '.ds-kpi', '.cgv-kpi', '.admin-metric', '.cg-vertical-kpis article']) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /::before[\s\S]*::after/);
  assert.match(css, /content:\s*none\s*!important/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /background-image:\s*none\s*!important/);
});

test('financial KPI values share a compact non-wrapping numeric scale', () => {
  assert.match(css, /--cg-type-kpi:\s*clamp\(/);
  assert.match(css, /font-size:\s*var\(--cg-type-kpi\)\s*!important/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums lining-nums/);
  assert.match(css, /white-space:\s*nowrap\s*!important/);
  assert.match(css, /text-overflow:\s*ellipsis\s*!important/);
  assert.match(css, /word-break:\s*normal\s*!important/);
});

test('legacy first KPI dark pill no longer overrides the shared numeric hierarchy', () => {
  assert.match(css, /former first-KPI dark pill/i);
  assert.match(css, /#kpiTotal/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.match(css, /padding:\s*0\s*!important/);
});

test('page, section, table and KPI typography use common tokens', () => {
  for (const token of [
    '--cg-type-caption',
    '--cg-type-label',
    '--cg-type-body',
    '--cg-type-section',
    '--cg-type-page',
    '--cg-type-kpi'
  ]) {
    assert.ok(css.includes(token), `missing typography token ${token}`);
  }
  assert.match(css, /\.cgx-page-header h1/);
  assert.match(css, /\.cgx-section-head h2/);
  assert.match(css, /\.cgx-table th/);
  assert.match(css, /\.cgx-table td/);
});
