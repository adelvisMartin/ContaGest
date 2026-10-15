import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  projectConsolidatedBalances, consolidateFilterDefaults, moveConsolidatorColumn,
  validateColumnOrder, CONSOLIDATOR_COLUMNS
} from '../frontend/public/hipico-control/assets/js/reference-report-consolidator.js';
import {
  consolidatedVisibleMatrix, consolidatedVisibleText, consolidatedVisiblePdfLines, renderConsolidator
} from '../frontend/public/hipico-control/assets/js/reference-report-consolidator-ui.js';

function fixture() {
  const participants=Array.from({length:42},(_,index)=>({
    id:'p'+index,groupId:'triple-c',code:'C'+String(index).padStart(2,'0'),
    name:index===40?'=HYPERLINK("https://invalid.example","X")':'Cuenta '+index,
    openingBalance:index===0?100:0,avalBs:index===0?20:0,avalUsd:0
  }));
  participants.push({id:'outside',groupId:'other',code:'SECRET-OTHER',name:'Privado',openingBalance:999});
  const moves=Array.from({length:22},(_,i)=>({
    id:'dep'+i,groupId:'triple-c',date:'2026-10-14',type:'deposit',
    participantId:'p'+i,amount:100,currency:'VES',status:'posted',createdAt:'2026-10-14T14:00:00Z'
  }));
  moves.push(
    {id:'t1',groupId:'triple-c',date:'2026-10-14',type:'transfer',
      participantId:'p0',counterpartyId:'p1',amount:30,currency:'VES',status:'posted',createdAt:'2026-10-15T03:50:00Z'},
    {id:'c1',groupId:'triple-c',date:'2026-10-14',type:'deposit',
      participantId:'p0',amount:500,currency:'VES',status:'cancelled',createdAt:'2026-10-14T22:00:00Z'},
    {id:'wrong',groupId:'other',date:'2026-10-14',type:'deposit',
      participantId:'outside',amount:9999,currency:'USD',status:'posted',createdAt:'2026-10-14T10:00:00Z'}
  );
  return {
    config:{activeGroupId:'triple-c',groups:[
      {id:'triple-c',name:'Triple C',companyName:'Club Triple C',currency:'Bs.',exchangeRate:2},
      {id:'other',name:'Otro',companyName:'No visible',currency:'USD',exchangeRate:2}
    ]},
    participants,
    races:[{id:'r1',groupId:'triple-c',date:'2026-10-14',number:1,
      racetrack:'Remington',board:['2','7'],
      bets:[{id:'b1',playerId:'p0',receiverId:'p1',play:'2N',horse:'2',amount:50,
        status:'settled',settlement:{playerAmount:47.5,receiverAmount:-50,commissionAmount:2.5}}]}],
    movements:moves,days:[],exchangeRates:[],
    weekClosures:[],audit:[]
  };
}
const query={groupId:'triple-c',date:'2026-10-14'};

test('reference 42 clients, 21 visible page, default hiding and no foreign names',()=>{
  const raw=fixture(),copy=structuredClone(raw);
  const report=projectConsolidatedBalances(raw,query);
  assert.equal(report.totalCount,42);
  assert.equal(report.matchingCount,22);
  assert.equal(report.pageRows.length,21);
  assert.equal(report.pages,2);
  assert.equal(report.page,1);
  assert.equal(projectConsolidatedBalances(raw,{...query,page:2}).pageRows.length,1);
  assert.equal(projectConsolidatedBalances(raw,{...query,hideInactive:false}).matchingCount,42);
  assert.ok(!JSON.stringify(report).includes('SECRET-OTHER'));
  assert.deepEqual(raw,copy,'model must be read-only');
});

test('ledger-derived available and settled wager day/week remain independent of movement currency',()=>{
  const report=projectConsolidatedBalances(fixture(),query);
  const p0=report.rows.find(r=>r.id==='p0');
  assert.equal(p0.today,47.5);
  assert.equal(p0.week,47.5);
  // Opening 100 + deposit 100 + settled +47.50 - transfer 30 = 217.50, plus 20 aval.
  assert.equal(p0.available,237.5);
  assert.equal(p0.aval,20);
  assert.deepEqual(p0.deposit,{VES:100});
  assert.deepEqual(p0.transfer,{VES:-30});
  assert.equal(p0.refund,null,'no refund-type source is NOT numeric zero');
  assert.equal(report.refundSupported,false);
  assert.equal(report.allTotals.deposit.VES,2200);
  assert.equal(report.allTotals.transfer.VES,0,'sender and receiver should net to zero');
  assert.equal(report.allTotals.available>report.filteredTotals.available,false); // no money-bearing rows hidden
});

test('sign and column filters select only the indicated group participants',()=>{
  const data=fixture();
  const receiver=projectConsolidatedBalances(data,{...query,hideInactive:false,signColumn:'transfer',sign:'positive'});
  assert.deepEqual(receiver.matching.map(r=>r.id),['p1']);
  const sender=projectConsolidatedBalances(data,{...query,hideInactive:false,signColumn:'transfer',sign:'negative'});
  assert.deepEqual(sender.matching.map(r=>r.id),['p0']);
  const zeros=projectConsolidatedBalances(data,{...query,hideInactive:false,signColumn:'transfer',sign:'zero'});
  assert.equal(zeros.matchingCount,40);
  const unknown=projectConsolidatedBalances(data,{...query,signColumn:'refund',sign:'zero',hideInactive:false});
  assert.equal(unknown.matchingCount,0,'unavailable refund must never be treated as zero');
  assert.equal(projectConsolidatedBalances(data,{...query,search:'c01'}).matchingCount,1);
});

test('filtered totals never accidentally substitute whole-group totals',()=>{
  const model=projectConsolidatedBalances(fixture(),{...query,search:'C00'});
  assert.equal(model.totalCount,42);
  assert.equal(model.matchingCount,1);
  assert.equal(model.filteredTotals.deposit.VES,100);
  assert.equal(model.allTotals.deposit.VES,2200);
  assert.equal(model.filteredTotals.participantCount,1);
  assert.equal(model.allTotals.participantCount,42);
});

test('explicit refund typing appears only if source contains exact refund movement',()=>{
  const input=fixture();
  input.movements.push({id:'refund1',groupId:'triple-c',date:'2026-10-14',
    type:'refund',participantId:'p0',amount:12,currency:'USD',status:'posted',createdAt:'2026-10-14T22:00:00Z'});
  const result=projectConsolidatedBalances(input,query);
  assert.equal(result.refundSupported,true);
  assert.equal(result.rows[0].refund.USD,12);
  assert.equal(result.allTotals.refund.USD,12);
});

test('reorder button preserves column permutation and remains reversible',()=>{
  const original=CONSOLIDATOR_COLUMNS.map(v=>v.id);
  const reordered=moveConsolidatorColumn(original,'refund',-1);
  assert.equal(reordered.indexOf('refund'),original.indexOf('refund')-1);
  assert.deepEqual(moveConsolidatorColumn(reordered,'refund',1),original);
  assert.deepEqual(validateColumnOrder(['available','available']),original);
  assert.deepEqual(original,CONSOLIDATOR_COLUMNS.map(v=>v.id),'no shared mutation');
});

test('page exports contain exact visible rows/ordered columns, not all 42 clients',()=>{
  const model=projectConsolidatedBalances(fixture(),{...query,hideInactive:false,page:2});
  assert.equal(model.pageRows.length,21);
  const matrix=consolidatedVisibleMatrix(model);
  assert.equal(matrix.length,22);
  assert.equal(matrix[0][0],'Participante');
  assert.ok(matrix[1][0].includes('C21'));
  assert.ok(!JSON.stringify(matrix).includes('SECRET-OTHER'));
  const pdf=consolidatedVisiblePdfLines(model);
  assert.equal(pdf.some(x=>x.includes('Pagina 2/2')),true);
  const text=consolidatedVisibleText(model);
  assert.equal(text.split('\n').length,23);
  const injected = {
    ...model, pageRows:[{...model.pageRows[0], code:'=HYPERLINK("https://invalid.example","X")', name:''}]
  };
  assert.ok(consolidatedVisibleText(injected).includes("'=HYPERLINK"),'formula-leading spreadsheet strings must be prefixed');
});

test('render includes every observed third-view control and escapes untrusted labels',()=>{
  const model=projectConsolidatedBalances(fixture(),{...query,hideInactive:false,page:2});
  const html=renderConsolidator(model,{status:'Sin conexión · datos locales'});
  for(const action of [
    'consolidator-copy','consolidator-xlsx','consolidator-pdf','consolidator-png',
    'consolidator-today','consolidator-clear','reference-report-refresh',
    'consolidator-move-column','consolidator-page'
  ])assert.ok(html.includes('data-action="'+action+'"'),action);
  assert.ok(html.includes('consolidator-filter-form'));
  assert.ok(html.includes('Sin conexión'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('No disponible'));
  assert.ok(html.includes('Totales del grupo completo'));
  assert.ok(html.includes('Totales de las cuentas filtradas'));
});

test('reject historic cross-group money even when selected-day rows are otherwise valid',()=>{
  const w=fixture();
  w.races.push({id:'bad',groupId:'triple-c',date:'2026-10-13',racetrack:'Other',
    bets:[{id:'betBad',playerId:'outside',play:'2N',horse:'1',amount:100,
      status:'settled',settlement:{playerAmount:500}}]});
  assert.throws(()=>projectConsolidatedBalances(w,query),/históricas fuera del grupo/);
  const v=fixture();
  v.movements.push({id:'badx',groupId:'triple-c',date:'2026-10-13',
    type:'transfer',participantId:'p0',counterpartyId:'outside',
    amount:300,currency:'VES',status:'posted'});
  assert.throws(()=>projectConsolidatedBalances(v,query),/históricos fuera del grupo/);
});

test('PWA and Android parity include three consolidator modules with rotated cache',()=>{
  const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const sw=read('frontend/public/hipico-control/sw.js');
  const android=read('android/hipico-control-v1130/scripts/sync-web.mjs');
  const app=read('frontend/public/hipico-control/assets/js/app.js');
  assert.match(sw,/shell-r38-consolidator-v4-1-3/);
  for(const p of ['reference-report-consolidator.js','reference-report-consolidator-ui.js',
    'reference-report-consolidator-image.js']){
    assert.ok(sw.includes(p)); assert.ok(android.includes(p)); assert.ok(app.includes(p));
  }
  assert.ok(!sw.includes('websimproco.com'));
});
