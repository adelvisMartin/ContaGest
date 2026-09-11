import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImportTarget } from '../frontend/public/hipico-control/assets/js/race-context-guard.js';

function workspace(track = 'Churchill Downs', number = 3, imports = []) {
  return {
    config: {
      activeGroupId: 'g1',
      activeRaceByGroup: { g1: 'r1' },
      groups: [{ id: 'g1' }]
    },
    days: [{ id: 'd1', groupId: 'g1', date: '2026-09-10', status: 'open' }],
    races: [{ id: 'r1', groupId: 'g1', dayId: 'd1', date: '2026-09-10', racetrack: track, number, status: 'open', bets: [] }],
    chatImports: imports,
    participants: [],
    movements: [],
    exchangeRates: []
  };
}

function match(id, track = 'Churchill Downs', raceNumber = 3, complete = true) {
  return {
    id,
    raceContext: { track, raceNumber, complete }
  };
}

test('chat import is allowed only when every new pair matches active track and race number', () => {
  const result = resolveImportTarget({ matches: [match('m1'), match('m2')] }, workspace());
  assert.equal(result.status, 'MATCH');
  assert.equal(result.decisions.length, 2);
  assert.ok(result.decisions.every(({ decision }) => decision.status === 'MATCH'));
});

test('same track but different race number is blocked', () => {
  const result = resolveImportTarget({ matches: [match('m1', 'Churchill Downs', 4)] }, workspace('Churchill Downs', 3));
  assert.equal(result.status, 'MISMATCH');
  assert.match(result.reason, /Churchill Downs 4/);
  assert.match(result.reason, /Churchill Downs 3/);
});

test('same race number but different track is blocked', () => {
  const result = resolveImportTarget({ matches: [match('m1', 'Colonial Downs', 3)] }, workspace('Churchill Downs', 3));
  assert.equal(result.status, 'MISMATCH');
});

test('incomplete race context requires explicit manual confirmation path', () => {
  const result = resolveImportTarget({ matches: [match('m1', '', null, false)] }, workspace());
  assert.equal(result.status, 'AMBIGUOUS');
  assert.match(result.reason, /no tienen hipódromo y número de carrera verificables/i);
});

test('already imported pairs are excluded from active-race decisions', () => {
  const result = resolveImportTarget({ matches: [match('old', 'Colonial Downs', 99), match('new')] }, workspace('Churchill Downs', 3, ['old']));
  assert.equal(result.status, 'MATCH');
  assert.deepEqual(result.matches.map((item) => item.id), ['new']);
});

test('missing active race fails closed', () => {
  const ws = workspace();
  ws.config.activeRaceByGroup.g1 = null;
  ws.races = [];
  const result = resolveImportTarget({ matches: [match('m1')] }, ws);
  assert.equal(result.status, 'NO_ACTIVE_RACE');
});
