import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseFifoCohortOptions, projectFifoCohortDrilldown,
  FIFO_COHORT_DRILLDOWN_VERSION, FIFO_COHORT_PAGE_MAX
} from '../backend/src/modules/reports/fifo-cohort-drilldown.ts';

const asOf = new Date('2026-10-15T06:00:00.000Z');
const cohort = (id, daysAgo, units=1000n) => ({
  movementId:id,receivedAt:asOf.getTime()-daysAgo*86400000,quantity:units
});
const project = (change={}) => projectFifoCohortDrilldown({
  cohorts:[cohort('a',181),cohort('b',90,2750n),cohort('c',30,1250n)],
  asOf,onHandUnits:5000n,options:{take:25,skip:0},...change
});

test('legacy omitted and explicit false omit drilldown',()=>{
  assert.equal(parseFifoCohortOptions(undefined,undefined,undefined),null);
  assert.equal(parseFifoCohortOptions('false',undefined,undefined),null);
});
test('explicit true permits bounded default and custom page controls',()=>{
  assert.deepEqual(parseFifoCohortOptions('true',undefined,undefined),{take:25,skip:0});
  assert.deepEqual(parseFifoCohortOptions('true','100','5000'),{take:100,skip:5000});
});
test('strict query rejects arrays, booleans, unknown flags, bad page limits',()=>{
  for(const args of [
    [true,undefined,undefined],['TRUE',undefined,undefined],['false','10',undefined],
    [undefined,undefined,'0'],[['true'],undefined,undefined],
    ['true','0',undefined],['true','101',undefined],['true','1','5001'],
    ['true','01',undefined],['true','1e2',undefined],['true','25','-1'],
    ['true',{},undefined],['true',' 25',undefined],['true',null,undefined]
  ]) assert.throws(()=>parseFifoCohortOptions(...args),/FIFO_COHORT_QUERY_INVALID/);
});
test('reports surviving inbound movement identity with exact decimal quantity',()=>{
  const report=project();
  assert.equal(report.version,FIFO_COHORT_DRILLDOWN_VERSION);
  assert.deepEqual(report.rows.map(r=>r.sourceMovementId),['a','b','c']);
  assert.deepEqual(report.rows.map(r=>r.remainingQuantityExact),['1.000','2.750','1.250']);
  assert.equal(report.totalQuantityExact,'5.000');
  assert.equal(report.pageQuantityExact,'5.000');
  assert.ok(report.rows.every(r=>r.physicalLotAllocationVerified===false));
});
test('boundary ages use same fixed bucket contract as canonical FIFO ageing',()=>{
  const c=[30,31,90,91,180,181].reverse().map((days,i)=>cohort(String(i),days));
  const d=project({cohorts:c,onHandUnits:6000n});
  assert.deepEqual(d.rows.map(r=>r.fixedBucket),[
    'day181Plus','day91to180','day91to180','day31to90','day31to90','day0to30'
  ]);
});
test('selected page quantity is not deceptively labelled full stock',()=>{
  const d=project({options:{take:1,skip:1}});
  assert.equal(d.totalQuantityExact,'5.000');
  assert.equal(d.pageQuantityExact,'2.750');
  assert.equal(d.totalCohorts,3);
  assert.deepEqual(d.rows.map(r=>r.sourceMovementId),['b']);
  assert.deepEqual(d.pagination,{take:1,skip:1,hasMore:true,nextSkip:2,pageScoped:true});
});
test('last page is complete and out-of-range pages are honest',()=>{
  const last=project({options:{take:2,skip:2}});
  assert.equal(last.pageQuantityExact,'1.250');
  assert.equal(last.pagination.hasMore,false);
  assert.equal(last.pagination.nextSkip,null);
  const beyond=project({options:{take:3,skip:20}});
  assert.deepEqual(beyond.rows,[]);
  assert.equal(beyond.pageQuantityExact,'0.000');
  assert.equal(beyond.pagination.hasMore,false);
});
test('empty reconciled stock has no phantom cohorts',()=>{
  const d=project({cohorts:[],onHandUnits:0n});
  assert.equal(d.totalCohorts,0);
  assert.equal(d.totalQuantityExact,'0.000');
  assert.deepEqual(d.rows,[]);
});
test('very large precise thousandths never round via JS number',()=>{
  const quantity=900719925474099123450n;
  const d=project({cohorts:[cohort('large',10,quantity)],onHandUnits:quantity});
  assert.equal(d.rows[0].remainingQuantityExact,'900719925474099123.450');
});
test('ledger mismatch fails closed even if the requested page is empty',()=>{
  assert.throws(()=>project({onHandUnits:4999n,options:{take:1,skip:5000}}),/FIFO_COHORT_RECONCILIATION_FAILED/);
});
test('unsorted or duplicate source movement identifiers fail closed',()=>{
  assert.throws(()=>project({cohorts:[cohort('b',10),cohort('a',20)],onHandUnits:2000n}),/FIFO_COHORT_INVALID/);
  assert.throws(()=>project({cohorts:[cohort('same',10),cohort('same',9)],onHandUnits:2000n}),/FIFO_COHORT_INVALID/);
});
test('future entry timestamps and invalid timestamps are rejected',()=>{
  assert.throws(()=>project({cohorts:[cohort('later',-1)],onHandUnits:1000n}),/FIFO_COHORT_INVALID/);
  assert.throws(()=>project({cohorts:[{movementId:'x',receivedAt:NaN,quantity:1000n}],onHandUnits:1000n}),/FIFO_COHORT_INVALID/);
});
test('nonpositive cohort amounts and missing movement ids are rejected',()=>{
  assert.throws(()=>project({cohorts:[cohort('zero',10,0n)],onHandUnits:0n}),/FIFO_COHORT_INVALID/);
  assert.throws(()=>project({cohorts:[cohort('neg',10,-1n)],onHandUnits:0n}),/FIFO_COHORT_INVALID/);
  assert.throws(()=>project({cohorts:[cohort('',10)],onHandUnits:1000n}),/FIFO_COHORT_INVALID/);
});
test('invalid projection bounds, total types and clock reject',()=>{
  for(const args of [
    {options:{take:0,skip:0}}, {options:{take:101,skip:0}},
    {options:{take:1,skip:5001}}, {options:{take:1.5,skip:0}},
    {onHandUnits:-1n},{onHandUnits:'5000'}, {asOf:new Date('bad')}
  ]) assert.throws(()=>project(args),/FIFO_COHORT_INPUT_INVALID/);
});
test('input remains immutable and report explicitly disclaims lot/location authority',()=>{
  const cohorts=Object.freeze([Object.freeze(cohort('x',90))]);
  const d=project({cohorts,onHandUnits:1000n});
  assert.equal(cohorts[0].quantity,1000n);
  assert.match(d.provenance,/NOT_PHYSICAL_LOT_OR_LOCATION/);
  assert.equal(d.consistency,'REQUEST_SNAPSHOT_ONLY');
  assert.equal(FIFO_COHORT_PAGE_MAX,100);
});
