import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertReportDate, projectParticipantAccount, projectDailyMovements, projectRaceHistory
} from '../frontend/public/hipico-control/assets/js/reference-report-projections.js';
import {
  renderReferenceReport, referenceReportLines
} from '../frontend/public/hipico-control/assets/js/reference-report-ui.js';

function fixture() {
  return {
    config: { activeGroupId:'north', groups:[
      {id:'north',name:'Grupo Norte',companyName:'Grupo Norte',currency:'USD',exchangeRate:2},
      {id:'south',name:'Grupo Sur',companyName:'Grupo Sur',currency:'USD',exchangeRate:2}
    ] },
    participants:[
      {id:'p1',groupId:'north',code:'A',name:'Cuenta A',openingBalance:100,avalBs:0,avalUsd:0,active:true},
      {id:'p2',groupId:'north',code:'B',name:'Cuenta B',openingBalance:0,avalBs:0,avalUsd:0,active:true},
      {id:'p3',groupId:'south',code:'C',name:'NO MOSTRAR',openingBalance:900,active:true}
    ],
    days:[{id:'d1',groupId:'north',date:'2026-10-14',status:'closed'}],
    races:[
      {id:'r1',groupId:'north',dayId:'d1',date:'2026-10-14',racetrack:'Pista de prueba',number:1,status:'closed',board:['2','6','7'],bets:[
        {id:'b1',playerId:'p1',receiverId:'p2',play:'2N',horse:'10',amount:50,status:'settled',
          settlement:{playerAmount:47.5,receiverAmount:-50,commissionAmount:2.5}},
        {id:'b2',playerId:'p1',receiverId:'p2',play:'3N',horse:'2',amount:20,status:'pending',settlement:null},
        {id:'b3',playerId:'p1',receiverId:'p2',play:'2N',horse:'4',amount:70,status:'cancelled',
          settlement:{playerAmount:99999,receiverAmount:-99999}}
      ]},
      {id:'r-other',groupId:'south',date:'2026-10-14',racetrack:'Confidencial',number:2,status:'closed',board:['1'],
        bets:[{id:'bx',playerId:'p3',play:'2N',horse:'1',amount:800,status:'settled',settlement:{playerAmount:850}}]}
    ],
    movements:[
      {id:'m1',groupId:'north',date:'2026-10-14',type:'transfer',participantId:'p1',counterpartyId:'p2',currency:'VES',amount:30,status:'posted',createdAt:'2026-10-14T14:00:00Z'},
      {id:'m2',groupId:'north',date:'2026-10-14',type:'adjustment',participantId:'p1',currency:'VES',amount:15,status:'posted',createdAt:'2026-10-14T12:00:00Z'},
      {id:'m3',groupId:'north',date:'2026-10-14',type:'adjustment',participantId:'p1',currency:'VES',amount:-100,status:'cancelled',createdAt:'2026-10-14T11:00:00Z'},
      {id:'m4',groupId:'north',date:'2026-10-14',type:'pool',participantId:'p1',currency:'USD',amount:10,status:'posted',createdAt:'2026-10-14T15:00:00Z'},
      {id:'m5',groupId:'south',date:'2026-10-14',type:'adjustment',participantId:'p3',currency:'VES',amount:3500,status:'posted',createdAt:'2026-10-14T22:00:00Z'}
    ],
    exchangeRates:[{id:'ex',groupId:'north',date:'2026-10-14',rate:2}]
  };
}
const options={groupId:'north',date:'2026-10-14'};

test('report date validation rejects malformed or impossible Gregorian dates',()=>{
  assert.equal(assertReportDate('2026-10-14'),'2026-10-14');
  for(const invalid of ['14/10/2026','2026-02-30','2026-13-01','2026-10-14?token','']) {
    assert.throws(()=>assertReportDate(invalid),/fecha/i);
  }
});

test('race history scopes by authorized group and preserves unsettled and cancelled states',()=>{
  const data=projectRaceHistory(fixture(),options);
  assert.equal(data.raceCount,1);
  assert.equal(data.betCount,3);
  assert.equal(data.races[0].board,'2.6.7');
  assert.deepEqual([data.races[0].settled,data.races[0].pending,data.races[0].cancelled],[1,1,1]);
  assert.equal(data.races[0].bets[1].playerResult,null);
  assert.equal(data.races[0].bets[2].playerResult,null);
  assert.ok(!JSON.stringify(data).includes('Confidencial'));
  assert.ok(!JSON.stringify(data).includes('NO MOSTRAR'));
});

test('daily transfers count once, cancelled movements excluded and currencies never mixed',()=>{
  const report=projectDailyMovements(fixture(),options);
  assert.equal(report.movements.length,4);
  assert.equal(report.postedCount,3);
  assert.equal(report.cancelledCount,1);
  assert.equal(report.movements.find(m=>m.id==='m1').deltaTotal,0);
  assert.deepEqual(
    report.totals.map(v=>[v.type,v.currency,v.amount,v.count]).sort((a,b)=>a[0].localeCompare(b[0])),
    [['adjustment','VES',15,1],['pool','USD',10,1],['transfer','VES',30,1]]
  );
  assert.ok(!JSON.stringify(report).includes('NO MOSTRAR'));
});

test('personal weekly and daily balances reuse existing canonical ledger without writing source',()=>{
  const workspace=fixture();
  const previous=structuredClone(workspace);
  const account=projectParticipantAccount(workspace,{...options,participantId:'p1'});
  // 47.50 settled + -30 transfer + 15 adjustment + 20 base-currency equivalent of USD pool.
  assert.equal(account.dayResult,52.5);
  assert.equal(account.opening,100);
  assert.equal(account.available,152.5);
  assert.equal(account.weekResult,52.5);
  assert.equal(account.races.length,1);
  assert.equal(account.movements.length,4);
  assert.equal(account.movements.find(m=>m.id==='m3').delta,0);
  assert.deepEqual(workspace,previous,'projection must not mutate operational workspace');
});

test('cross-group IDs fail closed for personal views and ignore improper public rows',()=>{
  const workspace=fixture();
  assert.throws(()=>projectParticipantAccount(workspace,{...options,participantId:'p3'}),/grupo seleccionado/);
  assert.throws(()=>projectRaceHistory(workspace,{...options,groupId:'missing'}),/Grupo no autorizado/);
  workspace.races[0].bets.push({
    id:'cross',playerId:'p1',receiverId:'p3',play:'2N',horse:'1',amount:80,
    status:'settled',settlement:{playerAmount:700,receiverAmount:-800}
  });
  const report=projectRaceHistory(workspace,options);
  assert.equal(report.invalidReferences,1);
  assert.ok(!JSON.stringify(report).includes('NO MOSTRAR'));
  assert.throws(()=>projectParticipantAccount(workspace,{...options,participantId:'p1'}),/referencias/);
});

test('render and text export escape hostile labels and are independent of source tokens',()=>{
  const workspace=fixture();
  workspace.participants[0].name='<script>alert(1)</script>';
  const html=renderReferenceReport(workspace,{...options,type:'personal',participantId:'p1'});
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('type="date"'));
  assert.ok(html.includes('reference-report-filter-form'));
  assert.ok(html.includes('Pizarra:'));
  const text=referenceReportLines(workspace,{...options,type:'daily-movements'}).join('\n');
  assert.ok(text.includes('Transferencia'));
  assert.ok(!text.includes('Confidencial'));
  assert.ok(!text.includes('?t='));
});

test('movement and race read models remain empty for unpopulated calendar dates',()=>{
  const empty={...options,date:'2026-10-13'};
  assert.deepEqual(projectDailyMovements(fixture(),empty).movements,[]);
  assert.deepEqual(projectRaceHistory(fixture(),empty).races,[]);
  assert.equal(projectParticipantAccount(fixture(),{...empty,participantId:'p1'}).dayResult,0);
});

test('new report modules participate in the offline PWA and Android parity contract',()=>{
  const sw=fs.readFileSync(new URL('../frontend/public/hipico-control/sw.js',import.meta.url),'utf8');
  const android=fs.readFileSync(new URL('../android/hipico-control-v1130/scripts/sync-web.mjs',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../frontend/public/hipico-control/assets/js/app.js',import.meta.url),'utf8');
  assert.match(sw,/shell-r38-consolidator/);
  for(const file of ['reference-report-operations.js','reference-report-projections.js','reference-report-ui.js']){
    assert.ok(sw.includes("'./assets/js/"+file+"'"));
    assert.ok(android.includes("'assets/js/"+file+"'"));
    assert.ok(app.includes('"./'+file+'"'));
  }
  assert.ok(!sw.includes('websimproco'));
});
