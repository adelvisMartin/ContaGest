import test from 'node:test';
import assert from 'node:assert/strict';
import { createHorseRaceProvider, HorseRaceProviderError } from './hipico-race-provider.js';

const configuredEnv = {
  HIPICO_RACE_PROVIDER: 'sportradar-uof',
  HIPICO_RACE_PROVIDER_BASE_URL: 'https://global.stgapi.betradar.com',
  HIPICO_SPORTRADAR_UOF_TOKEN: 'test-token-not-a-real-secret',
  HIPICO_RACE_PROVIDER_TIMEOUT_MS: '2500',
  HIPICO_RACE_PROVIDER_CACHE_TTL_MS: '30000',
  HIPICO_RACE_PROVIDER_LANGUAGE: 'en',
  HIPICO_RACE_PROVIDER_FAILURE_THRESHOLD: '2',
  HIPICO_RACE_PROVIDER_BACKOFF_MS: '1000'
};

function isProviderError(code: HorseRaceProviderError['code']) {
  return (error: unknown) => error instanceof HorseRaceProviderError && error.code === code;
}

test('race provider opens the circuit after consecutive retryable failures without hammering upstream', async () => {
  let calls = 0;
  let clock = Date.parse('2026-09-11T18:00:00Z');
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      return new Response('temporary failure', { status: 503 });
    }
  });

  await assert.rejects(provider.getStageSummary('700001'), isProviderError('UPSTREAM_ERROR'));
  assert.equal(provider.status().circuitState, 'closed');
  assert.equal(provider.status().consecutiveFailures, 1);

  await assert.rejects(provider.getStageSummary('700002'), isProviderError('UPSTREAM_ERROR'));
  assert.equal(provider.status().circuitState, 'open');
  assert.equal(provider.status().retryAfterMs, 1000);
  assert.equal(calls, 2);

  await assert.rejects(provider.getStageSummary('700003'), isProviderError('CIRCUIT_OPEN'));
  assert.equal(calls, 2, 'open circuit must reject before issuing a new upstream request');

  clock += 999;
  await assert.rejects(provider.getStageSummary('700004'), isProviderError('CIRCUIT_OPEN'));
  assert.equal(calls, 2);
});

test('successful half-open probe closes the circuit and restores enrichment requests', async () => {
  let calls = 0;
  let clock = Date.parse('2026-09-11T18:00:00Z');
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      if (calls <= 2) return new Response('temporary failure', { status: 503 });
      return new Response('<sport_event_status status="closed"/>', {
        status: 200,
        headers: { 'content-type': 'application/xml' }
      });
    }
  });

  await assert.rejects(provider.getStageSummary('710001'), isProviderError('UPSTREAM_ERROR'));
  await assert.rejects(provider.getStageSummary('710002'), isProviderError('UPSTREAM_ERROR'));
  assert.equal(provider.status().circuitState, 'open');

  clock += 1000;
  assert.equal(provider.status().circuitState, 'half_open');
  const probe = await provider.getStageSummary('710003');
  assert.equal(probe.cached, false);
  assert.equal(provider.status().circuitState, 'closed');
  assert.equal(provider.status().consecutiveFailures, 0);

  await provider.getStageSummary('710004');
  assert.equal(calls, 4);
});

test('failed half-open probe reopens the circuit with exponential backoff', async () => {
  let calls = 0;
  let clock = Date.parse('2026-09-11T18:00:00Z');
  const provider = createHorseRaceProvider({
    env: {
      ...configuredEnv,
      HIPICO_RACE_PROVIDER_FAILURE_THRESHOLD: '1'
    },
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      return new Response('temporary failure', { status: 503 });
    }
  });

  await assert.rejects(provider.getStageSummary('720001'), isProviderError('UPSTREAM_ERROR'));
  assert.equal(provider.status().retryAfterMs, 1000);
  assert.equal(calls, 1);

  clock += 1000;
  await assert.rejects(provider.getStageSummary('720002'), isProviderError('UPSTREAM_ERROR'));
  assert.equal(calls, 2);
  assert.equal(provider.status().circuitState, 'open');
  assert.equal(provider.status().retryAfterMs, 2000);

  clock += 1999;
  await assert.rejects(provider.getStageSummary('720003'), isProviderError('CIRCUIT_OPEN'));
  assert.equal(calls, 2);
});

test('non-retryable malformed payload does not trip the closed circuit by itself', async () => {
  let calls = 0;
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    fetchImpl: async () => {
      calls += 1;
      return new Response('<html>proxy error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    }
  });

  for (let index = 0; index < 3; index += 1) {
    await assert.rejects(provider.getStageSummary(String(730000 + index)), isProviderError('UPSTREAM_INVALID_CONTENT'));
  }
  assert.equal(calls, 3);
  assert.equal(provider.status().circuitState, 'closed');
  assert.equal(provider.status().consecutiveFailures, 0);
});
