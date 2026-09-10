import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const indexPath = `${root}/index.html`;
const recoveryPath = `${root}/recovery.html`;
const cssPath = `${root}/assets/css/ui-system.css`;
const guidePath = `${root}/STYLE-GUIDE-V2.md`;
const swPath = `${root}/sw.js`;
const removedCss = ['tokens.css','themes.css','components.css','operations-pro.css','precision-hipica.css','recovery.css','ui-system-v2.css'];

test('Control Hípico loads one visual authority after the structural base', async () => {
  const index = await fs.readFile(indexPath, 'utf8');
  const links = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links, ['./assets/css/styles.css', './assets/css/ui-system.css']);
  for (const file of removedCss) assert.equal(index.includes(file), false, `${file} must not be loaded`);
  await Promise.all(removedCss.map(async (file) => assert.rejects(fs.access(`${root}/assets/css/${file}`))));
});

test('canonical UI uses restrained typography, geometry and neutral-first surfaces', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  for (const weight of [400,500,600,700]) assert.match(css, new RegExp(`--hc-weight-[^:]+:\\s*${weight}`));
  assert.match(css, /--hc-font-size-display:\s*clamp\(1\.625rem,[^;]+2rem\)/);
  assert.match(css, /--hc-radius-sm:\s*8px/);
  assert.match(css, /--hc-radius-lg:\s*12px/);
  assert.match(css, /\.badge\s*\{[^}]*min-height:\s*22px/s);
  assert.match(css, /\.toast\s*\{[\s\S]*?background:\s*var\(--hc-surface\)/);
  assert.match(css, /\.modal,[\s\S]*?border-radius:var\(--hc-radius-lg\)/);
  assert.doesNotMatch(css, /linear-gradient\(/i);
  assert.doesNotMatch(css, /radial-gradient\(/i);
  assert.doesNotMatch(css, /font-weight:\s*(?:800|900)\b/);
});

test('official horse/jockey image assets are the only PWA brand entry points', async () => {
  const [index, recovery, sw, manifest] = await Promise.all([
    fs.readFile(indexPath, 'utf8'),
    fs.readFile(recoveryPath, 'utf8'),
    fs.readFile(swPath, 'utf8'),
    fs.readFile(`${root}/manifest.webmanifest`, 'utf8')
  ]);
  assert.match(index, /logo-control-hipico\.png/);
  assert.match(index, /icons\/icon-192\.png/);
  assert.match(recovery, /icons\/icon-192\.png/);
  assert.match(manifest, /icons\/icon-192\.png/);
  assert.match(manifest, /icons\/icon-512-maskable\.png/);
  assert.equal(index.includes('icon.svg'), false);
  assert.equal(recovery.includes('>HC<'), false);
  assert.equal(sw.includes('icon.svg'), false);
  await assert.rejects(fs.access(`${root}/icon.svg`));
});

test('service worker caches only files that still exist and includes integrated modules', async () => {
  const sw = await fs.readFile(swPath, 'utf8');
  assert.match(sw, /ui-system\.css/);
  assert.match(sw, /password-recovery\.js/);
  assert.match(sw, /user-access\.js/);
  assert.match(sw, /whatsapp\/ui-transcript\.js/);
  assert.match(sw, /SHELL_CACHE/);
  for (const file of removedCss) assert.equal(sw.includes(file), false, `${file} must not be cached`);
});

test('accessibility/mobile contracts and guide remain canonical', async () => {
  const [css, guide] = await Promise.all([fs.readFile(cssPath, 'utf8'), fs.readFile(guidePath, 'utf8')]);
  assert.match(css, /@media \(max-width:780px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height:\s*var\(--hc-touch\)/);
  assert.match(css, /:focus-visible/);
  assert.match(guide, /Badges/i);
  assert.match(guide, /Modales/i);
  assert.match(guide, /Toasts/i);
  assert.match(guide, /Mobile first/i);
});
