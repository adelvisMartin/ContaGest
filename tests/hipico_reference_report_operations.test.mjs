import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  caracasToday, caracasClock, projectOperationsDesk, projectRaceResults, raceCopyText
} from '../frontend/public/hipico-control/assets/js/reference-report-operations.js';
import { projectParticipantAccount } from '../frontend/public/hipico-control/assets/js/reference-report-projections.js';
import { renderReferenceReport } from '../frontend/public/hipico-control/assets/js/reference-report-ui.js';

function workspace() {
  return {
    config: {
      activeGroupId: 'triple-c', currency: 'USD',
      groups: [
        { id: 'triple-c', name: 'TRIPLE C', companyName: 'CLUB TRIPLE C', currency: 'USD', exchangeRate: 1 },
        { id: 'other', name: 'OTRO', companyName: 'NO EXPONER', currency: 'USD', exchangeRate: 1 }
      ]
    },
    participants: [
      { id: 'a', groupId: 'triple-c', code: 'CANITA', name: 'Cañita', openingBalance: 100 },
      { id: 'b', groupId: 'triple-c', code: 'PACO', name: 'Paco', openingBalance: 0 },
      { id: 'c', groupId: 'other', code: 'SECRET', name: 'No visible', openingBalance: 900 }
    ],
    days: [{ id: 'd1', groupId: 'triple-c', date: '2026-10-14', status: 'closed' }],
    races: [
      {
        id: 'r-old', groupId: 'triple-c', date: '2026-10-14', racetrack: 'Remington',
        number: 6, board: ['1','2','7'], updatedAt: '2026-10-14T20:10:00Z',
        bets: [{
          id: 'b-old', playerId: 'a', receiverId: 'b', play: '3N', horse: '1',
          amount: 300, status: 'pending', settlement: null
        }]
      },
      {
        id: 'r-new', groupId: 'triple-c', date: '2026-10-14', racetrack: 'Charles Town',
        number: 8, board: ['2','6','7','10'], updatedAt: '2026-10-15T02:45:00Z',
        bets: [
          {
            id: 'b-win', playerId: 'a', receiverId: 'b', play: '2Y2N', horse: '10',
            amount: 500, status: 'settled',
            settlement: { playerAmount: 475, receiverAmount: -500, commissionAmount: 25 }
          },
          {
            id: 'b-cancel', playerId: 'a', receiverId: 'b', play: '2N', horse: '6',
            amount: 300, status: 'cancelled',
            settlement: { playerAmount: 9999, receiverAmount: -9999 }
          }
        ]
      },
      {
        id: 'r-other', groupId: 'other', date: '2026-10-14', racetrack: 'SECRET TRACK',
        number: 9, board: ['1'], updatedAt: '2026-10-15T03:00:00Z',
        bets: [{ id: 'secret-bet', playerId: 'c', play: '2N', horse: '1',
          amount: 99999, status: 'settled', settlement: { playerAmount: 50000 } }]
      }
    ],
    movements: [
      {
        id: 'transfer-1', groupId: 'triple-c', date: '2026-10-14',
        createdAt: '2026-10-15T03:14:23Z',
        type: 'transfer', participantId: 'a', counterpartyId: 'b',
        status: 'posted', amount: 340, currency: 'VES'
      },
      {
        id: 'deposit-1', groupId: 'triple-c', date: '2026-10-14',
        createdAt: '2026-10-14T12:00:00Z',
        type: 'deposit', participantId: 'a', status: 'posted', amount: 150, currency: 'VES'
      },
      {
        id: 'reversal-1', groupId: 'triple-c', date: '2026-10-14',
        createdAt: '2026-10-14T12:15:00Z',
        type: 'deposit', participantId: 'a', status: 'cancelled', amount: 70, currency: 'VES'
      },
      {
        id: 'other-move', groupId: 'other', date: '2026-10-14',
        createdAt: '2026-10-14T20:22:00Z',
        type: 'transfer', participantId: 'c', counterpartyId: 'c', status:'posted',
        amount: 9999, currency:'USD'
      }
    ],
    exchangeRates: [{ id: 'ex', groupId: 'triple-c', date: '2026-10-14', rate: 1 }]
  };
}
const scope = { groupId: 'triple-c', date: '2026-10-14' };

test('Hoy and local clock use America/Caracas near midnight, not UTC calendar day', () => {
  assert.equal(caracasToday(new Date('2026-10-15T03:59:59.000Z')), '2026-10-14');
  assert.equal(caracasToday(new Date('2026-10-15T04:00:00.000Z')), '2026-10-15');
  assert.match(caracasClock('2026-10-15T03:14:23Z'), /^23:14:23$/);
  assert.equal(caracasClock('invalid'), '—');
});

test('desk is group/date scoped and orders races by most recently recorded activity', () => {
  const input = workspace();
  const before = structuredClone(input);
  const desk = projectOperationsDesk(input, scope);
  assert.equal(desk.raceCount, 2);
  assert.deepEqual(desk.races.map(r => r.id), ['r-new', 'r-old']);
  assert.equal(desk.races[0].board, '2.6.7.10');
  assert.equal(desk.betCount, 3);
  assert.equal(desk.movementCount, 3);
  assert.equal(desk.entryCount, 4);
  assert.ok(!JSON.stringify(desk).includes('NO EXPONER'));
  assert.ok(!JSON.stringify(desk).includes('SECRET TRACK'));
  assert.deepEqual(input, before, 'read-only means no mutation of the workspace');
});

test('transfer shows two legs but only one operation in rollups, never double-counts', () => {
  const desk = projectOperationsDesk(workspace(), scope);
  const legs = desk.entryRows.filter(row => row.id === 'transfer-1');
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map(row => [row.side,row.participant.code,row.amount]), [
    ['sender','CANITA',-340],['receiver','PACO',340]
  ]);
  const transfer = desk.totals.find(row => row.type === 'transfer' && row.currency === 'VES');
  assert.deepEqual({ count:transfer.count, amount:transfer.amount },{ count:1, amount:340 });
  const dep = desk.totals.find(row => row.type === 'deposit' && row.currency === 'VES');
  assert.deepEqual({ count:dep.count,amount:dep.amount },{ count:1, amount:150 });
  assert.equal(desk.cancelledCount,1);
});

test('race result panel never counts pending/cancelled nor infers operator profit', () => {
  const desk = projectOperationsDesk(workspace(), scope);
  const winner = desk.races.find(row => row.id === 'r-new');
  assert.equal(winner.participantTotal,-25);
  assert.equal(winner.participantTotalKind,'participant-settled-net');
  assert.equal(winner.settledBets,1);
  assert.deepEqual(winner.participantResults.map(r => [r.code,r.amount]),
    [['CANITA',475],['PACO',-500]]);
  const unclosed = desk.races.find(row => row.id === 'r-old');
  assert.equal(unclosed.participantTotal,0);
  assert.deepEqual(unclosed.participantResults,[]);
  assert.deepEqual(projectRaceResults({ bets:[] }).participantResults,[]);
});

test('Copiar uses the exact authorized race, date and group; includes only confirmed outcomes', () => {
  const original = workspace();
  const copied = raceCopyText(original, {...scope, raceId:'r-new'});
  assert.match(copied,/CLUB TRIPLE C/);
  assert.match(copied,/2Y2N 10 500\.00 USD CANITA PACO · LIQUIDADA/);
  assert.match(copied,/2N 6 300\.00 USD CANITA PACO · ANULADA/);
  assert.match(copied,/RESULTADOS CONFIRMADOS/);
  assert.doesNotMatch(copied,/9999/);
  assert.doesNotMatch(copied,/SECRET/);
  assert.throws(() => raceCopyText(original, {...scope, raceId:'r-other'}),/inexistente/);
  assert.throws(() => raceCopyText(original, {...scope,date:'2026-10-13',raceId:'r-new'}),/inexistente/);
  const personal = raceCopyText(original,{...scope,raceId:'r-new',participantId:'a'});
  assert.match(personal,/CANITA: 475\.00/);
  assert.doesNotMatch(personal,/PACO: -500\.00/);
});

test('cross-group corruption disables race clipboard instead of exposing the other group', () => {
  const data = workspace();
  data.races[1].bets.push({
    id:'foreign', playerId:'a', receiverId:'c',
    play:'2N',horse:'1',amount:3,status:'settled',
    settlement:{playerAmount:3,receiverAmount:-3}
  });
  assert.throws(() => raceCopyText(data,{...scope,raceId:'r-new'}),/sin conciliar/);
  const desk = projectOperationsDesk(data,scope);
  assert.equal(desk.invalidReferences,1);
  assert.ok(!JSON.stringify(desk).includes('NO EXPONER'));
});

test('all 3 report views render observed controls and state without leaking trusted HTML', () => {
  const data = workspace();
  data.participants[0].name = '<img src=x onerror=alert(1)>';
  const history = renderReferenceReport(data,{...scope,type:'race-history'}, {
    status:'Local sin sincronizar',checkedAt:'14/10/2026 23:20'});
  for(const control of ['reference-report-today','reference-report-refresh','reference-report-switch',
    'reference-report-copy-race']){
    assert.ok(history.includes('data-action="'+control+'"'),control);
  }
  assert.match(history,/Historial de transacciones/);
  assert.match(history,/Carreras registradas/);
  assert.match(history,/23:14:23/);
  assert.match(history,/Local sin sincronizar/);
  assert.ok(!history.includes('NO EXPONER'));
  assert.ok(!history.includes('<img src=x'));
  const movement = renderReferenceReport(data,{...scope,type:'daily-movements'});
  assert.match(movement,/data-target="race-history"/);
  const personal = renderReferenceReport(data,{...scope,type:'personal',participantId:'a'});
  assert.match(personal,/Saldo final sin aval/);
  assert.match(personal,/Disponible con aval/);
  assert.match(personal,/Resultado liquidado en carreras/);
  assert.match(personal,/data-action="reference-report-copy-race"/);
  assert.ok(!personal.includes('SECRET TRACK'));
});

test('offline precache and Android packaging require all three read-only modules', () => {
  const base = new URL('../',import.meta.url);
  const read=(p)=>fs.readFileSync(new URL(p,base),'utf8');
  const sw=read('frontend/public/hipico-control/sw.js');
  const android=read('android/hipico-control-v1130/scripts/sync-web.mjs');
  const app=read('frontend/public/hipico-control/assets/js/app.js');
  assert.match(sw,/shell-r37-operations-desk-v4-1-3/);
  for(const name of ['reference-report-operations.js','reference-report-projections.js','reference-report-ui.js']){
    assert.ok(sw.includes("'./assets/js/"+name+"'"),name+' missing PWA cache');
    assert.ok(android.includes("'assets/js/"+name+"'"),name+' missing Android parity');
  }
  assert.match(app,/reference-report-copy-race/);
  assert.match(app,/reference-report-refresh/);
  assert.match(app,/reference-report-switch/);
  assert.match(app,/caracasToday/);
  assert.doesNotMatch(sw,/websimproco/);
});
