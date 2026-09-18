import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-operator.routes.ts', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../backend/src/modules/hipico-bot/hipico-provider-registry.ts', import.meta.url), 'utf8');

test('operator race-provider API consumes the normalized provider registry instead of exposing vendor transport payloads', () => {
  assert.match(routes, /hipicoProviderRegistry/);
  assert.match(routes, /hipicoProviderHttpStatus/);
  assert.match(routes, /hipicoProviderPublicError/);
  assert.match(routes, /raceProvider\.getLiveStage/);
  assert.doesNotMatch(routes, /createHorseRaceProvider/);
  const providerBlock=routes.slice(routes.indexOf("router.get('/race-provider/status'"),routes.indexOf("router.get('/events'"));
  assert.doesNotMatch(providerBlock, /data:\s*\{\s*\.\.\.result/);
});

test('provider registry public DTO remains enrichment-only, manual-review and raw-vendor free', () => {
  assert.match(registry, /financialAuthority:\s*false/);
  assert.match(registry, /effectsAllowed:\s*false/);
  assert.match(registry, /manualReviewRequired:\s*true/);
  assert.match(registry, /fallback:\s*'stale-cache'/);
  assert.doesNotMatch(registry, /return\s*\{[^}]*xml\s*:/s);
});
