import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  exactInvoicedUnits, summarizeInvoicedUnitActivity,
  INVOICED_UNIT_ACTIVITY_VERSION, INVOICED_UNIT_STATUSES
} from '../backend/src/modules/reports/invoiced-unit-activity.ts';

const asOf=new Date('2026-10-15T16:00:00Z');
const line=(id,quantity='1.250',status='issued')=>({
  id,quantity,
  invoice:{id:'invoice-'+id,number:'S-0000'+id,issueDate:new Date('2026-10-13T12:00:00Z'),status,currency:'VES'}
});
const summary=(overrides={})=>summarizeInvoicedUnitActivity({
  totalQuantity:'4.500',lineCount:2,rows:[line('1','2.250'),line('2','2.250','paid')],
  take:25,skip:0,windowDays:90,asOf,...overrides
});

test('normalizes Decimal quantity as three-place exact units',()=>{
  assert.equal(exactInvoicedUnits('2'),'2.000');
  assert.equal(exactInvoicedUnits('2.5'),'2.500');
  assert.equal(exactInvoicedUnits('0002.005'),'2.005');
});
test('zero matching invoices is an honest gross zero',()=>{
  const v=summary({totalQuantity:null,lineCount:0,rows:[]});
  assert.equal(v.summary.grossInvoicedUnitsExact,'0.000');
  assert.equal(v.summary.invoicedLineCount,0);
  assert.equal(v.pagination.hasMore,false);
});
test('gross line quantities do not become revenue, velocity or demand forecast',()=>{
  const v=summary();
  assert.equal(v.summary.grossInvoicedUnitsExact,'4.500');
  assert.equal(v.summary.returnOrCreditNetting,false);
  assert.equal(v.summary.demandForecast,false);
  assert.equal(v.summary.physicalStockOutbound,false);
  assert.equal(v.summary.automaticPurchasing,false);
  assert.equal(v.interpretation,'GROSS_INVOICED_PRODUCT_UNITS_NOT_DEMAND_FORECAST');
});
test('line evidence carries invoice reference and exact quantity, not private amounts',()=>{
  const v=summary();
  assert.deepEqual(Object.keys(v.rows[0]).sort(),[
    'invoiceCurrency','invoiceDate','invoiceId','invoiceNumber','invoiceStatus','lineId','quantityExact'
  ].sort());
  assert.equal(v.rows[0].quantityExact,'2.250');
  assert.equal(v.rows[1].invoiceStatus,'paid');
});
test('only issued, paid, overdue are allowed and published',()=>{
  assert.deepEqual([...INVOICED_UNIT_STATUSES],['issued','paid','overdue']);
  assert.equal(summary({totalQuantity:'1',lineCount:1,rows:[line('3','1','overdue')]}).rows[0].invoiceStatus,'overdue');
  for(const status of ['draft','cancelled','unknown']){
    assert.throws(()=>summary({totalQuantity:'1',lineCount:1,rows:[line('3','1',status)]}),/INVOICED_UNIT_EVIDENCE_INVALID/);
  }
});
test('pagination is truthful when remaining invoice lines exist',()=>{
  const v=summary({totalQuantity:'9.000',lineCount:5,take:2,rows:[line('1'),line('2')]});
  assert.equal(v.pagination.hasMore,true);
  assert.equal(v.pagination.nextSkip,2);
  assert.equal(v.summary.invoicedLineCount,5);
});
test('pagination is truthful for final page and out of range page',()=>{
  const v=summary({totalQuantity:'9.000',lineCount:5,take:2,skip:4,rows:[line('5')]});
  assert.equal(v.pagination.hasMore,false);
  assert.equal(v.pagination.nextSkip,null);
  const outside=summary({lineCount:2,skip:99,rows:[]});
  assert.equal(outside.pagination.hasMore,false);
});
test('refuses truncated or inconsistent database pagination',()=>{
  assert.throws(()=>summary({lineCount:2,rows:[]}),/INVOICED_UNIT_RESULT_INVALID/);
  assert.throws(()=>summary({lineCount:1,rows:[line('1'),line('2')]}),/INVOICED_UNIT_RESULT_INVALID/);
});
test('decimal input rejects signs, exponent, excess scale and formatting ambiguity',()=>{
 for(const value of ['-1','1e6','1.0001','3,000',' 2','NaN','Infinity']){
   assert.throws(()=>exactInvoicedUnits(value),/INVOICED_UNIT_QUANTITY_INVALID/);
 }
});
test('big exact product units survive past JS floating precision',()=>{
  assert.equal(exactInvoicedUnits('900719925474099123456789.123'),'900719925474099123456789.123');
});
test('rejects malformed invoice references, statuses, currency or dates',()=>{
  const invalid=[
    {...line('1'),id:''},
    {...line('1'),invoice:{...line('1').invoice,currency:'unknown'}},
    {...line('1'),invoice:{...line('1').invoice,issueDate:new Date('invalid')}},
    {...line('1'),invoice:{...line('1').invoice,issueDate:new Date('2026-10-16T00:00:00Z')}},
  ];
  for(const bad of invalid){
    assert.throws(()=>summary({lineCount:1,totalQuantity:'1',rows:[bad]}),/INVOICED_UNIT_EVIDENCE_INVALID/);
  }
});
test('input guard rejects unbounded pagination/window and invalid snapshot',()=>{
  for(const p of [{take:101},{take:0},{skip:-1},{skip:1_000_001},{windowDays:0},{windowDays:366},{lineCount:-1},{asOf:new Date('invalid')}])
    assert.throws(()=>summary(p),/INVOICED_UNIT_RESULT_INVALID/);
  assert.equal(summary().version,INVOICED_UNIT_ACTIVITY_VERSION);
});
test('source gate: authenticated tenant and issued-only invoice link under repeatable read',()=>{
  const src=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
  const segment=src.slice(src.indexOf("router.get('/inventory/invoiced-activity'"),src.indexOf("router.get('/inventory/ageing'"));
  assert.match(src,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.match(segment,/tenantId: ctx\.tenantId/);
  assert.match(segment,/status: \{ in: \[\.\.\.SALES_KPI_STATUSES\] \}/);
  assert.match(segment,/issueDate: \{ gte: since, lte: asOf \}/);
  assert.match(segment,/tx\.salesInvoiceLine\.aggregate\(/);
  assert.match(segment,/tx\.salesInvoiceLine\.findMany\(/);
  assert.match(segment,/Prisma\.TransactionIsolationLevel\.RepeatableRead/);
  assert.doesNotMatch(segment,/\.create\(|\.update\(|\.delete\(/);
});
