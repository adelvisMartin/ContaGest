import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFifoCohortOptions, projectFifoCohortDrilldown } from '../backend/src/modules/reports/fifo-cohort-drilldown.ts';

const now = new Date('2026-10-15T12:00:00.000Z');
const move = (id, daysAgo, units = 1000n) => ({
  movementId: id, receivedAt: now.getTime() - daysAgo * 86400000, quantity: units
});
const defaultCohorts = [move('a', 181, 2750n), move('b', 100, 1000n), move('c', 31, 1250n), move('d', 7, 500n)];
const preview = (change = {}) => projectFifoCohortDrilldown({
  cohorts: defaultCohorts, asOf: now, onHandUnits: 5500n,
  options: {take: 25, skip: 0, fixedBucket: 'day181Plus'}, ...change
});

test('legacy no bucket option preserves prior parsing response', () => {
  assert.deepEqual(parseFifoCohortOptions('true', undefined, undefined), {take:25, skip:0});
  assert.equal(parseFifoCohortOptions('false', undefined, undefined), null);
});
test('strictly parse each supported fixed bucket with explicit opt-in', () => {
  for(const bucket of ['day0to30','day31to90','day91to180','day181Plus']){
    assert.deepEqual(parseFifoCohortOptions('true','20','4',bucket), {
      take:20,skip:4,fixedBucket:bucket
    });
  }
});
test('reject filter without enabled drilldown or from malformed query', () => {
  for(const args of [
    ['false',undefined,undefined,'day181Plus'],
    [undefined,undefined,undefined,'day181Plus'],
    ['true',undefined,undefined,'aged'],
    ['true',undefined,undefined,'DAY181PLUS'],
    ['true',undefined,undefined,'day31to90 '],
    ['true',undefined,undefined,['day181Plus']],
    ['true',undefined,undefined,null]
  ]) assert.throws(()=>parseFifoCohortOptions(...args),/FIFO_COHORT_QUERY_INVALID/);
});
test('one fixed bucket is selected AFTER full stock reconciliation', () => {
  const d=preview();
  assert.equal(d.totalCohorts,4);
  assert.equal(d.totalQuantityExact,'5.500');
  assert.deepEqual(d.filter,{fixedBucket:'day181Plus',matchingCohorts:1,matchingQuantityExact:'2.750'});
  assert.deepEqual(d.rows.map(x=>x.sourceMovementId),['a']);
  assert.equal(d.pageQuantityExact,'2.750');
  assert.equal(d.pagination.hasMore,false);
});
test('all four bucket filters respect exact boundary ages',()=>{
  const cohorts=[move('a',181),move('b',180),move('c',91),move('d',90),
    move('e',31),move('f',30),move('g',0)];
  for(const [bucket,ids] of [
    ['day181Plus',['a']],['day91to180',['b','c']],
    ['day31to90',['d','e']],['day0to30',['f','g']]
  ]){
    const d=preview({cohorts,onHandUnits:7000n,
      options:{take:20,skip:0,fixedBucket:bucket}});
    assert.deepEqual(d.rows.map(x=>x.sourceMovementId),ids);
    assert.equal(d.filter.matchingQuantityExact,String(ids.length)+'.000');
    assert.equal(d.totalQuantityExact,'7.000');
  }
});
test('pagination operates on matching subset and retains distinct page amount',()=>{
  const cohorts=[move('a',220),move('b',201,2000n),move('c',181,3000n),move('d',10,500n)];
  const d=preview({cohorts,onHandUnits:6500n,options:{
    take:1,skip:1,fixedBucket:'day181Plus'
  }});
  assert.deepEqual(d.rows.map(x=>x.sourceMovementId),['b']);
  assert.deepEqual(d.filter,{fixedBucket:'day181Plus',matchingCohorts:3,matchingQuantityExact:'6.000'});
  assert.equal(d.totalQuantityExact,'6.500');
  assert.equal(d.pageQuantityExact,'2.000');
  assert.equal(d.pagination.nextSkip,2);
  assert.equal(d.pagination.hasMore,true);
});
test('no matching cohort yields zero filtered and page quantity without zeroing canonical stock',()=>{
  const d=preview({options:{take:10,skip:0,fixedBucket:'day0to30'}});
  assert.equal(d.filter.matchingCohorts,1);
  assert.equal(d.filter.matchingQuantityExact,'0.500');
  const noMatch=preview({options:{take:10,skip:0,fixedBucket:'day31to90'}});
  assert.equal(noMatch.filter.matchingCohorts,1);
  assert.equal(noMatch.filter.matchingQuantityExact,'1.250');
  const onlyYoung=preview({cohorts:[move('young',1)],onHandUnits:1000n,
    options:{take:10,skip:0,fixedBucket:'day181Plus'}});
  assert.deepEqual(onlyYoung.rows,[]);
  assert.equal(onlyYoung.totalQuantityExact,'1.000');
  assert.equal(onlyYoung.filter.matchingQuantityExact,'0.000');
  assert.equal(onlyYoung.pageQuantityExact,'0.000');
});
test('out of range offset returns empty page and retains filter match totals',()=>{
  const d=preview({options:{take:2,skip:100,fixedBucket:'day181Plus'}});
  assert.deepEqual(d.rows,[]);
  assert.equal(d.pagination.hasMore,false);
  assert.equal(d.pagination.nextSkip,null);
  assert.equal(d.filter.matchingQuantityExact,'2.750');
  assert.equal(d.pageQuantityExact,'0.000');
});
test('inconsistent full ledger rejects even if chosen filter would hide mismatched cohort',()=>{
  assert.throws(()=>preview({onHandUnits:4000n,options:{take:1,skip:0,fixedBucket:'day181Plus'}}),
    /FIFO_COHORT_RECONCILIATION_FAILED/);
});
test('programmatic unknown bucket fails closed before creating output',()=>{
  assert.throws(()=>preview({options:{take:10,skip:0,fixedBucket:'unknown'}}),
    /FIFO_COHORT_INPUT_INVALID/);
});
test('large bigint amounts retain decimal thousandths for filtered totals',()=>{
  const large=900719925474099123n;
  const d=preview({cohorts:[move('old',181,large),move('young',2,1n)],onHandUnits:large+1n});
  assert.equal(d.totalQuantityExact,'900719925474099.124');
  assert.equal(d.filter.matchingQuantityExact,'900719925474099.123');
  assert.equal(d.pageQuantityExact,'900719925474099.123');
});
test('unfiltered output omits filter field and preserves old pagination contract',()=>{
  const d=preview({options:{take:2,skip:0}});
  assert.equal('filter' in d,false);
  assert.equal(d.totalCohorts,4);
  assert.equal(d.totalQuantityExact,'5.500');
  assert.deepEqual(d.rows.map(x=>x.sourceMovementId),['a','b']);
  assert.deepEqual(d.pagination,{take:2,skip:0,hasMore:true,nextSkip:2,pageScoped:true});
});
