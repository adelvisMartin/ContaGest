import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkspaces } from '../frontend/public/hipico-control/assets/js/sync.js';
import { normalizeWorkspaceShape } from '../frontend/public/hipico-control/assets/js/workspace.js';
import { assertWorkspaceInputSafety, __test__ } from '../frontend/public/hipico-control/assets/js/workspace-input-safety.js';

function workspace(overrides = {}) {
  return {
    config: {
      groups: [{ id: 'group-1', name: 'Grupo 1' }],
      activeGroupId: 'group-1',
      activeWhatsappGroupId: 'group-1',
      activeRaceByGroup: {},
      captureGroupIds: ['group-1']
    },
    participants: [], days: [], races: [], advancedBets: [], movements: [],
    exchangeRates: [], weekClosures: [], pollas: [], audit: [], syncQueue: [], chatImports: [],
    activeRaceId: null, version: 1, updatedAt: '2026-09-11T20:00:00.000Z', syncMeta: {},
    ...overrides
  };
}

test('valid cloud/local workspaces merge and remain structurally safe', () => {
  const local = workspace({ version: 2, updatedAt: '2026-09-11T20:01:00.000Z' });
  const remote = workspace({ version: 3, updatedAt: '2026-09-11T20:02:00.000Z' });
  const merged = mergeWorkspaces(local, remote);
  assert.doesNotThrow(() => assertWorkspaceInputSafety(merged));
  assert.equal(merged.version, 4);
});

test('hostile remote identifiers are rejected before cloud merge', () => {
  const remote = workspace();
  remote.config.groups[0].id = 'group-1\" onclick=alert(1)';
  assert.throws(
    () => mergeWorkspaces(workspace(), remote),
    (error) => error?.code === 'HIPICO_WORKSPACE_UNSAFE_IDENTIFIER'
  );
});

test('hostile local or backup identifiers are rejected by canonical normalization before render', () => {
  const imported = workspace();
  imported.config.groups[0].id = 'group-1\" onpointerenter=alert(1)';
  imported.config.activeGroupId = imported.config.groups[0].id;
  imported.config.activeWhatsappGroupId = imported.config.groups[0].id;
  imported.config.captureGroupIds = [imported.config.groups[0].id];
  assert.throws(
    () => normalizeWorkspaceShape(imported),
    (error) => error?.code === 'HIPICO_WORKSPACE_UNSAFE_IDENTIFIER'
  );
});

test('duplicate group ids fail closed before UI or sync can alias tenants', () => {
  const imported = workspace({
    config: {
      groups: [{ id: 'group-1', name: 'A' }, { id: 'group-1', name: 'B' }],
      activeGroupId: 'group-1', activeWhatsappGroupId: 'group-1', activeRaceByGroup: {}, captureGroupIds: ['group-1']
    }
  });
  assert.throws(
    () => normalizeWorkspaceShape(imported),
    (error) => error?.code === 'HIPICO_WORKSPACE_DUPLICATE_GROUP'
  );
});

test('known-looking but nonexistent group references fail closed', () => {
  const imported = workspace({
    participants: [{ id: 'participant-1', groupId: 'group-ghost', name: 'Fantasma' }]
  });
  assert.throws(
    () => normalizeWorkspaceShape(imported),
    (error) => error?.code === 'HIPICO_WORKSPACE_UNKNOWN_GROUP'
  );
});

test('cloud merge keeps older group definitions required by scoped records', () => {
  const local = workspace({
    config: {
      groups: [
        { id: 'group-1', name: 'Grupo 1' },
        { id: 'group-2', name: 'Grupo 2' },
        { id: 'group-3', name: 'Grupo histórico' }
      ],
      activeGroupId: 'group-1',
      activeWhatsappGroupId: 'group-1',
      activeRaceByGroup: {},
      captureGroupIds: ['group-1']
    },
    participants: [{ id: 'participant-42', groupId: 'group-3', name: 'Histórico', updatedAt: '2026-09-24T12:28:00.000Z' }],
    updatedAt: '2026-09-24T12:28:00.000Z'
  });
  const remote = workspace({
    config: {
      groups: [
        { id: 'group-1', name: 'Grupo 1 nube' },
        { id: 'group-2', name: 'Grupo 2 nube' }
      ],
      activeGroupId: 'group-1',
      activeWhatsappGroupId: 'group-1',
      activeRaceByGroup: {},
      captureGroupIds: ['group-1']
    },
    updatedAt: '2026-09-24T12:29:35.000Z'
  });

  const merged = mergeWorkspaces(local, remote);

  assert.equal(merged.config.groups.some((group) => group.id === 'group-3'), true);
  assert.equal(merged.participants.find((row) => row.id === 'participant-42')?.groupId, 'group-3');
  assert.doesNotThrow(() => assertWorkspaceInputSafety(merged));
});

test('stale local registry can recover when cloud knows the referenced group', () => {
  const local = workspace({
    config: {
      groups: [{ id: 'group-1', name: 'Grupo 1' }],
      activeGroupId: 'group-1', activeWhatsappGroupId: 'group-1', activeRaceByGroup: {}, captureGroupIds: ['group-1']
    },
    participants: [{ id: 'participant-g2', groupId: 'group-2', name: 'Persistido localmente' }],
    updatedAt: '2026-09-11T20:03:00.000Z'
  });
  const remote = workspace({
    config: {
      groups: [{ id: 'group-1', name: 'Grupo 1' }, { id: 'group-2', name: 'Grupo 2' }],
      activeGroupId: 'group-1', activeWhatsappGroupId: 'group-1', activeRaceByGroup: {}, captureGroupIds: ['group-1']
    },
    version: 4,
    updatedAt: '2026-09-11T20:02:00.000Z'
  });
  const merged = mergeWorkspaces(local, remote);
  assert.equal(merged.config.groups.length, 2);
  assert.equal(merged.participants.find((row) => row.id === 'participant-g2')?.groupId, 'group-2');
  assert.doesNotThrow(() => assertWorkspaceInputSafety(merged));
});

test('sync still rejects references unknown to both local and cloud registries', () => {
  const local = workspace({
    participants: [{ id: 'participant-ghost', groupId: 'group-ghost', name: 'Fantasma' }]
  });
  assert.throws(
    () => mergeWorkspaces(local, workspace({ version: 2 })),
    (error) => error?.code === 'HIPICO_WORKSPACE_UNKNOWN_GROUP'
  );
});

test('a bet cannot be attached to a race owned by another group', () => {
  const config = {
    groups: [{ id: 'group-1', name: 'Grupo 1' }, { id: 'group-2', name: 'Grupo 2' }],
    activeGroupId: 'group-1', activeWhatsappGroupId: 'group-1', activeRaceByGroup: {}, captureGroupIds: ['group-1']
  };
  const imported = workspace({
    config,
    days: [{ id: 'day-1', groupId: 'group-1', date: '2026-09-11', status: 'open' }],
    races: [{
      id: 'race-1', groupId: 'group-1', dayId: 'day-1', date: '2026-09-11', number: 1,
      status: 'open', board: [], boardPositions: [1,2,3,4,5,6], retired: [],
      bets: [{ id: 'bet-1', groupId: 'group-2', playerId: 'participant-1', status: 'pending' }]
    }]
  });
  assert.throws(
    () => normalizeWorkspaceShape(imported),
    (error) => error?.code === 'HIPICO_WORKSPACE_CROSS_GROUP_BET'
  );
});

test('same record id in different groups cannot collapse during cloud merge', () => {
  const local = workspace({
    config: {
      groups: [{ id: 'group-1', name: 'Grupo 1' }, { id: 'group-2', name: 'Grupo 2' }],
      activeGroupId: 'group-1', activeWhatsappGroupId: 'group-1', activeRaceByGroup: {}, captureGroupIds: ['group-1']
    },
    participants: [{ id: 'participant-same', groupId: 'group-1', name: 'Local G1', updatedAt: '2026-09-11T20:03:00.000Z' }]
  });
  const remote = workspace({
    config: structuredClone(local.config),
    participants: [{ id: 'participant-same', groupId: 'group-2', name: 'Remote G2', updatedAt: '2026-09-11T20:04:00.000Z' }]
  });
  const merged = mergeWorkspaces(local, remote);
  assert.equal(merged.participants.length, 2);
  assert.equal(merged.participants.find((row) => row.groupId === 'group-1')?.name, 'Local G1');
  assert.equal(merged.participants.find((row) => row.groupId === 'group-2')?.name, 'Remote G2');
});

test('same record id in the same group still resolves by freshness', () => {
  const local = workspace({ participants: [{ id: 'participant-same', groupId: 'group-1', name: 'Older', updatedAt: '2026-09-11T20:01:00.000Z' }] });
  const remote = workspace({ participants: [{ id: 'participant-same', groupId: 'group-1', name: 'Newer', updatedAt: '2026-09-11T20:05:00.000Z' }] });
  const merged = mergeWorkspaces(local, remote);
  assert.equal(merged.participants.length, 1);
  assert.equal(merged.participants[0].name, 'Newer');
});

test('2000 deterministic multigroup merge iterations preserve tenant isolation and freshness', () => {
  for (let index = 0; index < 2000; index += 1) {
    const sharedId = `participant-${index % 37}`;
    const groups = [{ id: 'group-1', name: 'Grupo 1' }, { id: 'group-2', name: 'Grupo 2' }];
    const config = { groups, activeGroupId: 'group-1', activeWhatsappGroupId: 'group-1', activeRaceByGroup: {}, captureGroupIds: ['group-1'] };
    const local = workspace({
      config: structuredClone(config),
      participants: [
        { id: sharedId, groupId: 'group-1', name: `G1-${index}`, updatedAt: '2026-09-11T20:01:00.000Z' },
        { id: `${sharedId}-same`, groupId: 'group-1', name: 'Older', updatedAt: '2026-09-11T20:01:00.000Z' }
      ]
    });
    const remote = workspace({
      config: structuredClone(config),
      participants: [
        { id: sharedId, groupId: 'group-2', name: `G2-${index}`, updatedAt: '2026-09-11T20:02:00.000Z' },
        { id: `${sharedId}-same`, groupId: 'group-1', name: 'Newer', updatedAt: '2026-09-11T20:03:00.000Z' }
      ]
    });
    const merged = mergeWorkspaces(local, remote);
    assert.equal(merged.participants.length, 3);
    assert.equal(merged.participants.find((row) => row.id === sharedId && row.groupId === 'group-1')?.name, `G1-${index}`);
    assert.equal(merged.participants.find((row) => row.id === sharedId && row.groupId === 'group-2')?.name, `G2-${index}`);
    assert.equal(merged.participants.find((row) => row.id === `${sharedId}-same` && row.groupId === 'group-1')?.name, 'Newer');
  }
});

test('hostile stored board tokens are rejected before render or merge', () => {
  const remote = workspace({
    races: [{
      id: 'race-1', groupId: 'group-1', dayId: 'day-1', date: '2026-09-11', number: 1,
      status: 'open', board: ['<img src=x onerror=alert(1)>'], boardPositions: [1,2,3,4,5,6],
      retired: [], bets: []
    }],
    days: [{ id: 'day-1', groupId: 'group-1', date: '2026-09-11', status: 'open' }]
  });
  assert.throws(
    () => mergeWorkspaces(workspace(), remote),
    (error) => error?.code === 'HIPICO_WORKSPACE_UNSAFE_BOARD_TOKEN'
  );
});

test('board submit validation rejects markup before app mutate runs', () => {
  const controls = new Map();
  for (let index = 0; index < 6; index += 1) controls.set(`horse${index}`, { value: index === 0 ? '<svg/onload=alert(1)>' : '', setCustomValidity() {}, reportValidity() {}, focus() {} });
  controls.set('retired', { value: '1, 4', setCustomValidity() {}, reportValidity() {}, focus() {} });
  const form = { elements: { namedItem: (name) => controls.get(name) || null } };
  assert.throws(
    () => __test__.rejectBoardSubmit(form),
    (error) => error?.code === 'HIPICO_WORKSPACE_UNSAFE_BOARD_TOKEN'
  );
});
