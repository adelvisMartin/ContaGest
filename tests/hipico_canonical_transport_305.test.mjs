import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../backend/src/app.ts', import.meta.url), 'utf8');
const security = readFileSync(new URL('../backend/src/shared/middleware/security.ts', import.meta.url), 'utf8');

test('browser operator clients may send only the explicit Hípico operator credential header', () => {
  assert.match(security, /allowedHeaders:[\s\S]*['"]x-hipico-operator-token['"]/);
  assert.doesNotMatch(security, /allowedHeaders:[\s\S]*['"]x-hipico-bridge-token['"]/);
});

test('canonical Hípico prefix applies auth transport throttling once and mutation throttling only after read-only provider routes', () => {
  const mounts = [...app.matchAll(/app\.use\('\/api\/v1\/hipico',([^\n]+)\);/g)].map((match) => match[1]);
  assert.equal(mounts.length, 1, 'canonical prefix must have one middleware chain to avoid double auth limiter accounting');
  const chain = mounts[0];
  const auth = chain.indexOf('authRateLimit');
  const providers = chain.indexOf('hipicoProviderRoutes');
  const mutation = chain.indexOf('mutationRateLimit');
  const canonical = chain.indexOf('hipicoCanonicalRoutes');
  assert.ok(auth >= 0 && providers > auth && mutation > providers && canonical > mutation);
});
