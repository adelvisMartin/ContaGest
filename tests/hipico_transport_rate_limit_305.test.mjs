import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../backend/src/app.ts', import.meta.url), 'utf8');

function mountsFor(prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...app.matchAll(new RegExp(`app\\.use\\(\\s*['\"]${escaped}['\"]\\s*,([\\s\\S]*?)\\);`, 'g'))]
    .map((match) => ({ body: match[1], index: match.index ?? -1 }));
}

test('Hípico compatibility adapters share exactly one auth throttle after the webhook surface', () => {
  const webhookMount = app.indexOf("app.use('/api/v1/hipico-bot', hipicoWebhookRoutes)");
  const adapterMounts = mountsFor('/api/v1/hipico-bot').filter((entry) => entry.body.includes('authRateLimit'));
  assert.ok(webhookMount >= 0, 'signed Meta webhook must remain mounted');
  assert.equal(adapterMounts.length, 1, 'compatibility adapters must share one auth limiter chain');
  const adapter = adapterMounts[0];
  assert.ok(adapter.index > webhookMount, 'signed Meta webhook must remain ahead of token-adapter throttling');
  assert.match(adapter.body, /hipicoBridgeRoutes/);
  assert.match(adapter.body, /hipicoOperatorRoutes/);
  assert.match(adapter.body, /hipicoLegacyProviderRoutes/);
});

test('canonical provider/race/domain facade also applies auth throttling only once', () => {
  const canonicalMounts = mountsFor('/api/v1/hipico').filter((entry) => entry.body.includes('authRateLimit'));
  assert.equal(canonicalMounts.length, 1, 'canonical routers must share one auth limiter chain');
  const chain = canonicalMounts[0].body;
  assert.match(chain, /mutationRateLimit/);
  assert.match(chain, /hipicoProviderRoutes/);
  assert.match(chain, /hipicoRaceRoutes/);
  assert.match(chain, /hipicoCanonicalRoutes/);
});
