import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enforceAdvancedLoadGroupScope, __test__ } from '../frontend/public/hipico-control/assets/js/advanced-group-scope.js';

const storeFacade = readFileSync(new URL('../frontend/public/hipico-control/assets/js/store.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../frontend/public/hipico-control/assets/js/app.js', import.meta.url), 'utf8');

function baseWorkspace() {
  return {
    config: {
      activeGroupId: 'g1', activeWhatsappGroupId: 'g1', activeRaceByGroup: {},
      groups: [
        { id: 'g1', name: 'Uno', exchangeRate: 160, commission: 0.05 },
        { id: 'g2', name: 'Dos', exchangeRate: 220, commission: 0.09 }
      ]
    },
    days: [
      { id: 'd1', groupId: 'g1', date: '2026-09-11', status: 'open' },
      { id: 'd2', groupId: 'g2', date: '2026-09-11', status: 'open' }
    ],
    races: [], advancedBets: [], audit: []
  };
}

function advanced(id, groupId, overrides = {}) {
  return {
    id, groupId, date: '2026-09-11', racetrack: 'Churchill Downs', raceNumber: 3,
    play: '1P', horse: groupId === 'g1' ? '5' : '8', amount: groupId === 'g1' ? 100 : 200,
    playerId: `${groupId}-p`, receiverId: `${groupId}-r`,
    createdAt: `2026-09-11T17:00:0${groupId === 'g1' ? '1' : '2'}Z`, status: 'loaded', ...overrides
  };
}

function loadedBet(row, overrides = {}) {
  return {
    id: `bet-${row.id}`, play: row.play, horse: row.horse, amount: row.amount,
    playerId: row.playerId, receiverId: row.receiverId, createdAt: row.createdAt,
    status: 'pending', source: 'advanced', ...overrides
  };
}

function race(id, groupId, status = 'open', overrides={}) {
  return {
    id, groupId, dayId: groupId === 'g1' ? 'd1' : 'd2', date: '2026-09-11',
    racetrack: 'Churchill Downs', number: 3, exchangeRate: groupId === 'g1' ? 160 : 220,
    commission: groupId === 'g1' ? 0.05 : 0.09, status, bets: [],
    board: ['', '', '', '', '', ''], boardPositions: [1, 2, 3, 4, 5, 6], ...overrides
  };
}

function audit(entityId) {
  return {
    id: 'audit-load', groupId: 'g1', action: 'advanced_loaded', entityType: 'race', entityId,
    message: 'Se cargaron adelantadas.', payload: {}, createdAt: '2026-09-11T17:05:00Z'
  };
}

test('same race in two groups loads only rows from the active group', () => {
  const ws = baseWorkspace();
  const g1 = race('race-g1', 'g1');
  const g2 = race('race-g2', 'g2');
  const a1 = advanced('a1', 'g1', { loadedRaceId: g1.id });
  const a2 = advanced('a2', 'g2', { loadedRaceId: g1.id });
  g1.bets.push(loadedBet(a1), loadedBet(a2));
  ws.races.push(g1, g2); ws.advancedBets.push(a1, a2); ws.audit.unshift(audit(g1.id));

  const result = enforceAdvancedLoadGroupScope(ws);
  assert.equal(result.blocked, false);
  assert.equal(a1.status, 'loaded');
  assert.equal(a1.loadedRaceId, g1.id);
  assert.equal(a2.status, 'staged');
  assert.equal('loadedRaceId' in a2, false);
  assert.deepEqual(g1.bets.map((bet) => bet.id), ['bet-a1']);
  assert.equal(g1.bets[0].groupId, 'g1');
  assert.equal(ws.audit[0].payload.rejectedCrossGroupCount, 1);
  assert.equal(ws.audit[0].payload.groupScopeGuarded,true);
});

test('legacy lookup hitting another group creates the correct scoped race and moves only intended rows', () => {
  const ws = baseWorkspace();
  const wrong = race('race-g2', 'g2');
  const a1 = advanced('a1', 'g1', { loadedRaceId: wrong.id });
  const a2 = advanced('a2', 'g2', { loadedRaceId: wrong.id });
  wrong.bets.push(loadedBet(a1), loadedBet(a2));
  ws.races.push(wrong); ws.advancedBets.push(a1, a2); ws.audit.unshift(audit(wrong.id));

  let sequence = 0;
  const result = enforceAdvancedLoadGroupScope(ws, {
    createId: (prefix) => `${prefix}-new-${++sequence}`,
    now: () => '2026-09-11T17:06:00Z'
  });

  assert.equal(result.blocked, false);
  const target = ws.races.find((row) => row.groupId === 'g1');
  assert.ok(target);
  assert.equal(target.status, 'open');
  assert.equal(target.exchangeRate,160);
  assert.equal(target.commission,0.05);
  assert.deepEqual(target.bets.map((bet) => bet.id), ['bet-a1']);
  assert.equal(target.bets[0].groupId, 'g1');
  assert.equal(a1.loadedRaceId, target.id);
  assert.equal(a2.status, 'staged');
  assert.equal(wrong.bets.length, 0);
  assert.equal(ws.config.activeRaceByGroup.g1, target.id);
  assert.equal(ws.activeRaceId, target.id);
  assert.equal(ws.audit[0].entityId, target.id);
});

test('closed race in the intended group fails closed and restores staged advanced rows', () => {
  const ws = baseWorkspace();
  const wrong = race('race-g2', 'g2');
  const closed = race('race-g1-closed', 'g1', 'closed');
  const a1 = advanced('a1', 'g1', { loadedRaceId: wrong.id });
  wrong.bets.push(loadedBet(a1));
  ws.races.push(wrong, closed); ws.advancedBets.push(a1); ws.audit.unshift(audit(wrong.id));

  const result = enforceAdvancedLoadGroupScope(ws);
  assert.equal(result.blocked, true);
  assert.equal(a1.status, 'staged');
  assert.equal('loadedRaceId' in a1, false);
  assert.equal(wrong.bets.length, 0);
  assert.equal(closed.bets.length, 0);
  assert.equal(ws.audit[0].action, 'advanced_load_blocked');
  assert.equal(ws.audit[0].payload.reason, 'TARGET_RACE_NOT_OPEN');
});

test('a closed day with the same date is never reused for a newly scoped race',()=>{
  const ws=baseWorkspace();
  ws.days=ws.days.filter((day)=>day.groupId!=='g1');
  ws.days.push({id:'d1-closed',groupId:'g1',date:'2026-09-11',status:'closed',closure:{closedAt:'2026-09-11T16:00:00Z'}});
  const wrong=race('race-g2','g2');
  const a1=advanced('a1','g1',{loadedRaceId:wrong.id});
  wrong.bets.push(loadedBet(a1));
  ws.races.push(wrong); ws.advancedBets.push(a1); ws.audit.unshift(audit(wrong.id));
  let sequence=0;
  enforceAdvancedLoadGroupScope(ws,{createId:(prefix)=>`${prefix}-fresh-${++sequence}`,now:()=> '2026-09-11T17:06:00Z'});
  const target=ws.races.find((row)=>row.groupId==='g1');
  assert.ok(target);
  assert.notEqual(target.dayId,'d1-closed');
  const newDay=ws.days.find((day)=>day.id===target.dayId);
  assert.equal(newDay.status,'open');
  assert.equal(ws.days.find((day)=>day.id==='d1-closed').status,'closed');
});

test('successful guard is one-shot and later race close never stages historical advanced bets',()=>{
  const ws=baseWorkspace();
  const target=race('race-g1','g1');
  const a1=advanced('a1','g1',{loadedRaceId:target.id});
  target.bets.push(loadedBet(a1));
  ws.races.push(target); ws.advancedBets.push(a1); ws.audit.unshift(audit(target.id));
  const first=enforceAdvancedLoadGroupScope(ws);
  assert.equal(first.changed,true);
  assert.equal(ws.audit[0].payload.groupScopeGuarded,true);
  target.status='closed';
  const second=enforceAdvancedLoadGroupScope(ws);
  assert.deepEqual(second,{changed:false,blocked:false,notice:''});
  assert.equal(a1.status,'loaded');
  assert.equal(a1.loadedRaceId,target.id);
  assert.deepEqual(target.bets.map((bet)=>bet.id),['bet-a1']);
});

test('ensureDay reuses only an open group-scoped day',()=>{
  const ws=baseWorkspace();
  const existing=ws.days.find((day)=>day.groupId==='g1');
  const reused=__test__.ensureDay(ws,'g1','2026-09-11',()=>{throw new Error('must not create');},()=> 'now');
  assert.equal(reused.id,existing.id);
});

test('store facade hardens workspace before cloning and delays cloud outbox one microtask', () => {
  assert.match(storeFacade, /enforceAdvancedLoadGroupScope/);
  assert.match(storeFacade, /export function queueWorkspaceSave\(workspace/);
  assert.match(storeFacade, /hardenWorkspaceWrites\(workspace\);\s*return storageV2\.queueWorkspaceSave/s);
  assert.match(storeFacade, /export async function enqueueOutbox\(event\)[\s\S]*await Promise\.resolve\(\);[\s\S]*storageV2\.enqueueOutbox\(event\)/);
});

test('legacy app path remains explicitly covered until the monolith is removed', () => {
  assert.match(appSource, /function loadAdvancedGroup\(key\)/);
  assert.match(appSource, /workspace\.advancedBets\.filter\(\(b\) => b\.status === "staged"/);
  assert.match(appSource, /mutate\("advanced_loaded"/);
});
