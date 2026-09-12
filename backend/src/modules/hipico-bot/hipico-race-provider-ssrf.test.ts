import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHorseRaceProvider,
  HorseRaceProviderError,
  providerAddressForbidden
} from './hipico-race-provider.js';

const configuredEnv = {
  HIPICO_RACE_PROVIDER: 'sportradar-uof',
  HIPICO_RACE_PROVIDER_BASE_URL: 'https://global.stgapi.betradar.com',
  HIPICO_SPORTRADAR_UOF_TOKEN: 'provider-token-1234567890',
  HIPICO_RACE_PROVIDER_TIMEOUT_MS: '2500',
  HIPICO_RACE_PROVIDER_CACHE_TTL_MS: '30000',
  HIPICO_RACE_PROVIDER_LANGUAGE: 'en'
};

test('provider destination policy rejects private reserved loopback link-local documentation and mapped addresses', () => {
  for (const address of [
    '127.0.0.1', '10.20.30.40', '169.254.169.254', '172.16.0.2', '192.168.1.20',
    '203.0.113.10', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:10.0.0.8'
  ]) {
    assert.equal(providerAddressForbidden(address), true, `${address} must be rejected`);
  }
  assert.equal(providerAddressForbidden('8.8.8.8'), false);
  assert.equal(providerAddressForbidden('2606:4700:4700::1111'), false);
});

test('provider rejects DNS rebinding/mixed public-private answers before fetch', async () => {
  let fetchCalls = 0;
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    resolveImpl: async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 }
    ],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('<sport_event_status status="closed"/>', {
        status: 200,
        headers: { 'content-type': 'application/xml' }
      });
    }
  });

  await assert.rejects(
    provider.getStageSummary('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError
      && error.code === 'UPSTREAM_ADDRESS_FORBIDDEN'
      && error.retryable === false
  );
  assert.equal(fetchCalls, 0);
});

test('DNS lookup failure and empty DNS answer fail closed without contacting upstream', async () => {
  for (const resolveImpl of [
    async () => { throw new Error('fixture dns unavailable'); },
    async () => [] as Array<{ address: string; family: number }>
  ]) {
    let fetchCalls = 0;
    const provider = createHorseRaceProvider({
      env: configuredEnv,
      resolveImpl,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('<sport_event_status status="closed"/>', {
          status: 200,
          headers: { 'content-type': 'application/xml' }
        });
      }
    });

    await assert.rejects(
      provider.getStageSummary('697758'),
      (error: unknown) => error instanceof HorseRaceProviderError
        && error.code === 'UPSTREAM_DNS_ERROR'
        && error.retryable === true
    );
    assert.equal(fetchCalls, 0);
  }
});
