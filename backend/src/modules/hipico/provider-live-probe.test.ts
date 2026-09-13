import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLiveProbeStageId,
  probeRacingProvider,
  sanitizeLiveProbeFailure
} from '../../../scripts/hipico-provider-live-probe.js';
import type { RacingDataProvider } from './racing-provider.js';

test('live probe rejects missing or malformed stage ids before any provider call', () => {
  for (const value of ['', 'sr:stage:123', '../123', '123?token=secret', '1234567890123456789']) {
    assert.throws(() => parseLiveProbeStageId(value), /HIPICO_LIVE_PROBE_STAGE_ID_INVALID/);
  }
  assert.equal(parseLiveProbeStageId('697758'), '697758');
});

test('live probe emits only normalized bounded metadata with financial authority disabled', async () => {
  let calls = 0;
  const provider = {
    id: 'fixture-provider',
    async health() {
      return {
        id: 'fixture-provider', configured: true, state: 'ready', reason: null,
        capabilities: ['getRace'], financialAuthority: false
      };
    },
    async getRace(id: string) {
      calls += 1;
      return {
        data: {
          id: `race-${id}`, meetingId: null, name: 'Fixture Race', scheduledAt: null,
          status: 'closed', runners: [{ id: 'r1', name: 'UNO', number: '1', status: 'declared' }],
          result: { raceId: `race-${id}`, status: 'closed', positions: [{ position: 1, runnerId: 'r1', runnerName: 'UNO' }] }
        },
        provenance: {
          provider: 'fixture-provider', source: `fixture:${id}`,
          sourceTimestamp: '2026-09-13T18:00:00.000Z', fetchedAt: '2026-09-13T18:00:01.000Z',
          freshness: 'LIVE', officiality: 'verified', authority: 'external_provider',
          confidence: null, financialAuthority: false
        }
      };
    }
  } as unknown as RacingDataProvider;

  const result = await probeRacingProvider(provider, '697758');
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    ok: true,
    provider: 'fixture-provider',
    raceId: 'race-697758',
    status: 'closed',
    runnerCount: 1,
    hasResult: true,
    sourceTimestamp: '2026-09-13T18:00:00.000Z',
    fetchedAt: '2026-09-13T18:00:01.000Z',
    freshness: 'LIVE',
    officiality: 'verified',
    financialAuthority: false
  });
  assert.equal(JSON.stringify(result).includes('token'), false);
  assert.equal(JSON.stringify(result).includes('xml'), false);
});

test('live probe failure output never serializes upstream error messages or secrets', () => {
  const failure = sanitizeLiveProbeFailure(Object.assign(
    new Error('token=super-secret raw=<xml>private</xml>'),
    { code: 'UPSTREAM_ERROR', retryable: true }
  ));
  assert.deepEqual(failure, { ok: false, code: 'UPSTREAM_ERROR', retryable: true });
  assert.equal(JSON.stringify(failure).includes('super-secret'), false);
  assert.equal(JSON.stringify(failure).includes('<xml>'), false);
});
