import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../backend/src/app.ts');
const domain = read('../backend/src/modules/hipico/hipico-domain.ts');
const compatibilityRaceContext = read('../backend/src/modules/hipico-bot/hipico-race-context-key.ts');
const routes = read('../backend/src/modules/hipico/hipico-system.routes.ts');

void test('canonical Hípico system API is mounted without removing compatibility routes', () => {
  assert.match(app, /\/api\/v1\/hipico\/system/);
  assert.match(app, /\/api\/v1\/hipico-bot/);
  assert.match(app, /\/api\/v1\/hipico'/);
  assert.match(routes, /router\.get\('\/version'/);
  assert.match(routes, /router\.get\('\/status'/);
  assert.match(routes, /router\.get\('\/readiness'/);
});

void test('canonical error envelope contains stable machine fields', () => {
  for (const field of ['ok', 'code', 'message', 'requestId', 'retryable']) {
    assert.match(domain, new RegExp(`${field}:`));
  }
  assert.match(domain, /financialAuthority:\s*z\.literal\(false\)/);
});

void test('race-context deterministic rules have one canonical implementation', () => {
  assert.match(domain, /export function operationalRaceContextKey/);
  assert.match(compatibilityRaceContext, /from '\.\.\/hipico\/hipico-domain\.js'/);
  assert.doesNotMatch(compatibilityRaceContext, /createHash|createHash\(|sha256|gregorianDaysInMonth/);
});

void test('canonical domain owns normalized messaging/classification contracts without framework imports', () => {
  assert.match(domain, /hipicoNormalizedMessageSchema/);
  assert.match(domain, /hipicoClassificationSchema/);
  assert.doesNotMatch(domain, /from ['"]express['"]|from ['"]@supabase|playwright|vercel/i);
});
