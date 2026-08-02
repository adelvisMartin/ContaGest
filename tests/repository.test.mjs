import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, rootUrl), 'utf8');

const requiredFiles = [
  'frontend/src/app.js',
  'frontend/src/services/authSession.js',
  'frontend/src/services/authService.js',
  'frontend/src/services/backendApi.js',
  'backend/src/app.ts',
  'backend/src/shared/auth/jwt.ts',
  'backend/src/shared/middleware/context.ts',
  'backend/src/modules/auth/auth.routes.ts',
  'api/health.ts',
  'frontend/api/status.ts',
  'vercel.json',
  'frontend/vercel.json'
];

test('required production entrypoints exist', () => {
  requiredFiles.forEach((path) => {
    assert.equal(existsSync(new URL(path, rootUrl)), true, path);
  });
});

test('frontend uses a canonical authentication session', () => {
  const session = read('frontend/src/services/authSession.js');
  const auth = read('frontend/src/services/authService.js');
  const api = read('frontend/src/services/backendApi.js');
  assert.match(session, /contagest_auth_session/);
  assert.match(auth, /authSession/i);
  assert.match(api, /authSession/i);
  assert.doesNotMatch(api, /x-tenant-id/i);
  assert.doesNotMatch(api, /x-user-id/i);
});

test('backend derives tenant context from signed bearer tokens', () => {
  const context = read('backend/src/shared/middleware/context.ts');
  const jwt = read('backend/src/shared/auth/jwt.ts');
  assert.match(context, /authorization/i);
  assert.match(context, /tenantId/);
  assert.match(jwt, /issuer/i);
  assert.match(jwt, /audience/i);
  assert.match(jwt, /expires/i);
});

test('public health probes are preserved before the SPA fallback', () => {
  const rootVercel = read('vercel.json');
  const frontendVercel = read('frontend/vercel.json');
  assert.match(rootVercel, /api\/health/);
  assert.match(frontendVercel, /api\/health/);
  assert.match(rootVercel, /index\.html/);
  assert.match(frontendVercel, /index\.html/);
  assert.ok(rootVercel.indexOf('api/health') < rootVercel.lastIndexOf('index.html'));
  assert.ok(frontendVercel.indexOf('api/health') < frontendVercel.lastIndexOf('index.html'));
});
