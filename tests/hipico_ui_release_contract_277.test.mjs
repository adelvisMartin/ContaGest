import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../frontend/public/hipico-control/index.html');
const cssEntry = read('../frontend/public/hipico-control/assets/css/app.css');
const cssFoundation = read('../frontend/public/hipico-control/assets/css/_foundation.css');
const css = `${cssFoundation}\n${cssEntry}`;
const notice = read('../frontend/public/hipico-control/assets/js/notice-bridge.js');
const sw = read('../frontend/public/hipico-control/sw.js');
const config = read('../frontend/public/hipico-control/assets/js/config.js');
const buildInfo = JSON.parse(read('../frontend/public/hipico-control/build-info.json'));
const frontendPackage = JSON.parse(read('../frontend/package.json'));
const buildWriter = read('../frontend/scripts/write-hipico-build-info.mjs');

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

test('persisted theme bootstrap executes before CSS to avoid a first-paint theme flash', () => {
  const bootstrap = read('../frontend/public/hipico-control/assets/js/theme-bootstrap.js');
  const scriptIndex = html.indexOf('./assets/js/theme-bootstrap.js');
  const cssIndex = html.indexOf('./assets/css/app.css');
  assert.ok(scriptIndex >= 0, 'theme bootstrap must be loaded');
  assert.ok(cssIndex >= 0, 'canonical stylesheet must be loaded');
  assert.ok(scriptIndex < cssIndex, 'theme bootstrap must execute before CSS');
  assert.match(bootstrap, /hipico-theme/);
  assert.match(bootstrap, /localStorage/);
  assert.match(bootstrap, /dataset\.theme/);
  assert.match(bootstrap, /light/);
  assert.match(bootstrap, /dark/);
  assert.match(bootstrap, /system/);
});

test('mobile controls preserve the 44px interaction contract', () => {
  assert.match(css, /--hc-touch:\s*44px/);
  assert.match(css, /@media \(max-width:\s*780px\)[\s\S]*\.button,[\s\S]*min-height:\s*var\(--hc-touch\)/);
  assert.match(cssEntry, /@media \(max-width: 900px\), \(pointer: coarse\)/);
  assert.match(cssEntry, /\.input,[\s\S]*\.select,[\s\S]*\.date-button,[\s\S]*\.color-input,[\s\S]*\.switch-row[\s\S]*min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(cssEntry, /@media\(max-width:720px\)[\s\S]*min-height:44px/);
  assert.doesNotMatch(html, /mobile-accessibility\.css|operational-copy-center\.css|operational-access-guard\.css/);
});

test('mobile vertical scrolling, safe area and reduced motion remain explicitly supported', () => {
  assert.match(css, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(css, /overflow-y:\s*visible/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('installed PWA precaches the complete Hípico JavaScript module tree and atomically retires old shells', () => {
  const root = new URL('../frontend/public/hipico-control/assets/js/', import.meta.url);
  const missing = jsFiles(root).filter((file) => !sw.includes(`'./assets/js/${file}'`) && !sw.includes(`"./assets/js/${file}"`));
  assert.deepEqual(missing, [], `JavaScript modules missing from APP_SHELL: ${missing.join(', ')}`);
  assert.match(sw, /assets\/css\/app\.css/);
  assert.match(sw, /assets\/css\/_foundation\.css/);
  assert.match(sw, /const SHELL_CACHE\s*=\s*`\$\{CACHE_VERSION\}-shell-r\d+-[a-z0-9-]+`/i);
  assert.match(sw, /cache\.addAll\(\[\.\.\.APP_SHELL_URLS\]\)/);
  assert.match(sw, /key\.startsWith\('hipico-control-'\)\s*&&\s*key\s*!==\s*SHELL_CACHE/);
  assert.match(sw, /caches\.delete\(key\)/);
  assert.match(sw, /isSensitive\(url\).*cache:\s*'no-store'/s);
  assert.match(sw, /isRuntimeMetadata\(url\).*cache:\s*'no-store'/s);
});

test('PWA reads offline shell resources only from the Control Hípico cache namespace', () => {
  assert.doesNotMatch(sw, /\bcaches\.match\s*\(/, 'origin-global CacheStorage lookup could cross-contaminate sibling applications');
  assert.match(sw, /const cache = await caches\.open\(SHELL_CACHE\)/);
  assert.match(sw, /cache\.match\(scoped\(preferred\)\)/);
  assert.match(sw, /cache\.match\(request\)/);
});

test('Control Hípico release version is single-sourced and build metadata is generated during every frontend build', () => {
  const appVersion = config.match(/export const APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  const cacheVersion = sw.match(/const CACHE_VERSION\s*=\s*['"]hipico-control-v([^'"]+)['"]/)?.[1];
  assert.ok(appVersion, 'APP_VERSION must exist');
  assert.equal(cacheVersion, appVersion);
  assert.equal(buildInfo.version, appVersion);
  assert.equal(buildInfo.buildId, appVersion);
  assert.match(frontendPackage.scripts['build:identity'], /write-build-info\.mjs\s*&&\s*node scripts\/write-hipico-build-info\.mjs/);
  assert.match(frontendPackage.scripts['preqa:source'], /node --check frontend\/scripts\/write-hipico-build-info\.mjs/);
});

test('Hípico build metadata binds production artifacts to exact Git SHA without Windows pathname assumptions', () => {
  assert.match(buildWriter, /fileURLToPath/);
  assert.doesNotMatch(buildWriter, /new URL\([^\n]+\)\.pathname/);
  assert.match(buildWriter, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(buildWriter, /GIT_SHA/);
  assert.match(buildWriter, /candidateSha/);
  assert.match(buildWriter, /bound:candidateSha!==['"]local-unbound['"]/);
  const isBoundSha = /^[a-f0-9]{40}$/i.test(String(buildInfo.candidateSha || ''));
  assert.ok(buildInfo.candidateSha === 'local-unbound' || isBoundSha, 'candidateSha must be local-unbound or an exact 40-hex Git SHA');
  assert.equal(buildInfo.bound, buildInfo.candidateSha !== 'local-unbound');
  const runtimeSha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || process.env.COMMIT_SHA || '').trim().toLowerCase();
  if (/^[a-f0-9]{40}$/.test(runtimeSha)) {
    assert.equal(buildInfo.candidateSha, runtimeSha, 'build metadata must bind to the exact runtime Git SHA');
    assert.equal(buildInfo.bound, true);
  }
});
