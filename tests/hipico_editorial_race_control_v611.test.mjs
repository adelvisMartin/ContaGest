import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const uiPath = `${root}/assets/js/ui.js`;
const appPath = `${root}/assets/js/app.js`;
const cssPath = `${root}/assets/css/app.css`;

function themeBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'))?.[1] || '';
}

test('history native selects are progressively enhanced into canonical accessible listboxes', async () => {
  const [ui, app, css] = await Promise.all([
    fs.readFile(uiPath, 'utf8'),
    fs.readFile(appPath, 'utf8'),
    fs.readFile(cssPath, 'utf8')
  ]);

  assert.match(ui, /enhanceHistoryListboxes/);
  assert.match(ui, /data-history-filter/);
  assert.match(ui, /role="listbox"/);
  assert.match(ui, /role="option"/);
  assert.match(ui, /aria-expanded/);
  assert.match(ui, /ArrowDown/);
  assert.match(ui, /ArrowUp/);
  assert.match(ui, /Home/);
  assert.match(ui, /End/);
  assert.match(ui, /Escape/);

  // Native controls remain the form-state authority while the browser popup is removed from the visible UI.
  assert.match(app, /<select class="select" name="participant"/);
  assert.match(app, /<select class="select" name="type"/);
  assert.match(app, /<select class="select" name="status"/);
  assert.match(css, /\.listbox-native\s*\{[^}]*position:\s*absolute[^}]*opacity:\s*0/s);
  assert.match(css, /\.listbox-popover\s*\{[^}]*position:\s*absolute[^}]*z-index:/s);
  assert.match(css, /\.listbox-option\[aria-selected="true"\]/);
});

test('history toolbar is compact, single-line on desktop and responsive on mobile', async () => {
  const [app, css] = await Promise.all([fs.readFile(appPath, 'utf8'), fs.readFile(cssPath, 'utf8')]);

  assert.match(app, /history-filter-form/);
  assert.match(css, /\.filter-grid\s*\{[^}]*align-items:\s*end[^}]*gap:\s*8px/s);
  assert.match(css, /\.filter-grid \.date-button\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.filter-grid \.date-button small\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.filter-grid \.button--primary\s*\{[^}]*min-height:\s*42px/s);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*?\.filter-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('reports use a modern command bar treatment and dark theme is neutral graphite', async () => {
  const [app, css] = await Promise.all([fs.readFile(appPath, 'utf8'), fs.readFile(cssPath, 'utf8')]);
  const dark = themeBlock(css, ':root[data-theme="dark"]');

  assert.match(app, /class="more-dashboard"/);
  assert.match(css, /\.more-dashboard\s*\{/);
  assert.match(css, /\.more-dashboard button\s*\{/);
  assert.match(css, /\.more-dashboard \.is-danger/);

  assert.match(dark, /--hc-bg:\s*#101112/);
  assert.match(dark, /--hc-surface:\s*#18191b/);
  assert.match(dark, /--hc-surface-subtle:\s*#202226/);
  assert.match(dark, /--hc-text:\s*#f4f4f5/);
});

test('active race gets a fast switch affordance that reuses the existing race creation path', async () => {
  const ui = await fs.readFile(uiPath, 'utf8');
  assert.match(ui, /enhanceRaceQuickSwitch/);
  assert.match(ui, /data-race-quick-switch/);
  assert.match(ui, /data-action="new-race"/);
  assert.match(ui, /Cambiar carrera/);
});
