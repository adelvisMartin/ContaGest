import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../frontend/public/hipico-control/', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');
const htmlStylesheets = ['./assets/css/app.css', './assets/css/platform-tokens-v1.css'];
const importedStylesheets = [
  './assets/css/ui-system-v3-compat.css',
  './assets/css/ui-system-v4.css',
  './assets/css/ui-system-v4-convergence.css'
];
const removedLayers = [
  'styles.css', 'ui-system.css', 'tokens.css', 'themes.css', 'components.css',
  'operations-pro.css', 'precision-hipica.css', 'offline-icons.css', 'recovery.css', 'ui-system-v2.css',
  'mobile-accessibility.css', 'operational-copy-center.css', 'operational-access-guard.css'
];

async function canonicalCss() {
  const files = [...htmlStylesheets, ...importedStylesheets];
  const modules = await Promise.all(files.map((file) => read(file.replace('./', ''))));
  return modules.join('\n');
}

test('hipico loads only reviewed v4 entrypoint and platform token authority', async () => {
  const index = await read('index.html');
  const stylesheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(stylesheets, htmlStylesheets);
  for (const href of [...htmlStylesheets, ...importedStylesheets]) {
    await access(new URL(href.replace('./', ''), root));
  }
  const entry = await read('assets/css/app.css');
  assert.match(entry, /@layer legacy;/);
  const imports = [...entry.matchAll(/@import\s+url\("([^"]+)"\)(?:\s+layer\(legacy\))?;/g)].map((match) => './assets/css/' + match[1].replace('./', ''));
  assert.deepEqual(imports, importedStylesheets);
  assert.match(entry, /ui-system-v3-compat\.css"\)\s+layer\(legacy\)/);
  assert.doesNotMatch(index, /rel="stylesheet"[^>]+href="https?:\/\//);
  for (const name of removedLayers) {
    assert.equal(index.includes(name), false, name + ' must not be loaded');
    await assert.rejects(access(new URL('assets/css/' + name, root)));
  }
});

test('canonical v4 CSS stack owns semantic colors, shape, touch and theme contracts', async () => {
  const css = await canonicalCss();
  for (const token of [
    '--hc-bg', '--hc-surface', '--hc-border', '--hc-text', '--hc-brand',
    '--hc-success', '--hc-warning', '--hc-danger', '--hc-info', '--hc-focus',
    '--hc-radius-md', '--hc-shadow-md', '--hc-safe-bottom', '--hc-nav-height',
    '--hc-header-height', '--hc-touch'
  ]) assert.ok(css.includes(token), 'missing canonical token ' + token);
  assert.match(css, /--hc-touch:\s*44px/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /@media \(prefers-color-scheme:\s*dark\)/);
});

test('canonical v4 primitives retain focus, semantic states and responsive behavior', async () => {
  const css = await canonicalCss();
  for (const selector of ['.button', '.icon-button', '.input', '.select', '.modal', '.tabs', '.badge', '.summary-table', '.list', '.kpi', '.ui-state', '.toast']) {
    assert.ok(css.includes(selector), 'missing primitive ' + selector);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.notice--success/);
  assert.match(css, /\.notice--warning/);
  assert.match(css, /\.kpi--danger/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width:\s*470px\)/);
  assert.match(css, /@media \(max-width:\s*780px\)/);
});

test('canonical CSS retains mobile accessibility without a parallel visual owner', async () => {
  const css = await canonicalCss();
  assert.match(css, /@media \(max-width:\s*900px\),\s*\(pointer:\s*coarse\)/);
  assert.match(css, /min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.ops-root\[data-ops-authorized="true"\]/);
});

test('style guide documents v4 CSS ownership and accessible PWA/APK QA', async () => {
  const guide = await read('STYLE-GUIDE.md');
  assert.match(guide, /ordered multi-file CSS architecture/i);
  assert.match(guide, /assets\/css\/app\.css/);
  assert.match(guide, /platform-tokens-v1\.css/);
  assert.match(guide, /ui-system-v4-convergence\.css/);
  assert.match(guide, /do not create a local cloned/i);
  assert.match(guide, /PWA/i);
  assert.match(guide, /Android|APK/i);
  assert.match(guide, /44\s*px/i);
  assert.match(guide, /reduced[- ]motion/i);
  for (const width of ['360', '390', '430', '768', '1024', '1440']) assert.match(guide, new RegExp(width));
});
