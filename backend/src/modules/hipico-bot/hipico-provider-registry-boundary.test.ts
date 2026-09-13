import test from 'node:test';
import assert from 'node:assert/strict';
import { createHipicoProviderRegistry, type HipicoRaceDataAdapter } from './hipico-provider-registry.js';

test('registry pins public provider and stage identity to configuration/request and strips adapter extras', async () => {
  const adapter = {
    name: 'mock-feed',
    status: () => ({
      provider: 'unexpected-provider', configured: true, reason: null,
      enrichmentOnly: true, financialAuthority: false, effectsAllowed: false
    }),
    getLiveStage: async () => ({
      provider: 'unexpected-provider',
      stageId: 'other-stage',
      fetchedAt: '2026-09-12T15:00:00.000Z',
      cached: false,
      stale: false,
      providerStatus: 'official',
      enrichmentOnly: true,
      financialAuthority: false,
      effectsAllowed: false,
      manualReviewRequired: true,
      fallback: null,
      raw: { secret: 'must-not-cross-boundary' },
      xml: '<private/>'
    })
  } as unknown as HipicoRaceDataAdapter;

  const registry = createHipicoProviderRegistry({
    env: { HIPICO_RACE_PROVIDER: 'mock-feed' },
    adapters: [adapter]
  });
  const snapshot = await registry.getLiveStage('requested-stage');

  assert.equal(snapshot.provider, 'mock-feed');
  assert.equal(snapshot.stageId, 'requested-stage');
  assert.equal('raw' in snapshot, false);
  assert.equal('xml' in snapshot, false);
  assert.equal(JSON.stringify(snapshot).includes('must-not-cross-boundary'), false);
});
