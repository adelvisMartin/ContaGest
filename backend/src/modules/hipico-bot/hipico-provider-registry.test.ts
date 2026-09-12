import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHipicoProviderRegistry,
  type HipicoRaceDataAdapter,
  type HipicoLiveStageSnapshot
} from './hipico-provider-registry.js';
import { HorseRaceProviderError } from './hipico-race-provider.js';

const baseStatus = {
  provider: 'sportradar-uof' as const,
  configured: true,
  enrichmentOnly: true as const,
  financialAuthority: false as const,
  reason: null,
  timeoutMs: 2500,
  cacheTtlMs: 30000,
  circuitState: 'closed' as const,
  retryAfterMs: 0,
  consecutiveFailures: 0
};

test('default vendor adapter normalizes transport payload and never exposes raw XML', async () => {
  const registry = createHipicoProviderRegistry({
    env: { HIPICO_RACE_PROVIDER: 'sportradar-uof', HIPICO_RACE_PROVIDER_STALE_TTL_MS: '120000' },
    createDefaultTransport: () => ({
      status: () => baseStatus,
      getStageSummary: async () => ({
        provider: 'sportradar-uof' as const,
        stageId: '697758',
        fetchedAt: '2026-09-12T15:00:00.000Z',
        contentType: 'application/xml',
        xml: '<sport_event_status status="closed"><private vendor="secret-shape"/></sport_event_status>',
        cached: false
      })
    })
  });

  const snapshot = await registry.getLiveStage('697758');
  assert.equal(snapshot.provider, 'sportradar-uof');
  assert.equal(snapshot.stageId, '697758');
  assert.equal(snapshot.providerStatus, 'closed');
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.effectsAllowed, false);
  assert.equal(snapshot.financialAuthority, false);
  assert.equal(snapshot.manualReviewRequired, true);
  assert.equal('xml' in snapshot, false);
  assert.equal('raw' in snapshot, false);
  assert.equal(JSON.stringify(snapshot).includes('secret-shape'), false);
});

test('registry selects an alternate adapter by configuration without changing the domain DTO', async () => {
  const expected: HipicoLiveStageSnapshot = {
    provider: 'mock-feed',
    stageId: '42',
    fetchedAt: '2026-09-12T15:05:00.000Z',
    cached: false,
    stale: false,
    providerStatus: 'official',
    enrichmentOnly: true,
    financialAuthority: false,
    effectsAllowed: false,
    manualReviewRequired: true,
    fallback: null
  };
  const mock: HipicoRaceDataAdapter = {
    name: 'mock-feed',
    status: () => ({
      provider: 'mock-feed', configured: true, reason: null,
      enrichmentOnly: true, financialAuthority: false, effectsAllowed: false
    }),
    getLiveStage: async () => expected
  };
  const registry = createHipicoProviderRegistry({
    env: { HIPICO_RACE_PROVIDER: 'mock-feed' },
    adapters: [mock]
  });

  assert.deepEqual(await registry.getLiveStage('42'), expected);
  assert.equal(registry.status().provider, 'mock-feed');
});

test('retryable provider failure falls back to bounded last-good cache and remains manual-only', async () => {
  let clock = Date.parse('2026-09-12T15:00:00.000Z');
  let calls = 0;
  const registry = createHipicoProviderRegistry({
    env: { HIPICO_RACE_PROVIDER: 'sportradar-uof', HIPICO_RACE_PROVIDER_STALE_TTL_MS: '60000' },
    now: () => clock,
    createDefaultTransport: () => ({
      status: () => baseStatus,
      getStageSummary: async () => {
        calls += 1;
        if (calls > 1) throw new HorseRaceProviderError('fixture unavailable', 'UPSTREAM_ERROR', true);
        return {
          provider: 'sportradar-uof' as const,
          stageId: '697758',
          fetchedAt: new Date(clock).toISOString(),
          contentType: 'application/xml',
          xml: '<sport_event_status status="closed"/>',
          cached: false
        };
      }
    })
  });

  const fresh = await registry.getLiveStage('697758');
  assert.equal(fresh.stale, false);
  clock += 30_000;
  const fallback = await registry.getLiveStage('697758');
  assert.equal(fallback.stale, true);
  assert.equal(fallback.cached, true);
  assert.equal(fallback.fallback, 'stale-cache');
  assert.equal(fallback.manualReviewRequired, true);
  assert.equal(fallback.effectsAllowed, false);
  assert.equal(fallback.financialAuthority, false);
});

test('expired fallback is never served after its bounded stale window', async () => {
  let clock = Date.parse('2026-09-12T15:00:00.000Z');
  let calls = 0;
  const registry = createHipicoProviderRegistry({
    env: { HIPICO_RACE_PROVIDER: 'sportradar-uof', HIPICO_RACE_PROVIDER_STALE_TTL_MS: '1000' },
    now: () => clock,
    createDefaultTransport: () => ({
      status: () => baseStatus,
      getStageSummary: async () => {
        calls += 1;
        if (calls > 1) throw new HorseRaceProviderError('fixture unavailable', 'UPSTREAM_ERROR', true);
        return {
          provider: 'sportradar-uof' as const,
          stageId: '697758',
          fetchedAt: new Date(clock).toISOString(),
          contentType: 'application/xml',
          xml: '<sport_event_status status="closed"/>',
          cached: false
        };
      }
    })
  });

  await registry.getLiveStage('697758');
  clock += 1_001;
  await assert.rejects(
    registry.getLiveStage('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'UPSTREAM_ERROR'
  );
});
