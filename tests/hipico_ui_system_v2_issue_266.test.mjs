import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const indexPath = `${root}/index.html`;
const recoveryPath = `${root}/recovery.html`;
const cssPath = `${root}/assets/css/app.css`;
const guidePath = `${root}/STYLE-GUIDE.md`;
const swPath = `${root}/sw.js`;
const removedCss = ['styles.css','ui-system.css','tokens.css','themes.css','components.css','operations-pro.css','precision-hipica.css','offline-icons.css','recovery.css','ui-system-v2.css'];

test('Control Hípico loads exactly one canonical stylesheet', async () => {
  const index = await fs.readFile(indexPath, 'utf8');
  const links = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links, ['./assets/css/app.css']);
  await fs.access(cssPath);
  for (const file of removedCss) {
    assert.equal(index.includes(file), false, `${file} must not be loaded`);
    await assert.rejects(fs.access(`${root}/assets/css/${file}`));
  }
});

test('canonical UI is neutral-first, restrained and free of historical override layers', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /--hc-brand:\s*#721522/);
  assert.match(css, /--hc-radius-sm:\s*8px/);
  assert.match(css, /--hc-radius-lg:\s*12px/);
  assert.match(css, /\.badge\s*\{[^}]*min-height:\s*22px/s);
  assert.match(css, /\.toast\s*\{[\s\S]*?background:\s*var\(--hc-surface\)/);
  assert.match(css, /\.modal\s*\{[\s\S]*?border-radius:\s*var\(--hc-radius-xl\)/);
  assert.doesNotMatch(css, /radial-gradient\(/i);
  assert.doesNotMatch(css, /background\s*:\s*linear-gradient\(/i);
  assert.doesNotMatch(css, /font-weight:\s*(?:800|850|900)\b/);
  assert.doesNotMatch(css, /\/\*\s*v\d/i);
  assert.doesNotMatch(css, /--(?:bg|surface|brand|text|muted|line|shadow)\s*:/i);
});

test('official horse/jockey image assets are the only PWA brand entry points', async () => {
  const [index, recovery, sw, manifest] = await Promise.all([
    fs.readFile(indexPath, 'utf8'), fs.readFile(recoveryPath, 'utf8'), fs.readFile(swPath, 'utf8'), fs.readFile(`${root}/manifest.webmanifest`, 'utf8')
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

test('service worker caches only canonical CSS plus integrated modules', async () => {
  const sw = await fs.readFile(swPath, 'utf8');
  assert.match(sw, /assets\/css\/app\.css/);
  assert.match(sw, /password-recovery\.js/);
  assert.match(sw, /user-access\.js/);
  assert.match(sw, /help-center\.js/);
  assert.match(sw, /whatsapp\/ui-transcript\.js/);
  assert.match(sw, /shell-r4-zero-legacy/);
  for (const file of removedCss) assert.equal(sw.includes(`assets/css/${file}`), false, `${file} must not be cached`);
});

test('accessibility/mobile and component contracts are canonical', async () => {
  const [css, guide, ui, help] = await Promise.all([
    fs.readFile(cssPath, 'utf8'), fs.readFile(guidePath, 'utf8'), fs.readFile(`${root}/assets/js/ui.js`, 'utf8'), fs.readFile(`${root}/assets/js/help-center.js`, 'utf8')
  ]);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(ui, /button\(label/);
  assert.match(ui, /dialog\(title/);
  assert.match(ui, /focusableNodes/);
  assert.match(help, /Manual de uso/);
  assert.match(help, /Nunca abre ventanas por sí sola/);
  assert.match(guide, /Dialog/);
  assert.match(guide, /Toast/);
  assert.match(guide, /scroll vertical natural/i);
});
