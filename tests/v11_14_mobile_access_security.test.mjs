import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v11.14 publishes a deterministic installable PWA', () => {
  const manifest = JSON.parse(read('frontend/public/manifest.webmanifest'));
  const sw = read('frontend/public/sw.js');
  const installer = read('frontend/public/pwa-install.js');
  const vite = read('frontend/vite.config.js');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/?source=pwa');
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.icons.some((icon) => icon.src === '/icons/contagest-app-192.svg' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.src === '/icons/contagest-app-512.svg' && icon.sizes === '512x512'));
  assert.match(sw, /contagest-ve-v11-14-0/);
  assert.match(sw, /manifest\.webmanifest/);
  assert.match(sw, /contagest-app-192\.svg/);
  assert.match(sw, /contagest-app-512\.svg/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /Android/);
  assert.match(installer, /Añadir a pantalla de inicio/);
  assert.match(vite, /\/manifest\.webmanifest/);
});

test('captcha retrieval is not consumed by the authentication POST throttle', () => {
  const security = read('backend/src/shared/middleware/security.ts');
  assert.match(security, /skip:\s*\(req\)\s*=>\s*\['GET', 'HEAD', 'OPTIONS'\]\.includes/);
  assert.match(security, /limit:\s*isProd \? 20 : 60/);
});

test('five failed passwords disable the account until an admin unlocks it', () => {
  const auth = read('backend/src/modules/auth/auth.routes.ts');
  const admin = read('backend/src/modules/user-security/user-security.routes.ts');
  assert.match(auth, /LOGIN_FAILURE_LIMIT = 5/);
  assert.match(auth, /status:'disabled'/);
  assert.match(auth, /Usuario bloqueado después de 5 intentos fallidos/);
  assert.match(admin, /requirePermission\('admin\.manage'\)/);
  assert.match(admin, /clearFailures/);
  assert.match(admin, /newPassword: z\.string\(\)\.min\(12\)\.max\(128\)/);
  assert.match(admin, /bcrypt\.hash\(body\.newPassword, 12\)/);
});

test('client portal is visually and server-side forced to licensed-client mode', () => {
  const enhancer = read('frontend/src/services/loginEnhancer.js');
  const auth = read('backend/src/modules/auth/auth.routes.ts');
  assert.match(enhancer, /path === '\/cliente'/);
  assert.match(enhancer, /clientOnly \? 'client'/);
  assert.match(enhancer, /Cliente con licencia/);
  assert.match(enhancer, /accessInput\.name = 'accessMode'/);
  assert.match(enhancer, /licenseInput\.required = client/);
  assert.match(auth, /accessMode:z\.enum\(\['staff','client'\]\)/);
  assert.match(auth, /accessMode==='client'&&internalUser/);
  assert.match(auth, /accessMode==='staff'&&!internalUser/);
});

test('client URL editing cannot grant the admin frontend route and backend APIs enforce admin permission', () => {
  const guard = read('frontend/src/services/sessionAccessGuard.js');
  const adminApi = read('backend/src/modules/user-security/user-security.routes.ts');
  assert.match(guard, /required === 'admin\.manage' && role !== 'admin'/);
  assert.match(guard, /permissions\.includes\(required\)/);
  assert.match(adminApi, /requirePermission\('admin\.manage'\)/);
});

test('demo accounts are not internal system identities', () => {
  const rbac = read('backend/src/modules/rbac/rbac.routes.ts');
  assert.match(rbac, /name: 'Demo limitado'.*system: false/);
  assert.match(rbac, /if \(role\.system\) throw new HttpError\(422/);
});

test('responsive enterprise theme covers mobile phone, tablet and compact screens', () => {
  const css = read('frontend/src/styles/modern-enterprise-v1114.css');
  for (const width of ['1279px','1023px','767px','479px','359px']) assert.match(css, new RegExp(width.replace('.', '\\.')));
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /login-access-client-only/);
});

test('v11.14 is consistently exposed by packages and health endpoints', () => {
  assert.equal(JSON.parse(read('package.json')).version, '11.14.0');
  assert.equal(JSON.parse(read('frontend/package.json')).version, '11.14.0');
  assert.equal(JSON.parse(read('backend/package.json')).version, '11.14.0');
  assert.match(read('backend/src/app.ts'), /version: '11\.14\.0'/);
  assert.match(read('frontend/api/status.ts'), /VERSION = '11\.14\.0'/);
});
