import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFifoCohortOptions, projectFifoCohortDrilldown } from '../backend/src/modules/reports/fifo-cohort-drilldown.ts';

const now = new Date('2026-10-15T12:00:00Z');
const age = (id, days, units=1000n) => ({ movementId:id, receivedAt:now.getTime()-days*86400000, quantity:units });
const cutoffs = [7,30,90];
const cohorts=[age('a',91),age('b',90),age('c',31),age('d',30),age('e',8),age('f',7),age('g',0)];
const options = (index, take=25, skip=0) => parseFifoCohortOptions('true',String(take),String(skip),undefined,String(index),cutoffs);
const project = (opts, changes={}) => projectFifoCohortDrilldown({
  cohorts, asOf:now, onHandUnits:7000n, options:opts, ...changes
});

test('custom index 0..3 parsed with configured cutoffs',()=>{
  for(let i=0;i<4;i++) assert.deepEqual(options(i),{take:25,skip:0,customRange:{rangeIndex:i,cutoffsDays:cutoffs}});
});
test('custom range not valid without configured bucketDays',()=>{
  for(const x of [undefined,null,[],[7,7,90],[7,30,3651],[0,30,90]])
    assert.throws(()=>parseFifoCohortOptions('true',undefined,undefined,undefined,'1',x),/FIFO_COHORT_QUERY_INVALID/);
});
test('requires true opt-in and forbids fixed and custom filters together',()=>{
  for(const enabled of [undefined,'false'])
    assert.throws(()=>parseFifoCohortOptions(enabled,undefined,undefined,undefined,'1',cutoffs),/FIFO_COHORT_QUERY_INVALID/);
  assert.throws(()=>parseFifoCohortOptions('true',undefined,undefined,'day31to90','1',cutoffs),/FIFO_COHORT_QUERY_INVALID/);
});
test('rejects ambiguous or malformed indices',()=>{
  for(const idx of ['-1','4','01','1.0','1e0',' 1',1,['1'],null,''])
    assert.throws(()=>parseFifoCohortOptions('true',undefined,undefined,undefined,idx,cutoffs),/FIFO_COHORT_QUERY_INVALID/);
});
test('legacy and fixed-bucket parsing remain identical',()=>{
  assert.deepEqual(parseFifoCohortOptions('true',undefined,undefined),{take:25,skip:0});
  assert.deepEqual(parseFifoCohortOptions('true','10','1','day181Plus'),{take:10,skip:1,fixedBucket:'day181Plus'});
});
test('all custom age bands match inclusive cutoffs and remain chronological',()=>{
  const expected=[['f','g'],['d','e'],['b','c'],['a']];
  for(let i=0;i<4;i++){
    const x=project(options(i));
    assert.deepEqual(x.rows.map(y=>y.sourceMovementId),expected[i]);
    assert.equal(x.filter.matchingQuantityExact,expected[i].length+'.000');
    assert.equal(x.totalQuantityExact,'7.000');
  }
});
test('custom filter reports its exact own boundaries, not fixed bucket names',()=>{
  const x=project(options(2));
  assert.deepEqual(x.filter,{type:'CUSTOM_CONFIGURED_RANGE',rangeIndex:2,cutoffsDays:[7,30,90],fromDay:31,toDay:90,matchingCohorts:2,matchingQuantityExact:'2.000'});
  assert.equal(x.rows[0].fixedBucket,'day31to90');
  assert.equal(project(options(3)).filter.toDay,null);
});
test('filtered pagination and full snapshot quantities are never conflated',()=>{
  const x=project(options(1,1,1));
  assert.equal(x.totalCohorts,7);assert.equal(x.totalQuantityExact,'7.000');
  assert.equal(x.filter.matchingCohorts,2);assert.equal(x.filter.matchingQuantityExact,'2.000');
  assert.deepEqual(x.rows.map(y=>y.sourceMovementId),['e']);
  assert.equal(x.pageQuantityExact,'1.000');
  assert.equal(x.pagination.hasMore,false);
});
test('empty filtered interval does not erase on-hand stock',()=>{
  const x=project(options(3),{cohorts:[age('recent',2)],onHandUnits:1000n});
  assert.equal(x.totalQuantityExact,'1.000');assert.equal(x.filter.matchingQuantityExact,'0.000');
  assert.deepEqual(x.rows,[]);assert.equal(x.pageQuantityExact,'0.000');
});
test('whole-ledger mismatch still fails with an empty selected interval or page',()=>{
  assert.throws(()=>project(options(3,1,5000),{onHandUnits:6000n}),/FIFO_COHORT_RECONCILIATION_FAILED/);
});
test('programmatic custom options fail closed for invalid index, cutoffs or conflicting filter',()=>{
  for(const customRange of [
    {rangeIndex:4,cutoffsDays:cutoffs},{rangeIndex:-1,cutoffsDays:cutoffs},
    {rangeIndex:1,cutoffsDays:[30,7,90]},{rangeIndex:1,cutoffsDays:[7,30,3651]}
  ]) assert.throws(()=>project({take:5,skip:0,customRange}),/FIFO_COHORT_INPUT_INVALID/);
  assert.throws(()=>project({...options(2),fixedBucket:'day0to30'}),/FIFO_COHORT_INPUT_INVALID/);
});
test('large exact quantities in full, matching and page never lose thousandths',()=>{
  const large=900719925474099123n;
  const x=project(options(3),{cohorts:[age('old',91,large),age('fresh',1,1n)],onHandUnits:large+1n});
  assert.equal(x.totalQuantityExact,'900719925474099.124');
  assert.equal(x.filter.matchingQuantityExact,'900719925474099.123');
  assert.equal(x.pageQuantityExact,'900719925474099.123');
});
test('source never mutated and lot provenance is explicitly not verified',()=>{
  const frozen=Object.freeze([Object.freeze(age('x',91))]);
  const x=project(options(3),{cohorts:frozen,onHandUnits:1000n});
  assert.equal(frozen[0].quantity,1000n);
  assert.equal(x.rows[0].physicalLotAllocationVerified,false);
  assert.match(x.provenance,/NOT_PHYSICAL_LOT_OR_LOCATION/);
});
