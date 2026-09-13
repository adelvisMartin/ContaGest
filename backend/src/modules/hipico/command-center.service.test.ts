import assert from 'node:assert/strict';
import test from 'node:test';
import { projectHipicoCommandCenter, type CommandCenterProbe } from './command-center.service.js';

const success = <T>(value: T): CommandCenterProbe<T> => ({ available: true, value });
const failure = <T>(value: T): CommandCenterProbe<T> => ({ available: false, value });

const system = {
  ok: true,
  service: 'control-hipico',
  timestamp: '2026-09-13T17:00:00.000Z',
  version: { productVersion: '1.13.0-rc3', buildSha: 'fixture', apiVersion: '1', bridgeProtocolVersion: '1' },
  components: {
    backend: { state: 'ready', reason: null },
    database: { state: 'ready', reason: null },
    bridge: { state: 'ready', reason: null },
    channel: { state: 'ready', reason: null },
    providers: { state: 'ready', reason: null, financialAuthority: false },
    documentEngine: { state: 'ready', reason: null },
    agent: { state: 'ready', reason: null }
  }
} as any;

const provider = {
  provider: 'sportradar-uof',
  configured: true,
  enrichmentOnly: true,
  financialAuthority: false,
  reason: null,
  timeoutMs: 5_000,
  cacheTtlMs: 30_000
} as const;

function probes(overrides: Partial<Parameters<typeof projectHipicoCommandCenter>[0]['probes']> = {}) {
  return {
    channel: success<any[]>([]),
    queue: success<any[]>([]),
    shadow: success<any[]>([]),
    documents: success<any[]>([]),
    reconciliation: success<any[]>([]),
    races: success<any[]>([]),
    ...overrides
  };
}

test('Command Center distinguishes a successful empty read from an unavailable read', () => {
  const model = projectHipicoCommandCenter({
    scope: { ownerId: '11111111-1111-4111-8111-111111111111', groupKey: 'group-a' },
    system,
    provider,
    promotion: 'shadow',
    sampledAt: '2026-09-13T17:00:00.000Z',
    probes: probes()
  });

  assert.equal(model.queue.available, true);
  assert.equal(model.queue.state, 'ready');
  assert.equal(model.queue.total, 0);
  assert.equal(model.documents.available, true);
  assert.equal(model.documents.total, 0);
  assert.equal(model.agent.evaluations.available, true);
  assert.equal(model.conflicts.available, true);
  assert.equal(model.races.available, true);
  assert.doesNotMatch(model.alerts.join(','), /READ_UNAVAILABLE/);
});

test('Command Center fails closed when operational PostgreSQL read models are unavailable', () => {
  const model = projectHipicoCommandCenter({
    scope: { ownerId: '11111111-1111-4111-8111-111111111111', groupKey: 'group-a' },
    system,
    provider,
    promotion: 'shadow',
    sampledAt: '2026-09-13T17:00:00.000Z',
    probes: probes({
      channel: failure<any[]>([]),
      queue: failure<any[]>([]),
      shadow: failure<any[]>([]),
      documents: failure<any[]>([]),
      reconciliation: failure<any[]>([]),
      races: failure<any[]>([])
    })
  });

  assert.equal(model.channel.available, false);
  assert.equal(model.channel.state, 'unavailable');
  assert.equal(model.queue.available, false);
  assert.equal(model.queue.state, 'unavailable');
  assert.equal(model.queue.total, null);
  assert.equal(model.documents.available, false);
  assert.equal(model.documents.state, 'unavailable');
  assert.equal(model.documents.total, null);
  assert.equal(model.agent.state, 'unavailable');
  assert.equal(model.agent.evaluations.available, false);
  assert.equal(model.conflicts.available, false);
  assert.equal(model.conflicts.reconciliationRequired, null);
  assert.equal(model.races.available, false);
  assert.equal(model.races.total, null);
  assert.deepEqual(new Set(model.alerts), new Set([
    'CHANNEL_READ_UNAVAILABLE',
    'OUTBOX_READ_UNAVAILABLE',
    'SHADOW_READ_UNAVAILABLE',
    'DOCUMENT_READ_UNAVAILABLE',
    'RECONCILIATION_READ_UNAVAILABLE',
    'RACE_READ_UNAVAILABLE'
  ]));
});

test('provider status remains explicitly enrichment-only and does not invent breaker telemetry', () => {
  const model = projectHipicoCommandCenter({
    scope: { ownerId: '11111111-1111-4111-8111-111111111111', groupKey: 'group-a' },
    system,
    provider,
    promotion: 'shadow',
    sampledAt: '2026-09-13T17:00:00.000Z',
    probes: probes()
  });

  assert.equal(model.providers.configured, true);
  assert.equal(model.providers.enrichmentOnly, true);
  assert.equal(model.providers.financialAuthority, false);
  assert.equal(model.providers.runtimeTelemetryAvailable, false);
  assert.equal(model.providers.circuitState, 'not_exposed');
  assert.equal(model.providers.retryAfterMs, null);
});
