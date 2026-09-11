import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeItems } from '../frontend/public/hipico-control/assets/js/operational-ledger.js';
import { repairWorkspaceGroupScope } from '../frontend/public/hipico-control/assets/js/store-v2.js';

function baseWorkspace() {
  return {
    config: { activeGroupId: 'g2', activeWhatsappGroupId: 'g2', activeRaceByGroup: { g1: 'r1', g2: null }, groups: [{ id: 'g1' }, { id: 'g2' }] },
    participants: [
      { id: 'p1', groupId: 'g1', previousWeekBalance: 100, openingBalance: 100 },
      { id: 'p2', groupId: 'g2', previousWeekBalance: 200, openingBalance: 200 }
    ],
    days: [
      { id: 'd1', groupId: 'g1', date: '2026-09-10', status: 'open' },
      { id: 'd2', groupId: 'g2', date: '2026-09-10', status: 'open' }
    ],
    races: [
      { id: 'r1', groupId: 'g1', dayId: 'd1', date: '2026-09-10', racetrack: 'Churchill Downs', number: 1, bets: [] }
    ],
    advancedBets: [], movements: [], exchangeRates: [], weekClosures: [], pollas: [], audit: []
  };
}

test('legacy groupless records belong only to the first group in canonical read ledger', () => {
  const workspace = { config: { groups: [{ id: 'g1' }, { id: 'g2' }] } };
  const rows = [{ id: 'legacy' }, { id: 'one', groupId: 'g1' }, { id: 'two', groupId: 'g2' }];
  assert.deepEqual(scopeItems(workspace, rows, 'g1').map((row) => row.id), ['legacy', 'one']);
  assert.deepEqual(scopeItems(workspace, rows, 'g2').map((row) => row.id), ['two']);
});

test('persistence boundary tags legacy groupless records only to first group', () => {
  const workspace = baseWorkspace();
  workspace.movements.push({ id: 'legacy-movement', amount: 10 });
  repairWorkspaceGroupScope(workspace, structuredClone(workspace));
  assert.equal(workspace.movements[0].groupId, 'g1');
});

test('advanced load is repaired into the active group when legacy UI selected a same-race record from another group', () => {
  const previous = baseWorkspace();
  const workspace = structuredClone(previous);
  const advanced = {
    id: 'adv-g2', groupId: 'g2', date: '2026-09-10', racetrack: 'Churchill Downs', raceNumber: 1,
    play: '1P', horse: '3', amount: 30000, playerId: 'p2', receiverId: '', createdAt: '2026-09-10T20:00:00Z',
    status: 'loaded', loadedRaceId: 'r1'
  };
  workspace.advancedBets.push(advanced);
  workspace.races[0].bets.push({
    id: 'loaded', play: advanced.play, horse: advanced.horse, amount: advanced.amount, playerId: advanced.playerId,
    receiverId: advanced.receiverId, source: 'advanced', status: 'pending', createdAt: advanced.createdAt
  });
  workspace.audit.unshift({ id: 'a1', groupId: 'g2', action: 'advanced_loaded', entityType: 'race', entityId: 'r1' });

  repairWorkspaceGroupScope(workspace, previous);

  assert.equal(workspace.races.find((race) => race.id === 'r1').bets.length, 0);
  const target = workspace.races.find((race) => race.groupId === 'g2' && race.racetrack === 'Churchill Downs' && Number(race.number) === 1);
  assert.ok(target);
  assert.equal(target.dayId, 'd2');
  assert.equal(target.bets.length, 1);
  assert.equal(target.bets[0].groupId, 'g2');
  assert.equal(workspace.advancedBets[0].loadedRaceId, target.id);
  assert.equal(workspace.config.activeRaceByGroup.g2, target.id);
  assert.equal(workspace.audit[0].entityId, target.id);
});

test('day close assigns the newly opened groupless day to the audited active group', () => {
  const previous = baseWorkspace();
  const workspace = structuredClone(previous);
  workspace.days.find((day) => day.id === 'd2').status = 'closed';
  workspace.days.push({ id: 'new-day', date: '2026-09-11', status: 'open', closure: null });
  workspace.audit.unshift({ id: 'a2', groupId: 'g2', action: 'day_closed', entityType: 'day', entityId: 'd2' });

  repairWorkspaceGroupScope(workspace, previous);

  assert.equal(workspace.days.find((day) => day.id === 'new-day').groupId, 'g2');
  assert.equal(workspace.days.find((day) => day.id === 'd1').groupId, 'g1');
});

test('week close restores other groups if legacy UI touched their previous-week balance', () => {
  const previous = baseWorkspace();
  const workspace = structuredClone(previous);
  workspace.participants.find((participant) => participant.id === 'p1').previousWeekBalance = 9999;
  workspace.participants.find((participant) => participant.id === 'p2').previousWeekBalance = 275;
  workspace.audit.unshift({ id: 'a3', groupId: 'g2', action: 'week_closed', entityType: 'week', entityId: 'w2' });

  repairWorkspaceGroupScope(workspace, previous);

  assert.equal(workspace.participants.find((participant) => participant.id === 'p1').previousWeekBalance, 100);
  assert.equal(workspace.participants.find((participant) => participant.id === 'p2').previousWeekBalance, 275);
});
