import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseAgeingCutoffs, projectConfigurableAgeBuckets } from '../backend/src/modules/reports/configurable-ageing.ts';
import { calculateStockAgeing } from '../backend/src/modules/reports/stock-ageing-fifo.ts';

const asOf = new Date('2026-10-15T08:00:00Z');
const cohort = (days, quantity=1000n) => ({receivedAt:asOf.getTime()-days*86_400_000,quantity});
const movement = (id, days) => ({id,type:'in',quantity:'1.000',createdAt:new Date(asOf.getTime()-days*86_400_000)});

test('omitted custom bands preserves existing response', () => {
 assert.equal(parseAgeingCutoffs(undefined),null);
 const legacy=calculateStockAgeing({movements:[movement('a',30)],stockExact:'1.000',asOf});
 assert.equal('customBuckets' in legacy,false);
 assert.equal(legacy.buckets.day0to30Exact,'1.000');
});
test('strictly increasing bands parse',()=>assert.deepEqual(parseAgeingCutoffs('7,30,90'),[7,30,90]));
test('maximal valid 3650-day end',()=>assert.deepEqual(parseAgeingCutoffs('1,2,3650'),[1,2,3650]));
test('invalid query types, duplicates, direction, whitespace and overflow fail closed',()=>{
 for(const x of ['',null,42,['7,30,90'],'0,2,3','7,7,90','90,30,7',
 '7,30,3651','07,30,90','7, 30,90','1,2,3,4','1e2,20,30']) {
  assert.throws(()=>parseAgeingCutoffs(x),/AGEING_BUCKET_QUERY_INVALID/);
 }
});
test('boundary days are inclusive of configured cutoffs',()=>{
 const p=projectConfigurableAgeBuckets([cohort(0),cohort(7),cohort(8),cohort(30),cohort(31),cohort(90),cohort(91)],asOf,[7,30,90]);
 assert.deepEqual(p.ranges.map(x=>x.quantityExact),['2.000','2.000','2.000','1.000']);
 assert.deepEqual(p.ranges.map(x=>x.fromDay),[0,8,31,91]);
 assert.deepEqual(p.ranges.map(x=>x.toDay),[7,30,90,null]);
});
test('exact BigInt amounts preserve values above JS safe integer',()=>{
 const p=projectConfigurableAgeBuckets([cohort(5,900719925474099100n)],asOf,[7,30,90]);
 assert.equal(p.ranges[0].quantityExact,'900719925474099.100');
});
test('empty stock returns four exact zeros',()=>{
 assert.deepEqual(projectConfigurableAgeBuckets([],asOf,[7,30,90]).ranges.map(x=>x.quantityExact),['0.000','0.000','0.000','0.000']);
});
test('future cohorts and negative balances must not be projected',()=>{
 assert.throws(()=>projectConfigurableAgeBuckets([cohort(-1)],asOf,[7,30,90]),/AGEING_BUCKET_CLOCK_INVALID/);
 assert.throws(()=>projectConfigurableAgeBuckets([cohort(1,-1n)],asOf,[7,30,90]),/AGEING_BUCKET_NEGATIVE_QUANTITY/);
});
test('rejects programmatic invalid cutoffs',()=>assert.throws(()=>projectConfigurableAgeBuckets([],asOf,[30,7,90]),/AGEING_BUCKET_QUERY_INVALID/));
test('never claims physical lot provenance',()=>{
 assert.equal(projectConfigurableAgeBuckets([cohort(1)],asOf,[7,30,90]).source,'RECONCILED_FIFO_ESTIMATE_NOT_LOT_ALLOCATION');
});
test('integrated FIFO algorithm appends custom bands without changing fixed bins',()=>{
 const moves=[movement('a',91),movement('b',90),movement('c',31),movement('d',30),movement('e',8),movement('f',7)];
 const row=calculateStockAgeing({movements:moves,stockExact:'6.000',asOf,bucketCutoffs:[7,30,90]});
 assert.equal(row.stockExact,'6.000');
 assert.deepEqual(row.customBuckets.ranges.map(x=>x.quantityExact),['1.000','2.000','2.000','1.000']);
 assert.equal(row.buckets.day31to90Exact,'3.000');
});
test('custom bands never override reconciliation guard',()=>{
 assert.throws(()=>calculateStockAgeing({movements:[movement('a',7)],stockExact:'2.000',asOf,bucketCutoffs:[7,30,90]}),e=>e.code==='AGEING_LEDGER_MISMATCH');
});
test('report endpoint requires server tenant, RBAC and strict input before querying',()=>{
 const routes=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
 const section=routes.slice(routes.indexOf("router.get('/inventory/ageing'"),routes.indexOf('// Catalog-only alert.'));
 assert.match(routes,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
 assert.match(routes,/bucketDays: z\.string\(\)\.optional\(\)/);
 assert.match(section,/parseAgeingCutoffs\(query\.data\.bucketDays\)/);
 assert.match(section,/AGEING_BUCKET_QUERY_INVALID/);
 assert.match(section,/where: \{ id: query\.data\.productId, tenantId: ctx\.tenantId \}/);
 assert.match(section,/Prisma\.TransactionIsolationLevel\.RepeatableRead/);
 assert.match(section,/bucketCutoffs/);
});
