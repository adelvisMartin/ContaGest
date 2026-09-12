import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../backend/src/app.ts');
const domain = read('../backend/src/modules/hipico/hipico-domain.ts');
const routes = read('../backend/src/modules/hipico/hipico-system.routes.ts');
const safetyRoutes = read('../backend/src/modules/hipico-bot/hipico-canonical.routes.ts');

void test('canonical Hípico system API is mounted while compatibility transport routes remain', () => {
  assert.match(app, /\/api\/v1\/hipico\/system/);
  assert.match(app, /\/api\/v1\/hipico-bot/);
  assert.match(routes, /router\.get\('\/version'/);
  assert.match(routes, /router\.get\('\/status'/);
  assert.match(routes, /router\.get\('\/readiness'/);
});

void test('canonical error envelope contains stable machine fields', () => {
  for (const field of ['ok', 'code', 'message', 'requestId', 'retryable']) {
    assert.match(domain, new RegExp(`${field}:`));
  }
});

void test('canonical provider contracts can never claim financial authority', () => {
  assert.match(domain, /financialAuthority:\s*z\.literal\(false\)/);
});

void test('hardened domain-event safety facade is absorbed under the single canonical backend authority', () => {
  assert.match(app, /modules\/hipico-bot\/hipico-canonical\.routes/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, mutationRateLimit, hipicoCanonicalRoutes\)/);
  assert.match(safetyRoutes, /monetaryWrite:\s*false/);
  assert.match(safetyRoutes, /sourceWrite:\s*false/);
});
