import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../frontend/public/hipico-control/index.html');
const css = read('../frontend/public/hipico-control/assets/css/app.css');
const opsCss = read('../frontend/public/hipico-control/assets/css/operational-copy-center.css');
const notice = read('../frontend/public/hipico-control/assets/js/notice-bridge.js');
const sw = read('../frontend/public/hipico-control/sw.js');

function jsFiles(url, prefix = '') {
  const files = [];
  for (const entry of readdirSync(url, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...jsFiles(new URL(`${entry.name}/`, url), `${prefix}${entry.name}/`));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(`${prefix}${entry.name}`);
  }
  return files.sort();
}

test('release shell mounts canonical logo and notice bridge', () => {
  assert.match(html, /logo-control-hipico\.png/);
  assert.match(html, /assets\/js\/notice-bridge\.js/);
  assert.match(html, /id="toast-region"/);
});

test('operational notices are routed into accessible app feedback instead of being silently dropped', () => {
  assert.match(notice, /addEventListener\('hipico:notice'/);
  assert.match(notice, /toast\(notice\.message/);
  assert.match(notice, /\['success', 'error', 'warning', 'info'\]/);
  assert.match(notice, /__HIPICO_NOTICE_BRIDGE__/);
});

test('canonical UI exposes light, dark and system theming', () => {
  assert.match(css, /:root\s*\{[\s\S]*color-scheme:\s*light/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /:root\[data-theme="system"\]/);
});

test('mobile controls preserve the 44px interaction contract', () => {
  assert.match(css, /--hc-touch:\s*44px/);
  assert.match(css, /@media \(max-width:\s*780px\)[\s\S]*\.button,[\s\S]*min-height:\s*var\(--hc-touch\)/);
  assert.match(opsCss, /@media\(max-width:720px\)[\s\S]*min-height:44px/);
});

test('mobile vertical scrolling and reduced motion remain explicitly supported', () => {
  assert.match(css, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(css, /overflow-y:\s*visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('installed PWA precaches the complete Hípico JavaScript module tree', () => {
  const root = new URL('../frontend/public/hipico-control/assets/js/', import.meta.url);
  const missing = jsFiles(root).filter((file) => !sw.includes(`'./assets/js/${file}'`) && !sw.includes(`"./assets/js/${file}"`));
  assert.deepEqual(missing, [], `JavaScript modules missing from APP_SHELL: ${missing.join(', ')}`);
  assert.match(sw, /shell-r8-complete-offline/);
  assert.match(sw, /new cache name makes shell upgrades atomic/i);
});
