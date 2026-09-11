import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWorkspaceShape,
  parseChatImportKey,
  scopedChatImportKey
} from '../frontend/public/hipico-control/assets/js/workspace.js';
import { mergeChatImports, mergeWorkspaces } from '../frontend/public/hipico-control/assets/js/sync.js';

function baseWorkspace(activeGroupId = 'g1', chatImports = []) {
  return {
    version: 1,
    updatedAt: '2026-09-11T12:00:00.000Z',
    config: {
      activeGroupId,
      activeWhatsappGroupId: activeGroupId,
      groups: [
        { id: 'g1', name: 'Grupo 1', companyName: 'Grupo 1', currency: 'Bs.', exchangeRate: 160, commission: 0.05 },
        { id: 'g2', name: 'Grupo 2', companyName: 'Grupo 2', currency: 'Bs.', exchangeRate: 160, commission: 0.05 }
      ],
      activeRaceByGroup: { g1: null, g2: null }
    },
    participants: [], days: [], races: [], advancedBets: [], movements: [], exchangeRates: [],
    weekClosures: [], pollas: [], audit: [], chatImports, syncQueue: []
  };
}

test('legacy chat import ids remain global so historical bets cannot be re-imported after upgrade', () => {
  const workspace = normalizeWorkspaceShape(baseWorkspace('g1', ['MATCH-LEGACY']));
  assert.equal(Array.isArray(workspace.chatImports), true);
  assert.deepEqual([...workspace.chatImports], ['MATCH-LEGACY']);
  workspace.config.activeGroupId = 'g2';
  workspace.config.activeWhatsappGroupId = 'g2';
  assert.deepEqual([...workspace.chatImports], ['MATCH-LEGACY']);
});

test('new chat import ids are persisted with group scope while app iteration stays backward compatible', () => {
  const workspace = normalizeWorkspaceShape(baseWorkspace());
  workspace.chatImports.push('MATCH-1');
  const rawAfterG1 = structuredClone(workspace.chatImports);
  assert.deepEqual(rawAfterG1, [scopedChatImportKey('g1', 'MATCH-1')]);
  assert.deepEqual([...workspace.chatImports], ['MATCH-1']);

  workspace.config.activeGroupId = 'g2';
  workspace.config.activeWhatsappGroupId = 'g2';
  assert.deepEqual([...workspace.chatImports], []);
  workspace.chatImports.push('MATCH-1');
  const rawAfterG2 = structuredClone(workspace.chatImports);
  assert.equal(rawAfterG2.length, 2);
  assert.equal(parseChatImportKey(rawAfterG2[0]).groupId, 'g1');
  assert.equal(parseChatImportKey(rawAfterG2[1]).groupId, 'g2');
  assert.deepEqual([...workspace.chatImports], ['MATCH-1']);

  workspace.config.activeGroupId = 'g1';
  workspace.config.activeWhatsappGroupId = 'g1';
  assert.deepEqual([...workspace.chatImports], ['MATCH-1']);
});

test('cloud merge unions persisted chat import keys instead of dropping the older side', () => {
  const local = normalizeWorkspaceShape(baseWorkspace('g1'));
  local.chatImports.push('LOCAL');
  local.updatedAt = '2026-09-11T12:01:00.000Z';

  const remote = normalizeWorkspaceShape(baseWorkspace('g2'));
  remote.chatImports.push('REMOTE');
  remote.updatedAt = '2026-09-11T12:02:00.000Z';

  const rawMerged = mergeChatImports(local.chatImports, remote.chatImports);
  assert.equal(rawMerged.includes(scopedChatImportKey('g1', 'LOCAL')), true);
  assert.equal(rawMerged.includes(scopedChatImportKey('g2', 'REMOTE')), true);

  const merged = normalizeWorkspaceShape(mergeWorkspaces(local, remote));
  merged.config.activeGroupId = 'g1';
  merged.config.activeWhatsappGroupId = 'g1';
  assert.deepEqual([...merged.chatImports], ['LOCAL']);
  merged.config.activeGroupId = 'g2';
  merged.config.activeWhatsappGroupId = 'g2';
  assert.deepEqual([...merged.chatImports], ['REMOTE']);
});
