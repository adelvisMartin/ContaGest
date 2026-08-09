import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('captcha token no longer serializes the expected answer', () => {
  const auth = read('backend/src/modules/auth/auth.routes.ts');
  assert.match(auth, /answerSig/);
  assert.match(auth, /signCaptchaAnswer/);
  assert.doesNotMatch(auth, /JSON\.stringify\(\{kind:'math',a:left,b:right,op,expected,/);
  assert.match(auth, /password:z\.string\(\)\.min\(12\)\.max\(128\)/);
});

test('session roles are derived from database permissions instead of an admin default', () => {
  const auth = read('backend/src/modules/auth/auth.routes.ts');
  assert.match(auth, /hasAdminPermission/);
  assert.match(auth, /permissionsForUser/);
  assert.match(auth, /roleForUser\(user/);
  assert.doesNotMatch(auth, /function publicUser\(user:any,role='admin'\)/);
});

test('API blocks cross-site unsafe requests and disables sensitive caching', () => {
  const security = read('backend/src/shared/middleware/security.ts');
  assert.match(security, /fetchSite === 'cross-site'/);
  assert.match(security, /cache-control', 'no-store, max-age=0'/);
  assert.match(security, /x-frame-options', 'DENY'/);
});

test('PWA install flow and service worker do not cache API data', () => {
  const installer = read('frontend/public/pwa-install.js');
  const sw = read('frontend/public/sw.js');
  const manifest = JSON.parse(read('frontend/public/manifest.webmanifest'));
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /appinstalled/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /cache:'no-store'/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
});

test('Vercel production policy denies framing and prevents API/service-worker caching', () => {
  const root = read('vercel.json');
  const frontend = read('frontend/vercel.json');
  for (const config of [root, frontend]) {
    assert.match(config, /X-Frame-Options/);
    assert.match(config, /DENY/);
    assert.match(config, /no-store/);
  }
  assert.match(frontend, /Service-Worker-Allowed/);
});
