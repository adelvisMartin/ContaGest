import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Vercel previews use isolated derived secrets without weakening commercial production', () => {
  const env = read('backend/src/config/env.ts');
  const security = read('backend/src/shared/middleware/security.ts');
  assert.match(env, /isVercelPreview/);
  assert.match(env, /preview-jwt/);
  assert.match(env, /preview-license/);
  assert.match(env, /isProductionDeployment/);
  assert.match(security, /isProductionDeployment/);
  assert.match(security, /explicitJwtReady/);
  assert.match(security, /explicitLicenseReady/);
  assert.match(security, /process\.env\.JWT_SECRET/);
  assert.match(security, /process\.env\.LICENSE_HASH_SECRET/);
  assert.match(security, /Producción requiere JWT_SECRET y LICENSE_HASH_SECRET explícitos/);
});

test('license hashing is independent from JWT rotation', () => {
  const env = read('backend/src/config/env.ts');
  const licensing = read('backend/src/shared/licensing/licenseGuard.ts');
  assert.match(env, /LICENSE_HASH_SECRET/);
  assert.match(env, /deriveSecret\(privateSeed, 'license'\)/);
  assert.match(licensing, /env\.LICENSE_HASH_SECRET/);
  assert.doesNotMatch(licensing, /createHmac\('sha256', env\.JWT_SECRET\)/);
});

test('login clearly separates staff and licensed clients', () => {
  const enhancer = read('frontend/src/services/loginEnhancer.js');
  const styles = read('frontend/src/styles/login-enhancer.css');
  assert.match(enhancer, /Equipo interno/);
  assert.match(enhancer, /Cliente con licencia/);
  assert.match(enhancer, /licenseInput\.required = client/);
  assert.match(enhancer, /login-tech-note/);
  assert.match(enhancer, /path === '\/cliente'/);
  assert.match(styles, /login-access-switch/);
});

test('CAPTCHA and login controls are responsive and compact', () => {
  const styles = read('frontend/src/styles/login-v119.css');
  assert.match(styles, /login-captcha-body/);
  assert.match(styles, /grid-template-columns:minmax\(118px/);
  assert.match(styles, /@media\(max-width:520px\)/);
  assert.match(styles, /login-submit/);
});

test('PWA identifies v11.14 and never caches authentication APIs', () => {
  const manifest = JSON.parse(read('frontend/public/manifest.webmanifest'));
  const worker = read('frontend/public/sw.js');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.match(worker, /contagest-ve-v11-14-0/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /request\.mode === 'navigate'/);
});
