import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const obsolete = ['styles.css','ui-system.css','tokens.css','themes.css','components.css','operations-pro.css','precision-hipica.css','offline-icons.css','recovery.css','ui-system-v2.css','mobile-accessibility.css','operational-copy-center.css','operational-access-guard.css'];
const modules = ['platform-tokens-v1.css','ui-system-v3-compat.css','ui-system-v4.css','ui-system-v4-convergence.css'];
const read = (path) => fs.readFile(path, 'utf8');
const style = (name) => root + '/assets/css/' + name;
const links = (html) => [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
const bundled = async () => (await Promise.all(modules.map((name) => read(style(name))))).join('\n');

function themeBlock(css, selector) {
  const start = css.indexOf(selector + ' {');
  return start === -1 ? '' : css.slice(start + selector.length + 2, css.indexOf('}', start));
}
function colorToken(block, token) {
  return block.match(new RegExp('--' + token + ':\\s*(#[0-9a-fA-F]{6})'))?.[1]?.toLowerCase() || null;
}
function luminance(hex) {
  const values = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function contrastRatio(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test('app and recovery load same reviewed v4 CSS layers and platform tokens', async () => {
  const [index, recovery, entry] = await Promise.all([read(root + '/index.html'), read(root + '/recovery.html'), read(style('app.css'))]);
  const expected = ['./assets/css/app.css', './assets/css/platform-tokens-v1.css'];
  assert.deepEqual(links(index), expected);
  assert.deepEqual(links(recovery), expected);
  assert.match(recovery, /data-action="reset-local-storage"/);
  assert.match(entry, /@layer legacy;/);
  const imports = [...entry.matchAll(/@import\s+url\("([^"]+)"\)(?:\s+layer\(legacy\))?;/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['./ui-system-v3-compat.css', './ui-system-v4.css', './ui-system-v4-convergence.css']);
  assert.match(entry, /ui-system-v3-compat\.css"\)\s+layer\(legacy\)/);
  for (const file of modules) await fs.access(style(file));
  for (const file of obsolete) {
    assert.equal(index.includes(file), false);
    assert.equal(recovery.includes(file), false);
    await assert.rejects(fs.access(style(file)));
  }
});

test('generated platform tokens own brand, type, spacing and minimum touch size', async () => {
  const tokens = await read(style('platform-tokens-v1.css'));
  const css = await bundled();
  for (const rule of [/--hc-bg:\s*#F4F5F2/i,/--hc-brand:\s*#235C45/i,/--hc-brand-foreground:\s*#FFFFFF/i,/--hc-radius-sm:\s*6px/,/--hc-radius-lg:\s*10px/,/--hc-touch:\s*44px/,/--hc-text-touch:\s*14px/]) assert.match(tokens,rule);
  assert.match(css, /font-size:\s*14px/);
  assert.match(css, /line-height:\s*1\.5/);
  assert.match(css, /\.page-head h2/);
});

test('WCAG AA text contrast holds on dark and system primary action colors', async () => {
  const tokens = await read(style('platform-tokens-v1.css'));
  const css = await bundled();
  for (const name of ['dark', 'system']) {
    const block = themeBlock(tokens, ':root[data-theme="' + name + '"]');
    const brand = colorToken(block, 'hc-brand');
    const text = colorToken(block, 'hc-brand-foreground');
    assert.ok(brand && text, 'missing ' + name + ' primary color tokens');
    const ratio = contrastRatio(text, brand);
    assert.ok(ratio >= 4.5, name + ' contrast ratio=' + ratio.toFixed(2));
  }
  assert.match(css, /\.button--primary\s*\{[^}]*color:\s*var\(--hc-brand-foreground\)/s);
});

test('badges, alerts, dialogs and toasts retain semantic styling and visible focus', async () => {
  const css = await bundled();
  for (const name of ['.badge','.badge--success','.notice','.modal','.modal__head h3','.toast','.toast__icon','.toast--success','.toast--error','.toast--warning','.toast--info']) assert.ok(css.includes(name), 'missing ' + name);
  assert.match(css, /:focus-visible/);
  assert.match(css, /--hc-surface/);
  assert.match(css, /--hc-shadow-sm/);
});

test('operational center is denied by default and mobile/accessibility rules are preserved', async () => {
  const css = await bundled();
  assert.match(css, /\.ops-root\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.ops-root\[data-ops-authorized="true"\]\s*\{[^}]*display:\s*block\s*!important/s);
  assert.match(css, /@media \(max-width:\s*900px\),\s*\(pointer:\s*coarse\)/);
  assert.match(css, /min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(css, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
});

test('offline cache rotates r38 and never stores sensitive routes or obsolete CSS', async () => {
  const sw = await read(root + '/sw.js');
  for (const file of ['app.css', ...modules]) assert.ok(sw.includes('assets/css/' + file), 'missing offline style ' + file);
  for (const file of obsolete) assert.equal(sw.includes('assets/css/' + file), false, 'obsolete cached style ' + file);
  assert.match(sw, /shell-r38-consolidator-v4-1-3/);
  assert.match(sw, /key\.startsWith\('hipico-control-'\) && key !== SHELL_CACHE/);
  assert.match(sw, /isSensitive\(url\)\s*\|\|\s*isRuntimeMetadata\(url\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
});

test('native primitive, keyboard focus trap and style guide remain accessible', async () => {
  const [guide, ui, dialog] = await Promise.all([
    read(root + '/STYLE-GUIDE.md'), read(root + '/assets/js/ui.js'), read(root + '/assets/js/dialog-accessibility.js')
  ]);
  assert.match(ui, /export const ui = Object\.freeze/);
  assert.match(ui, /data-action="dismiss-toast"/);
  assert.match(ui, /aria-live/);
  assert.match(dialog, /function focusable\(dialog\)/);
  assert.match(dialog, /function trapTab\(event\)/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(guide, /ordered multi-file CSS architecture/i);
  assert.match(guide, /WCAG AA/i);
  assert.match(guide, /keyboard|teclado/i);
  assert.match(guide, /reduced-motion/i);
  for (const width of ['360', '390', '430', '768', '1024', '1440']) assert.match(guide, new RegExp(width));
});
