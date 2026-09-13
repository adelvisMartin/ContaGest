import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../backend/src/app.ts', import.meta.url), 'utf8');

test('Hípico compatibility adapters share exactly one auth throttle after the webhook surface', () => {
  const webhookMount = "app.use('/api/v1/hipico-bot', hipicoWebhookRoutes);";
  const adapterMount = "app.use('/api/v1/hipico-bot', authRateLimit, hipicoBridgeRoutes, hipicoOperatorRoutes);";
  assert.match(app, new RegExp(webhookMount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(app, new RegExp(adapterMount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(app.indexOf(webhookMount) < app.indexOf(adapterMount), 'signed Meta webhook must remain ahead of token-adapter throttling');
  assert.equal((app.match(/app\.use\('\/api\/v1\/hipico-bot', authRateLimit/g) || []).length, 1, 'operator requests must not consume Bridge and operator throttles twice');
});

test('canonical provider/domain facade also applies auth throttling only once', () => {
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, hipicoProviderRoutes, mutationRateLimit, hipicoCanonicalRoutes\);/);
  assert.equal((app.match(/app\.use\('\/api\/v1\/hipico', authRateLimit/g) || []).length, 1);
});
