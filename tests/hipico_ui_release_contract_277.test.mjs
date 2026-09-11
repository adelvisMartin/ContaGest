import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test__ as noticeTest } from '../frontend/public/hipico-control/assets/js/notice-bridge.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../frontend/public/hipico-control/index.html');
const css = read('../frontend/public/hipico-control/assets/css/app.css');
const opsCss = read('../frontend/public/hipico-control/assets/css/operational-copy-center.css');

test('release shell mounts canonical logo and notice bridge', () => {
  assert.match(html, /logo-control-hipico\.png/);
  assert.match(html, /assets\/js\/notice-bridge\.js/);
  assert.match(html, /id="toast-region"/);
});

test('notice bridge normalizes supported tones and defaults safely', () => {
  assert.deepEqual(noticeTest.normalizeNotice('Revisar carrera'), { message: 'Revisar carrera', type: 'warning' });
  assert.deepEqual(noticeTest.normalizeNotice({ message: 'Guardado', type: 'success' }), { message: 'Guardado', type: 'success' });
  assert.deepEqual(noticeTest.normalizeNotice({ message: 'Aviso', type: 'unknown' }), { message: 'Aviso', type: 'warning' });
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
