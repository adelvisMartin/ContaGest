import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const indexPath = `${root}/index.html`;
const recoveryPath = `${root}/recovery.html`;
const cssPath = `${root}/assets/css/app.css`;
const guidePath = `${root}/STYLE-GUIDE.md`;
const swPath = `${root}/sw.js`;
const removedCss = [
  'styles.css','ui-system.css','tokens.css','themes.css','components.css','operations-pro.css','precision-hipica.css',
  'offline-icons.css','recovery.css','ui-system-v2.css','mobile-accessibility.css','operational-copy-center.css','operational-access-guard.css'
];

function stylesheetLinks(html) {
  return [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((match) => match[1]);
}

function relativeLuminance(hex) {
  const channels = [1,3,5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground), b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function themeBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'))?.[1] || '';
}

function colorToken(block, token) {
  return block.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase() || null;
}

test('Control Hípico exposes exactly one canonical stylesheet on app and recovery surfaces', async () => {
  const [index, recovery] = await Promise.all([fs.readFile(indexPath, 'utf8'), fs.readFile(recoveryPath, 'utf8')]);
  assert.deepEqual(stylesheetLinks(index), ['./assets/css/app.css']);
  assert.deepEqual(stylesheetLinks(recovery), ['./assets/css/app.css']);
  assert.match(recovery, /data-action="reset-local-storage"/);
  await fs.access(cssPath);
  for (const file of removedCss) {
    assert.equal(index.includes(file), false, `${file} must not be loaded by index`);
    assert.equal(recovery.includes(file), false, `${file} must not be loaded by recovery`);
    await assert.rejects(fs.access(`${root}/assets/css/${file}`));
  }
});

test('canonical UI is neutral-first, restrained and uses the v2 typography hierarchy', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /body\s*\{[^}]*font-size:\s*14px[^}]*line-height:\s*1\.5/s);
  assert.match(css, /--hc-brand:\s*#721522/);
  assert.match(css, /--hc-radius-sm:\s*8px/);
  assert.match(css, /--hc-radius-lg:\s*12px/);
  assert.match(css, /--hc-touch:\s*44px/);
  assert.match(css, /\.field label, \.field > span\s*\{[^}]*font-size:\s*13px[^}]*font-weight:\s*600/s);
  assert.match(css, /\.page-head h2\s*\{[^}]*font-size:\s*clamp\(22px,\s*2\.6vw,\s*28px\)/s);
  assert.match(css, /\.auth-copy h1\s*\{[^}]*font-size:\s*clamp\(26px,\s*3\.2vw,\s*32px\)/s);
  assert.doesNotMatch(css, /font-weight:\s*(?:550|650|750|800|850|900)\b/);
  assert.doesNotMatch(css, /radial-gradient\(/i);
  assert.doesNotMatch(css, /background\s*:\s*linear-gradient\(/i);
});

test('primary action foreground remains WCAG-readable in explicit and system dark themes', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  const explicit = themeBlock(css, ':root[data-theme="dark"]');
  const system = themeBlock(css, ':root[data-theme="system"]');
  const explicitBrand = colorToken(explicit, 'hc-brand');
  const explicitForeground = colorToken(explicit, 'hc-brand-foreground');
  const systemBrand = colorToken(system, 'hc-brand');
  const systemForeground = colorToken(system, 'hc-brand-foreground');
  assert.ok(explicitBrand && explicitForeground, 'explicit dark theme needs brand + foreground tokens');
  assert.ok(systemBrand && systemForeground, 'system dark theme needs brand + foreground tokens');
  assert.ok(contrastRatio(explicitForeground, explicitBrand) >= 4.5, `dark primary contrast=${contrastRatio(explicitForeground, explicitBrand).toFixed(2)}`);
  assert.ok(contrastRatio(systemForeground, systemBrand) >= 4.5, `system dark primary contrast=${contrastRatio(systemForeground, systemBrand).toFixed(2)}`);
  assert.match(css, /\.button--primary\s*\{[^}]*color:\s*var\(--hc-brand-foreground\)/s);
});

test('badges, alerts, modals and toasts use restrained semantic styling', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /\.badge\s*\{[^}]*min-height:\s*22px[^}]*font-size:\s*12px[^}]*font-weight:\s*600/s);
  assert.match(css, /\.badge--success\s*\{[^}]*background:\s*var\(--hc-surface\)/s);
  assert.match(css, /\.notice, \.offline-banner, \.install-banner, \.chat-safety-note\s*\{[^}]*background:\s*var\(--hc-surface\)/s);
  assert.match(css, /\.modal\s*\{[^}]*border-radius:\s*var\(--hc-radius-lg\)/s);
  assert.match(css, /\.modal__head h3\s*\{[^}]*font-size:\s*17px/s);
  assert.match(css, /\.toast\s*\{[\s\S]*?background:\s*var\(--hc-surface\)[\s\S]*?box-shadow:\s*var\(--hc-shadow-sm\)/);
  assert.match(css, /\.toast__icon\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/s);
  for (const state of ['success','error','warning','info']) {
    assert.match(css, new RegExp(`\\.toast--${state} \\.toast__icon \\{[^}]*background:\\s*var\\(--hc-surface-subtle\\)`, 's'));
  }
});

test('operational copy center and mobile accessibility are owned by app.css', async () => {
  const css = await fs.readFile(cssPath, 'utf8');
  assert.match(css, /\.ops-root\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.ops-root\[data-ops-authorized="true"\]\s*\{[^}]*display:\s*block\s*!important/s);
  assert.match(css, /\.ops-dialog\s*\{[^}]*border-radius:\s*var\(--hc-radius-lg\)/s);
  assert.match(css, /\.ops-kicker\s*\{[^}]*font-weight:\s*600/s);
  assert.match(css, /@media \(max-width:\s*900px\), \(pointer:\s*coarse\)/);
  assert.match(css, /\.button,[\s\S]*\.nav-button,[\s\S]*\[role="button"\]\s*\{\s*min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
});

test('service worker caches only the canonical CSS and invalidates the previous visual shell', async () => {
  const sw = await fs.readFile(swPath, 'utf8');
  assert.match(sw, /assets\/css\/app\.css/);
  assert.match(sw, /password-recovery\.js/);
  assert.match(sw, /user-access\.js/);
  assert.match(sw, /help-center\.js/);
  assert.match(sw, /whatsapp\/ui-transcript\.js/);
  assert.match(sw, /shell-r24-command-center-289/);
  for (const file of removedCss) assert.equal(sw.includes(`assets/css/${file}`), false, `${file} must not be cached`);
});

test('accessibility, primitive and style-guide contracts remain canonical', async () => {
  const [css, guide, ui, help] = await Promise.all([
    fs.readFile(cssPath, 'utf8'), fs.readFile(guidePath, 'utf8'), fs.readFile(`${root}/assets/js/ui.js`, 'utf8'), fs.readFile(`${root}/assets/js/help-center.js`, 'utf8')
  ]);
  assert.match(css, /:focus-visible/);
  assert.match(ui, /button\(label/);
  assert.match(ui, /dialog\(title/);
  assert.match(ui, /focusableNodes/);
  assert.match(ui, /data-action="dismiss-toast"/);
  assert.match(help, /Manual de uso/);
  assert.match(help, /Nunca abre ventanas por sí sola/);
  assert.match(guide, /Display\/login:[^\n]*máximo 32 px/i);
  assert.match(guide, /Badge:[^\n]*22–24 px[^\n]*12 px \/ 500–600/i);
  assert.match(guide, /Dialog:[^\n]*12 px/i);
  assert.match(guide, /Toast:[^\n]*superficie neutral/i);
  assert.match(guide, /scroll vertical natural/i);
  assert.match(guide, /no se crea un stylesheet posterior/i);
});
