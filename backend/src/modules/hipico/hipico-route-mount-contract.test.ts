import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8');

test('canonical provider race and domain routers share one auth/mutation limiter chain', () => {
  const mounts = [...app.matchAll(/app\.use\('\/api\/v1\/hipico',([^\n;]+)\);/g)].map((match) => match[1]);
  assert.equal(mounts.length, 1, 'canonical Hípico prefix must not double-count auth or mutation throttles');
  assert.match(mounts[0], /authRateLimit/);
  assert.match(mounts[0], /mutationRateLimit/);
  assert.match(mounts[0], /hipicoProviderRoutes/);
  assert.match(mounts[0], /hipicoRaceRoutes/);
  assert.match(mounts[0], /hipicoCanonicalRoutes/);
});

test('document upload/list API remains on its explicit /documents boundary', () => {
  assert.match(app, /app\.use\('\/api\/v1\/hipico\/documents',authRateLimit,mutationRateLimit,hipicoDocumentRoutes\)/);
});
