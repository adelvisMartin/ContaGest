import test from 'node:test';
import assert from 'node:assert/strict';
import { createHorseRaceProvider, HorseRaceProviderError, raceProviderStatus } from './hipico-race-provider.js';

const configuredEnv = {
  HIPICO_RACE_PROVIDER: 'sportradar-uof',
  HIPICO_RACE_PROVIDER_BASE_URL: 'https://global.stgapi.betradar.com',
  HIPICO_SPORTRADAR_UOF_TOKEN: 'test-token-not-a-real-secret',
  HIPICO_RACE_PROVIDER_TIMEOUT_MS: '2500',
  HIPICO_RACE_PROVIDER_CACHE_TTL_MS: '30000',
  HIPICO_RACE_PROVIDER_LANGUAGE: 'en'
};

test('external race provider is disabled and non-authoritative by default', () => {
  const status = raceProviderStatus({});
  assert.equal(status.provider, 'disabled');
  assert.equal(status.configured, false);
  assert.equal(status.enrichmentOnly, true);
  assert.equal(status.financialAuthority, false);
  assert.equal(status.reason, 'RACE_PROVIDER_DISABLED');
});

test('sportradar provider only becomes configured with explicit HTTPS base URL and token', () => {
  assert.equal(raceProviderStatus({ HIPICO_RACE_PROVIDER: 'sportradar-uof' }).configured, false);
  assert.equal(raceProviderStatus({ ...configuredEnv, HIPICO_RACE_PROVIDER_BASE_URL: 'http://example.test' }).configured, false);
  const status = raceProviderStatus(configuredEnv);
  assert.equal(status.configured, true);
  assert.equal(status.reason, null);
  assert.equal(JSON.stringify(status).includes(configuredEnv.HIPICO_SPORTRADAR_UOF_TOKEN), false);
});

test('stage lookup rejects non-numeric identifiers before any upstream request', async () => {
  let calls = 0;
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    fetchImpl: async () => { calls += 1; return new Response('<ok/>'); }
  });
  await assert.rejects(
    provider.getStageSummary('../admin'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'INVALID_STAGE_ID' && error.retryable === false
  );
  assert.equal(calls, 0);
});

test('stage summary uses authenticated UOF REST enrichment and caches successful response', async () => {
  let calls = 0;
  let observedUrl = '';
  let observedToken = '';
  let clock = Date.parse('2026-09-10T23:00:00Z');
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    now: () => clock,
    fetchImpl: async (input, init) => {
      calls += 1;
      observedUrl = String(input);
      observedToken = new Headers(init?.headers).get('x-access-token') || '';
      return new Response('<sport_event_status status="closed"/>', { status: 200, headers: { 'content-type': 'application/xml' } });
    }
  });

  const first = await provider.getStageSummary('697758');
  const second = await provider.getStageSummary('697758');
  assert.equal(calls, 1);
  assert.equal(observedUrl, 'https://global.stgapi.betradar.com/v1/sports/en/sport_events/sr:stage:697758/summary.xml');
  assert.equal(observedToken, configuredEnv.HIPICO_SPORTRADAR_UOF_TOKEN);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.provider, 'sportradar-uof');
  assert.equal(first.stageId, '697758');
  assert.match(first.xml, /sport_event_status/);

  clock += 30_001;
  await provider.getStageSummary('697758');
  assert.equal(calls, 2);
});

test('upstream server errors remain retryable and never become financial decisions', async () => {
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    fetchImpl: async () => new Response('unavailable', { status: 503 })
  });
  await assert.rejects(
    provider.getStageSummary('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'UPSTREAM_ERROR' && error.retryable === true
  );
  const status = provider.status();
  assert.equal(status.enrichmentOnly, true);
  assert.equal(status.financialAuthority, false);
});
