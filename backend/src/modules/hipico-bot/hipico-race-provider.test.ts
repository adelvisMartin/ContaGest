import test from 'node:test';
import assert from 'node:assert/strict';
import { createHorseRaceProvider, HorseRaceProviderError, MAX_RACE_PROVIDER_CACHE_ENTRIES, MAX_RACE_PROVIDER_RESPONSE_BYTES, raceProviderStatus } from './hipico-race-provider.js';

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

test('sportradar provider only becomes configured with explicit vendor HTTPS origin and token', () => {
  assert.equal(raceProviderStatus({ HIPICO_RACE_PROVIDER: 'sportradar-uof' }).configured, false);
  assert.equal(raceProviderStatus({ ...configuredEnv, HIPICO_RACE_PROVIDER_BASE_URL: 'http://global.stgapi.betradar.com' }).configured, false);
  assert.equal(raceProviderStatus({ ...configuredEnv, HIPICO_RACE_PROVIDER_BASE_URL: 'https://example.test' }).configured, false);
  assert.equal(raceProviderStatus({ ...configuredEnv, HIPICO_RACE_PROVIDER_BASE_URL: 'https://betradar.com.example.test' }).configured, false);
  assert.equal(raceProviderStatus({ ...configuredEnv, HIPICO_RACE_PROVIDER_BASE_URL: 'https://global.stgapi.betradar.com:444' }).configured, false);
  assert.equal(raceProviderStatus({ ...configuredEnv, HIPICO_RACE_PROVIDER_BASE_URL: 'https://user:pass@global.stgapi.betradar.com' }).configured, false);
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

test('stage summary uses authenticated UOF REST enrichment, forbids redirects and caches successful response', async () => {
  let calls = 0;
  let observedUrl = '';
  let observedToken = '';
  let observedRedirect = '';
  let clock = Date.parse('2026-09-10T23:00:00Z');
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    now: () => clock,
    fetchImpl: async (input, init) => {
      calls += 1;
      observedUrl = String(input);
      observedToken = new Headers(init?.headers).get('x-access-token') || '';
      observedRedirect = String(init?.redirect || '');
      return new Response('<sport_event_status status="closed"/>', { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8' } });
    }
  });

  const first = await provider.getStageSummary('697758');
  const second = await provider.getStageSummary('697758');
  assert.equal(calls, 1);
  assert.equal(observedUrl, 'https://global.stgapi.betradar.com/v1/sports/en/sport_events/sr:stage:697758/summary.xml');
  assert.equal(observedToken, configuredEnv.HIPICO_SPORTRADAR_UOF_TOKEN);
  assert.equal(observedRedirect, 'error');
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.provider, 'sportradar-uof');
  assert.equal(first.stageId, '697758');
  assert.equal(first.contentType, 'application/xml');
  assert.match(first.xml, /sport_event_status/);

  clock += 30_001;
  await provider.getStageSummary('697758');
  assert.equal(calls, 2);
});

test('race provider rejects non-XML or doctype responses and never caches them', async () => {
  let calls = 0;
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('<html>proxy error</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('<!DOCTYPE foo><sport_event_status/>', { status: 200, headers: { 'content-type': 'application/xml' } });
    }
  });
  await assert.rejects(
    provider.getStageSummary('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'UPSTREAM_INVALID_CONTENT' && error.retryable === false
  );
  await assert.rejects(
    provider.getStageSummary('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'UPSTREAM_INVALID_CONTENT' && error.retryable === false
  );
  assert.equal(calls, 2);
});

test('race enrichment cache remains bounded under many distinct stage ids', async () => {
  let calls = 0;
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    now: () => Date.parse('2026-09-10T23:00:00Z'),
    fetchImpl: async () => { calls += 1; return new Response('<ok/>', { status: 200, headers: { 'content-type': 'application/xml' } }); }
  });
  for (let index = 1; index <= MAX_RACE_PROVIDER_CACHE_ENTRIES + 2; index += 1) {
    await provider.getStageSummary(String(700000 + index));
  }
  assert.equal(calls, MAX_RACE_PROVIDER_CACHE_ENTRIES + 2);
  await provider.getStageSummary('700001');
  assert.equal(calls, MAX_RACE_PROVIDER_CACHE_ENTRIES + 3);
});

test('declared oversized upstream response is rejected before body consumption', async () => {
  let readerRequested = false;
  let textCalled = false;
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/xml',
      'content-length': String(MAX_RACE_PROVIDER_RESPONSE_BYTES + 1)
    }),
    body: {
      getReader() {
        readerRequested = true;
        throw new Error('oversized response body must not be read');
      }
    },
    async text() {
      textCalled = true;
      throw new Error('oversized response text must not be read');
    }
  } as unknown as Response;
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    fetchImpl: async () => response
  });
  await assert.rejects(
    provider.getStageSummary('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'UPSTREAM_RESPONSE_TOO_LARGE' && error.retryable === false
  );
  assert.equal(readerRequested, false);
  assert.equal(textCalled, false);
});

test('streaming upstream response is cancelled as soon as byte limit is crossed', async () => {
  let cancelled = false;
  let emitted = 0;
  const chunk = new Uint8Array(260_000);
  const body = new ReadableStream({
    pull(controller) {
      emitted += 1;
      controller.enqueue(chunk);
      if (emitted > 10) controller.close();
    },
    cancel() {
      cancelled = true;
    }
  });
  const provider = createHorseRaceProvider({
    env: configuredEnv,
    fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } })
  });
  await assert.rejects(
    provider.getStageSummary('697758'),
    (error: unknown) => error instanceof HorseRaceProviderError && error.code === 'UPSTREAM_RESPONSE_TOO_LARGE' && error.retryable === false
  );
  assert.equal(cancelled, true);
  assert.ok(emitted <= 5);
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
