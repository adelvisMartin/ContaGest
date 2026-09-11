import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkspaces } from '../frontend/public/hipico-control/assets/js/sync.js';
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
