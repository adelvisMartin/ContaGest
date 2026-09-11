import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { balanceRows, participantStatement, scopeItems } from '../frontend/public/hipico-control/assets/js/operational-ledger.js';
import { generateBalancesWhatsappText, generateParticipantStatementText, generateWhatsappText } from '../frontend/public/hipico-control/assets/js/format.js';

function fixture(){
  return {
    config:{
      activeGroupId:'g1',activeWhatsappGroupId:'g1',activeRaceByGroup:{g1:'r1',g2:'r2'},exchangeRate:100,
      groups:[
        {id:'g1',name:'Principal',companyName:'CONTROL HÍPICO',currency:'Bs.',exchangeRate:100,footerMessage:''},
        {id:'g2',name:'Secundario',companyName:'OTRO LOCAL',currency:'Bs.',exchangeRate:100,footerMessage:''}
      ]
    },
    participants:[
      {id:'p1',groupId:'g1',code:'zedan',name:'Zedan',openingBalance:1000,avalBs:200,avalUsd:1,active:true},
      {id:'p2',groupId:'g2',code:'otro',name:'Otro',openingBalance:999999,avalBs:0,avalUsd:0,active:true},
      {id:'legacy',code:'legacy',name:'Legacy g1',openingBalance:50,avalBs:0,avalUsd:0,active:true}
    ],
    days:[{id:'d1',groupId:'g1',date:'2026-09-10',status:'open'},{id:'d2',groupId:'g2',date:'2026-09-10',status:'open'}],
    races:[
      {id:'r1',groupId:'g1',dayId:'d1',date:'2026-09-10',racetrack:'Churchill Downs',number:1,exchangeRate:100,status:'closed',board:['1','2','8','7'],bets:[
        {id:'b1',play:'PP',horse:'1',status:'settled',playerId:'p1',receiverId:'',amount:30000,settlement:{playerAmount:500,receiverAmount:0,commissionAmount:0}}
      ]},
      {id:'r2',groupId:'g2',dayId:'d2',date:'2026-09-10',racetrack:'Del Mar',number:8,exchangeRate:100,status:'closed',board:['3','4'],bets:[
        {id:'b2',play:'PP',horse:'3',status:'settled',playerId:'p2',receiverId:'',amount:50000,settlement:{playerAmount:100000,receiverAmount:0,commissionAmount:0}},
        {id:'legacy-cross',play:'PP',horse:'4',status:'settled',playerId:'legacy',receiverId:'',amount:100,settlement:{playerAmount:999999,receiverAmount:0,commissionAmount:0}}
      ]}
    ],
    movements:[],exchangeRates:[{id:'fx1',groupId:'g1',date:'2026-09-10',rate:100}],weekClosures:[],pollas:[],audit:[]
  };
}

test('operational ledger isolates groups including legacy untagged rows',()=>{
  const workspace=fixture();
  const g1=scopeItems(workspace,workspace.participants,'g1').map((row)=>row.id);
  const g2=scopeItems(workspace,workspace.participants,'g2').map((row)=>row.id);
  assert.deepEqual(g1,['p1','legacy']);
  assert.deepEqual(g2,['p2']);
});

test('WhatsApp formatter does not leak legacy untagged participants into non-default group',()=>{
  const workspace=fixture();
  const text=generateWhatsappText(workspace,workspace.races.find((race)=>race.id==='r2'));
  assert.match(text,/OTRO LOCAL/);
  assert.match(text,/Otro/);
  assert.doesNotMatch(text,/Legacy/);
  assert.doesNotMatch(text,/999\.999,00/);
});

test('pozo/disponible uses persisted balance plus Bs/USD aval at race rate',()=>{
  const workspace=fixture();
  const rows=balanceRows(workspace,'g1','2026-09-10');
  const zedan=rows.find((row)=>row.participant.id==='p1');
  assert.equal(zedan.balance,1500);
  assert.equal(zedan.available,1800);
  const text=generateBalancesWhatsappText(workspace,rows.map(({participant,balance})=>({participant,balance})));
  assert.match(text,/ZEDAN\t1\.800,00/);
  assert.doesNotMatch(text,/OTRO/);
});

test('balance formatter infers group from rows and excludes mixed-group contamination',()=>{
  const workspace=fixture();
  const rows=balanceRows(workspace,'g2','2026-09-10');
  const contaminated=[...rows,{participant:workspace.participants.find((participant)=>participant.id==='legacy'),balance:999999,available:999999}];
  const text=generateBalancesWhatsappText(workspace,contaminated);
  assert.match(text,/OTRO/);
  assert.doesNotMatch(text,/LEGACY/);
});

test('private statement is generated manually from persisted weekly and race history',()=>{
  const workspace=fixture();
  const statement=participantStatement(workspace,'p1','2026-09-10');
  assert.equal(statement.weekTotal,500);
  assert.equal(statement.dayTotal,500);
  assert.equal(statement.available,1800);
  assert.equal(statement.tracks[0].racetrack,'Churchill Downs');
  assert.equal(statement.tracks[0].races[0].number,1);
  const text=generateParticipantStatementText(workspace,statement);
  assert.match(text,/Cuentas ZEDAN/);
  assert.match(text,/SEMANA: Bs\. \+500,00/);
  assert.match(text,/DISPONIBLE: Bs\. \+1\.800,00/);
  assert.match(text,/Churchill Downs/);
});

test('copy center is manual-only, exports daily text, guarded, and cached offline',()=>{
  const root=process.cwd();
  const center=fs.readFileSync(path.join(root,'frontend/public/hipico-control/assets/js/operational-copy-center.js'),'utf8');
  const guard=fs.readFileSync(path.join(root,'frontend/public/hipico-control/assets/js/operational-access-guard.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'frontend/public/hipico-control/assets/css/operational-copy-center.css'),'utf8');
  const html=fs.readFileSync(path.join(root,'frontend/public/hipico-control/index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'frontend/public/hipico-control/sw.js'),'utf8');
  assert.match(center,/Copiar es manual\. Este panel nunca envía mensajes por sí solo\./);
  assert.match(center,/Archivo del día \(\.txt\)/);
  assert.match(center,/downloadFile\(/);
  assert.doesNotMatch(center,/wa\.me|messages\/send|fetch\(/);
  assert.match(center,/export function mountOperationalCopyCenter/);
  assert.match(guard,/import\('\.\/operational-copy-center\.js'\)/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*min-height:44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html,/operational-copy-center\.css/);
  assert.match(html,/operational-access-guard\.js/);
  assert.doesNotMatch(html,/src="\.\/assets\/js\/operational-copy-center\.js"/);
  assert.match(sw,/operational-ledger\.js/);
  assert.match(sw,/operational-copy-center\.js/);
  assert.match(sw,/operational-copy-center\.css/);
});