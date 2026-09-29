import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const pagesWorkflowPath = '.github/workflows/github-pages.yml';

test('GitHub Pages workflow builds on main and deploys with least required permissions', () => {
  const workflow = read(pagesWorkflowPath);
  assert.match(workflow, /push:\s*[\s\S]*branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /npm run build:pages/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /environment:\s*[\s\S]*name:\s*github-pages/);
});

test('Pages build is isolated from the Vercel build pipeline and binds the repository base path', () => {
  const pkg = JSON.parse(read('frontend/package.json'));
  assert.equal(typeof pkg.scripts?.['build:pages'], 'string');
  assert.match(pkg.scripts['build:pages'], /github-pages-build\.mjs/);

  const script = read('frontend/scripts/github-pages-build.mjs');
  assert.match(script, /\/ContaGest\//);
  assert.match(script, /vite/);
  assert.doesNotMatch(script, /vercel-build/);
});

test('Pages build publishes Control Hípico at the canonical dist root and keeps the historical URL as a redirect only', () => {
  const script = read('frontend/scripts/github-pages-build.mjs');
  assert.match(script, /hipico-control/);
  assert.match(script, /HIPICO_ENTRY_MISSING/);
  assert.match(script, /path\.join\(distDir,\s*'frontend',\s*'public',\s*'hipico-control'\)/);
  assert.match(script, /location\.replace/);
});

test('private app PWA assets are repository-base safe instead of origin-root bound', () => {
  const index = read('frontend/index.html');
  assert.match(index, /href="\.\/manifest\.webmanifest"/);
  assert.match(index, /src="\.\/pwa-install\.js"/);

  const install = read('frontend/public/pwa-install.js');
  assert.doesNotMatch(install, /const SW_URL = ['"]\/sw\.js/);
  assert.doesNotMatch(install, /const appIcon = ['"]\/icons\//);
  assert.match(install, /document\.currentScript/);
  assert.match(install, /serviceWorker\.register/);

  const manifest = JSON.parse(read('frontend/public/manifest.webmanifest'));
  assert.equal(manifest.id, './');
  assert.match(manifest.start_url, /^\.\//);
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.every((icon) => String(icon.src).startsWith('./')));
  assert.ok(manifest.shortcuts.every((shortcut) => String(shortcut.url).startsWith('./')));

  const sw = read('frontend/public/sw.js');
  assert.match(sw, /self\.registration\.scope/);
  assert.match(sw, /new URL\(/);
  assert.doesNotMatch(sw, /APP_SHELL\.includes\(url\.pathname\)/);
});

test('Control Hípico remains a relative-path PWA under the Pages repository subpath', () => {
  const index = read('frontend/public/hipico-control/index.html');
  const manifest = JSON.parse(read('frontend/public/hipico-control/manifest.webmanifest'));
  const sw = read('frontend/public/hipico-control/sw.js');
  assert.match(index, /href="\.\/manifest\.webmanifest"/);
  assert.equal(manifest.id, './');
  assert.equal(manifest.scope, './');
  assert.match(sw, /self\.registration\.scope/);
});

test('GitHub Pages login fails closed without leaking a returned HTML error document', () => {
  const login = read('frontend/src/pages/LoginPage.js');
  assert.match(login, /STATIC_PAGES_API_UNCONFIGURED/);
  assert.match(login, /github\.io/);
  assert.match(login, /<!doctype html|Site not found/i);
  assert.doesNotMatch(login, /return raw\|\|'No se pudo cargar la verificación/);
});
