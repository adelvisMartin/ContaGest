import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
 SALES_KPI_VERSION, SALES_KPI_STATUSES, salesKpiDecimal, salesKpiRows, salesKpiDocumentRows
} from '../backend/src/modules/reports/sales-kpi.ts';

const sample = {
  currency:'VES', status:'paid', _count:{_all:2},
  _sum:{ subtotal:{toString:()=> '9007199254740999.12'}, iva:{toString:()=> '144.00'}, total:{toString:()=> '9007199254741143.12'} }
};

test('metadata names stable version and excluded draft/cancelled states', () => {
  assert.equal(SALES_KPI_VERSION,'sales-kpi-v1');
  assert.deepEqual([...SALES_KPI_STATUSES], ['issued','paid','overdue']);
  assert.equal(SALES_KPI_STATUSES.includes('draft'), false);
});
test('preserves money beyond JS safe integer using exact strings', () => {
 const [kpi]=salesKpiRows([sample]);
 assert.equal(kpi.totalExact,'9007199254741143.12');
 assert.equal(kpi.subtotalExact,'9007199254740999.12');
 assert.equal(kpi.invoiceCount,2);
});
test('never merges values from distinct currencies or status buckets', () => {
 const rows=salesKpiRows([
   sample, {currency:'USD',status:'issued',_count:{_all:1},_sum:{subtotal:'10.00',iva:'1.60',total:'11.60'}},
   {currency:'USDT',status:'paid',_count:{_all:1},_sum:{subtotal:'20.00',iva:'0',total:'20.00'}}
 ]);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.currency),['VES','USD','USDT']);
 assert.equal(rows[2].totalExact,'20.00');
});
test('empty SUM values are represented as exact zero', () => {
 assert.deepEqual(salesKpiRows([{currency:'USD',status:'overdue',_count:{_all:0},_sum:{total:null,subtotal:null,iva:null}}])[0],
   {currency:'USD',status:'overdue',invoiceCount:0,subtotalExact:'0',ivaExact:'0',totalExact:'0'});
});
test('rejects unsafe decimals and exponent notation from providers', () => {
 for(const input of ['NaN','Infinity','1e+20','1,000','']) assert.throws(()=>salesKpiDecimal(input),/KPI_DECIMAL_NOT_CANONICAL/);
});
test('rejects unknown statuses and unsafe currency/aggregate count', () => {
 assert.throws(()=>salesKpiRows([{...sample,status:'draft'}]),/KPI_GROUP_INVALID/);
 assert.throws(()=>salesKpiRows([{...sample,currency:'USD;DROP'}]),/KPI_GROUP_INVALID/);
 assert.throws(()=>salesKpiRows([{...sample,_count:{_all:-1}}]),/KPI_GROUP_INVALID/);
});
test('returns only allowlisted invoice drill-down fields', () => {
 const rows=salesKpiDocumentRows([{
   id:'invoice1',number:'A-2',issueDate:new Date('2026-09-30T23:59:59Z'),
   fiscalPeriod:'2026-09',currency:'VES',status:'paid',
   subtotal:'100.00',iva:'16.00',total:'116.00',tenantId:'foreign',notes:'private'
 }]);
 assert.deepEqual(rows,[{id:'invoice1',number:'A-2',issueDate:'2026-09-30T23:59:59.000Z',
   fiscalPeriod:'2026-09',currency:'VES',status:'paid',subtotalExact:'100.00',ivaExact:'16.00',totalExact:'116.00'}]);
});
test('routes enforce server tenant and fiscal period, repeatable-read and authoritative aggregates', () => {
 const text=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
 assert.match(text,/router\.get\('\/operational\/sales'/);
 assert.match(text,/tenantId: ctx\.tenantId/);
 assert.match(text,/fiscalPeriod: period/);
 assert.match(text,/Prisma\.TransactionIsolationLevel\.RepeatableRead/);
 assert.match(text,/tx\.salesInvoice\.groupBy/);
 assert.match(text,/tx\.salesInvoice\.findMany/);
 assert.match(text,/SALES_KPI_STATUSES/);
 assert.match(text,/take: take \+ 1/);
});
