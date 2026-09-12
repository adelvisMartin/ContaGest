import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { operationalWorkspaceContext, renderCommandCenterModel } from '../frontend/public/hipico-control/assets/js/command-center.js';
import { projectCommandCenter } from '../frontend/api/hipico/command-center.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function workspace() {
  return {
    config: {
      groups: [{ id: 'g-a', name: 'Grupo A', active: true }],
      activeGroupId: 'g-a',
      activeRaceByGroup: { 'g-a': 'race-2' }
    },
    days: [{ id: 'day-1', groupId: 'g-a', date: '2026-09-12', status: 'open' }],
    races: [
      { id: 'race-1', groupId: 'g-a', dayId: 'day-1', number: 1, racetrack: 'Parx Racing', status: 'closed' },
      { id: 'race-2', groupId: 'g-a', dayId: 'day-1', number: 2, racetrack: 'Parx Racing', status: 'open' },
      { id: 'race-3', groupId: 'g-a', dayId: 'day-1', number: 3, racetrack: 'Parx Racing', status: 'pending' }
    ],
    syncQueue: [{ id: 'q1' }],
    syncMeta: { conflictSnapshots: 2 }
  };
}

test('workspace Command Center context is derived from the active group/meeting/current race without invented data', () => {
  const context = operationalWorkspaceContext(workspace());
  assert.equal(context.group.id, 'g-a');
  assert.equal(context.meeting.id, 'day-1');
  assert.equal(context.currentRace.id, 'race-2');
  assert.equal(context.nextRace.id, 'race-3');
  assert.equal(context.localQueue, 1);
  assert.equal(context.localConflicts, 2);
});

test('server projection exposes only aggregate operational status and never raw outbox/message data', () => {
  const model = projectCommandCenter({
    backendStatus: { ok: true, data: { dbReady: true, groupAutomation: 'bridge-required', groupQaMode: 'shadow-only', targetSupport: ['individual'], promotion: { mode: 'shadow' }, raceProvider: { provider: 'disabled', configured: false, enrichmentOnly: true, financialAuthority: false, circuitState: 'closed', retryAfterMs: 0, consecutiveFailures: 0 } } },
    outbox: { ok: true, data: [
      { id: 'o1', status: 'pending_approval', message: 'SECRET-MESSAGE', recipient: '584121234567' },
      { id: 'o2', status: 'reconciliation_required', message: 'OTHER-SECRET', recipient: '584121234568' }
    ] },
    shadow: { ok: true, data: { counts: { pending: 4, matched: 2 } } },
    bridge: { ready: true, tokenStrong: true, identityReady: true, persistenceReady: true },
    sampledAt: '2026-09-12T15:00:00.000Z'
  });
  assert.equal(model.database.state, 'ready');
  assert.equal(model.bridge.state, 'ready');
  assert.equal(model.agent.mode, 'shadow');
  assert.equal(model.queue.total, 2);
  assert.equal(model.conflicts.reconciliationRequired, 1);
  assert.equal(model.documents.state, 'not_exposed');
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /SECRET-MESSAGE|OTHER-SECRET|58412123456/);
});

test('Command Center rendering exposes explicit unknown/offline states instead of decorative green KPIs', () => {
  const local = operationalWorkspaceContext(workspace());
  const html = renderCommandCenterModel({ local, remote: null, online: false, error: 'offline' });
  assert.match(html, /Centro de operaciones/);
  assert.match(html, /Sistema/);
  assert.match(html, /Bridge/);
  assert.match(html, /Canal/);
  assert.match(html, /Base de datos/);
  assert.match(html, /Proveedor/);
  assert.match(html, /Agente/);
  assert.match(html, /Documentos/);
  assert.match(html, /Cola/);
  assert.match(html, /Conflictos/);
  assert.match(html, /Alertas/);
  assert.match(html, /Sin conexión|No verificado/);
  assert.match(html, /Grupo A/);
  assert.match(html, /Parx Racing/);
});

test('PWA mounts Command Center module and service worker keeps it available offline', async () => {
  const [html, sw, endpoint] = await Promise.all([
    read('frontend/public/hipico-control/index.html'),
    read('frontend/public/hipico-control/sw.js'),
    read('frontend/api/hipico/command-center.js')
  ]);
  assert.match(html, /assets\/js\/command-center\.js/);
  assert.match(sw, /assets\/js\/command-center\.js/);
  assert.match(endpoint, /HIPICO_OPERATOR_CONTROL_TOKEN/);
  assert.match(endpoint, /HIPICO_BOT_OPERATOR_TOKEN/);
  assert.match(endpoint, /x-hipico-operator-token/);
  assert.match(endpoint, /\/api\/v1\/hipico-bot\/status/);
  assert.match(endpoint, /\/api\/v1\/hipico-bot\/outbox\?limit=/);
  assert.doesNotMatch(endpoint, /recipient\s*:/);
  assert.doesNotMatch(endpoint, /message\s*:/);
});
