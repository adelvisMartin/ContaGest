import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHipicoCommandCenter } from './command-center.service.js';

const source = readFileSync(new URL('./command-center.service.ts', import.meta.url), 'utf8');
const scope = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  groupKey: 'club-hipico-triple-crown-official',
  groupId: '120363111111111111@g.us'
};

function system(bridgeState: 'degraded'|'ready'|'not_configured' = 'degraded') {
  return {
    ok: true,
    version: { productVersion: 'test', buildSha: 'abc', apiVersion: '1', bridgeProtocolVersion: '1' },
    components: {
      backend: { state: 'ready', reason: null },
      database: { state: 'ready', reason: null },
      bridge: { state: bridgeState, reason: bridgeState === 'degraded' ? 'BRIDGE_CONFIGURED_NOT_PROBED' : null },
      channel: { state: 'degraded', reason: 'CHANNEL_PINNED_NOT_PROBED' },
      providers: { state: 'degraded', reason: 'PROVIDER_CONFIGURED_NOT_PROBED', financialAuthority: false },
      documentEngine: { state: 'degraded', reason: 'DOCUMENT_ENGINE_INSTALLED_NOT_PROBED' },
      agent: { state: 'degraded', reason: 'AGENT_ENGINE_INSTALLED_NOT_PROBED' }
    }
  } as any;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => new Date('2026-09-13T19:00:00.000Z'),
    systemStatus: async () => system(),
    meetings: async () => [],
    races: async () => [],
    documents: async () => [],
    providers: async () => [],
    channels: async () => [],
    queueStates: async () => [],
    documentStates: async () => [],
    conflicts: async () => ({ reconciliations: 0, rejectedTransitions: 0, agentConflicts: 0 }),
    lastBridgeEvent: async () => null,
    agentState: async () => ({ mode: 'SHADOW', metrics: { reviewed: 10, matched: 10, highRiskFalsePositive: 0, unauthorizedAction: 0, conflicts: 0 } }),
    ...overrides
  } as any;
}

void test('configured but unprobed Bridge remains degraded rather than being relabeled not_configured', async () => {
  const result = await buildHipicoCommandCenter(scope, dependencies());
  assert.equal(result.bridge.state, 'degraded');
  assert.equal(result.bridge.configuredState, 'degraded');
  assert.equal(result.bridge.sourceSendPossible, false);
});

void test('failed reads remain explicitly unavailable and never become healthy zero counts', async () => {
  const result = await buildHipicoCommandCenter(scope, dependencies({
    queueStates: async () => { throw new Error('queue unavailable'); },
    documentStates: async () => { throw new Error('documents unavailable'); },
    providers: async () => { throw new Error('provider unavailable'); }
  }));

  assert.equal(result.queue.state, 'unavailable');
  assert.equal(result.queue.pending, null);
  assert.equal(result.queue.failed, null);
  assert.equal(result.documents.state, 'unavailable');
  assert.equal(result.providers.state, 'unavailable');
  assert.ok(result.alerts.some((alert) => alert.code === 'QUEUE_READ_UNAVAILABLE'));
  assert.ok(result.alerts.some((alert) => alert.code === 'DOCUMENT_READ_UNAVAILABLE'));
  assert.ok(result.alerts.some((alert) => alert.code === 'PROVIDER_READ_UNAVAILABLE'));
});

void test('fresh bridge event can make runtime bridge ready without changing configured system evidence', async () => {
  const result = await buildHipicoCommandCenter(scope, dependencies({
    lastBridgeEvent: async () => new Date('2026-09-13T18:59:30.000Z')
  }));
  assert.equal(result.bridge.state, 'ready');
  assert.equal(result.bridge.configuredState, 'degraded');
  assert.equal(result.bridge.ageMs, 30_000);
});

void test('missing selected group keeps agent disabled/not-configured instead of querying cross-group metrics', async () => {
  let calls = 0;
  const result = await buildHipicoCommandCenter({ ...scope, groupId: null }, dependencies({
    agentState: async () => { calls += 1; return { mode: 'SHADOW', metrics: {} }; }
  }));
  assert.equal(calls, 0);
  assert.equal(result.agent.state, 'not_configured');
  assert.equal(result.agent.reason, 'GROUP_ID_NOT_SELECTED');
});

void test('Command Center channel read is isolated by owner and group key', () => {
  assert.match(
    source,
    /FROM public\.hipico_bot_channels[\s\S]{0,220}WHERE owner_id = \$\{scope\.ownerId\}::uuid AND group_key = \$\{scope\.groupKey\}/
  );
});
