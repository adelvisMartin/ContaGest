import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../backend/src/app.ts', import.meta.url), 'utf8');
const security = readFileSync(new URL('../backend/src/shared/middleware/security.ts', import.meta.url), 'utf8');

function mountsFor(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...app.matchAll(new RegExp(`app\\.use\\(\\s*['\"]${escaped}['\"]\\s*,([\\s\\S]*?)\\);`, 'g'))]
    .map((match) => match[1]);
}

test('browser operator clients may send only the explicit Hípico operator credential header', () => {
  assert.match(security, /allowedHeaders:[\s\S]*['"]x-hipico-operator-token['"]/);
  assert.doesNotMatch(security, /allowedHeaders:[\s\S]*['"]x-hipico-bridge-token['"]/);
});

test('canonical Hípico prefix applies one shared auth/mutation transport chain to provider race and domain routers', () => {
  const mounts = mountsFor('/api/v1/hipico');
  assert.equal(mounts.length, 1, 'canonical prefix must have one middleware chain to avoid duplicate auth limiter accounting');
  const chain = mounts[0];
  const auth = chain.indexOf('authRateLimit');
  const mutation = chain.indexOf('mutationRateLimit');
  const providers = chain.indexOf('hipicoProviderRoutes');
  const races = chain.indexOf('hipicoRaceRoutes');
  const canonical = chain.indexOf('hipicoCanonicalRoutes');
  assert.ok(auth >= 0 && mutation > auth && providers > mutation && races > providers && canonical > races);
  assert.match(security, /export const mutationRateLimit[\s\S]*skip:\s*isReadOnlyRequest/,
    'read-only provider/race GETs must bypass mutation throttling even though routers share one chain');
});
