import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const indexPath = `${root}/index.html`;
const recoveryPath = `${root}/recovery.html`;
const cssPath = `${root}/assets/css/app.css`;
const foundationPath = `${root}/assets/css/_foundation.css`;
const guidePath = `${root}/STYLE-GUIDE.md`;
const swPath = `${root}/sw.js`;
const removedCss = [
  'styles.css','ui-system.css','tokens.css','themes.css','components.css',
  'operations-pro.css','precision-hipica.css','offline-icons.css','recovery.css','ui-system-v2.css',
  'mobile-accessibility.css','operational-copy-center.css','operational-access-guard.css'
];

async function canonicalCss() {
  const [entry, foundation] = await Promise.all([fs.readFile(cssPath, 'utf8'), fs.readFile(foundationPath, 'utf8')]);
  assert.match(entry, /^@import url\("\.\/_foundation\.css"\);/);
  return `${foundation}\n${entry}`;
}

test('Control Hípico loads exactly one canonical stylesheet on app and recovery surfaces', async () => {
  const [index, recovery] = await Promise.all([fs.readFile(indexPath, 'utf8'), fs.readFile(recoveryPath, 'utf8')]);
  const stylesheetLinks = (html) => [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(stylesheetLinks(index), ['./assets/css/app.css']);
  assert.deepEqual(stylesheetLinks(recovery), ['./assets/css/app.css']);
  assert.match(recovery, /data-action="reset-local-storage"/);
  await fs.access(cssPath);
  await fs.access(foundationPath);
  for (const file of removedCss) {
    assert.equal(index.includes(file), false, `${file} must not be loaded by index`);
    assert.equal(recovery.includes(file), false, `${file} must not be loaded by recovery`);
    await assert.rejects(fs.access(`${root}/assets/css/${file}`));
  }
});

test('canonical UI is neutral-first, restrained and free of historical override layers', async () => {
  const css = await canonicalCss();
  assert.match(css, /--hc-brand:\s*#721522/);
  assert.match(css, /--hc-radius-sm:\s*8px/);
  assert.match(css, /--hc-radius-lg:\s*12px/);
  assert.match(css, /--hc-touch:\s*44px/);
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

test('service worker precaches the canonical CSS entrypoint and its internal foundation only', async () => {
  const sw = await fs.readFile(swPath, 'utf8');
  assert.match(sw, /assets\/css\/app\.css/);
  assert.match(sw, /assets\/css\/_foundation\.css/);
  assert.match(sw, /password-recovery\.js/);
  assert.match(sw, /user-access\.js/);
  assert.match(sw, /help-center\.js/);
  assert.match(sw, /whatsapp\/ui-transcript\.js/);
  assert.match(sw, /shell-r\d+-[a-z0-9-]+/i);
  for (const file of removedCss) assert.equal(sw.includes(`assets/css/${file}`), false, `${file} must not be cached`);
});

test('accessibility/mobile and component contracts are canonical', async () => {
  const [css, guide, ui, help] = await Promise.all([
    canonicalCss(), fs.readFile(guidePath, 'utf8'), fs.readFile(`${root}/assets/js/ui.js`, 'utf8'), fs.readFile(`${root}/assets/js/help-center.js`, 'utf8')
  ]);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 900px\), \(pointer: coarse\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(css, /min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(ui, /button\(label/);
  assert.match(ui, /dialog\(title/);
  assert.match(ui, /focusableNodes/);
  assert.match(ui, /data-action="dismiss-toast"/);
  assert.match(help, /Manual de uso/);
  assert.match(help, /Nunca abre ventanas por sí sola/);
  assert.match(guide, /Dialog/);
  assert.match(guide, /Toast/);
  assert.match(guide, /scroll vertical natural/i);
});
