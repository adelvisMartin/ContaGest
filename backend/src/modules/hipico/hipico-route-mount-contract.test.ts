import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8');

function mountsFor(prefix: string) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`app\\.use\\(\\s*['"]${escaped}['"]\\s*,([\\s\\S]*?)\\);`, 'g');
  return [...app.matchAll(pattern)].map((match) => match[1]);
}

test('canonical provider race and domain routers share one auth/mutation limiter chain', () => {
  const mounts = mountsFor('/api/v1/hipico');
  assert.equal(mounts.length, 1, 'canonical Hípico prefix must not double-count auth or mutation throttles');
  const chain = mounts[0];
  assert.match(chain, /authRateLimit/);
  assert.match(chain, /mutationRateLimit/);
  assert.match(chain, /hipicoProviderRoutes/);
  assert.match(chain, /hipicoRaceRoutes/);
  assert.match(chain, /hipicoCanonicalRoutes/);
});

test('document upload/list API remains on its explicit /documents boundary', () => {
  const mounts = mountsFor('/api/v1/hipico/documents');
  assert.equal(mounts.length, 1);
  assert.match(mounts[0], /authRateLimit/);
  assert.match(mounts[0], /mutationRateLimit/);
  assert.match(mounts[0], /hipicoDocumentRoutes/);
});

test('legacy provider adapter stays under hipico-bot and does not compete for canonical /providers', () => {
  const botMounts = mountsFor('/api/v1/hipico-bot');
  assert.ok(botMounts.some((mount) => /hipicoLegacyProviderRoutes/.test(mount)));
  const canonicalMount = mountsFor('/api/v1/hipico').join('\n');
  assert.doesNotMatch(canonicalMount, /hipicoLegacyProviderRoutes/);
});
