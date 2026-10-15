import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REORDER_SALES_EVIDENCE_VERSION,
  parseReorderSalesOptions,
  projectReorderSalesEvidence
} from '../backend/src/modules/reports/reorder-sales-evidence.ts';

const now = new Date('2026-10-15T15:00:00.000Z');
const group = (id, quantity = '3.125', count = 2) => ({
  productId: id, _sum: { quantity }, _count: { _all: count }
});
const sample = (extra = {}) => projectReorderSalesEvidence({
  asOf: now, salesWindowDays: 90,
  candidates: [{ productId:'p-a' }, { productId:'p-b' }],
  groups: [group('p-a')], ...extra
});

test('off by default to preserve existing report contract and avoid extra SQL',()=>{
  assert.deepEqual(parseReorderSalesOptions(undefined,undefined), {includeSalesEvidence:false,salesWindowDays:90});
  assert.deepEqual(parseReorderSalesOptions('false',undefined), {includeSalesEvidence:false,salesWindowDays:90});
});
test('explicit opt-in with bounded day range',()=>{
  assert.deepEqual(parseReorderSalesOptions('true','1'),{includeSalesEvidence:true,salesWindowDays:1});
  assert.deepEqual(parseReorderSalesOptions('true','365'),{includeSalesEvidence:true,salesWindowDays:365});
  assert.deepEqual(parseReorderSalesOptions('true',undefined),{includeSalesEvidence:true,salesWindowDays:90});
});
test('invalid option, arrays, injected objects and malformed day strings fail closed',()=>{
  for(const [enabled,days] of [['True',undefined],['false','90'],['yes',undefined],
    [true,undefined],[['true'],undefined],['true',0],['true','0'],['true','366'],
    ['true','1e2'],['true','01'],['true',' 10 '],['true',['30']],['true',{n:30}]]) {
    assert.throws(()=>parseReorderSalesOptions(enabled,days),/REORDER_SALES_QUERY_INVALID/);
  }
});
test('projection returns a row for every candidate in original priority order',()=>{
  const r=sample();
  assert.equal(r.items.length,2);
  assert.deepEqual(r.items.map(x=>x.productId),['p-a','p-b']);
  assert.deepEqual(r.items.map(x=>x.grossInvoicedUnitsExact),['3.125','0.000']);
  assert.deepEqual(r.items.map(x=>x.evidenceAvailable),[true,false]);
});
test('missing invoice evidence is no documented sale, not proof of zero demand',()=>{
  const r=sample({groups:[]});
  assert.deepEqual(r.items.map(x=>x.invoiceLineCount),[0,0]);
  assert.equal(r.demandForecast,false);
  assert.equal(r.creditNoteNetting,false);
  assert.equal(r.purchaseOrderCreated,false);
  assert.equal(r.interpretation,'GROSS_INVOICED_UNITS_NOT_NET_DEMAND_OR_PHYSICAL_OUTBOUND');
});
test('normalizes fixed 3-decimal quantities without number conversion',()=>{
  const r=sample({groups:[group('p-a','0004.6',1)]});
  assert.equal(r.items[0].grossInvoicedUnitsExact,'4.600');
  assert.equal(r.items[0].invoiceLineCount,1);
});
test('gross sales totals beyond JavaScript safe integer preserve precision',()=>{
  const r=sample({groups:[group('p-a','900719925474099.123',5)]});
  assert.equal(r.items[0].grossInvoicedUnitsExact,'900719925474099.123');
});
test('allows empty page without phantom evidence',()=>{
  const r=sample({candidates:[],groups:[]});
  assert.equal(r.items.length,0);
  assert.equal(r.scope,'REORDER_CANDIDATES_IN_SCANNED_CATALOG_PAGE');
});
test('refuses group from an unscanned or unrequested product',()=>{
  assert.throws(()=>sample({groups:[group('tenant-b-product')]}),/REORDER_SALES_GROUP_INVALID/);
});
test('rejects duplicate groups, duplicate candidate IDs and nullable keys',()=>{
  assert.throws(()=>sample({groups:[group('p-a'),group('p-a')]}),/REORDER_SALES_GROUP_INVALID/);
  assert.throws(()=>sample({candidates:[{productId:'p-a'},{productId:'p-a'}]}),/REORDER_SALES_CANDIDATE_INVALID/);
  assert.throws(()=>sample({groups:[group(null)]}),/REORDER_SALES_GROUP_INVALID/);
});
test('zero or malformed group values fail closed',()=>{
  for(const qty of ['0','-1','1.0001','NaN','Infinity','1e4','1,000']) {
    assert.throws(()=>sample({groups:[group('p-a',qty)]}),/REORDER_SALES_(GROUP|QUANTITY)_INVALID/);
  }
});
test('invalid group counts do not create false activity',()=>{
  for(const n of [0,-1,1.5,NaN]) {
    assert.throws(()=>sample({groups:[group('p-a','1',n)]}),/REORDER_SALES_GROUP_INVALID/);
  }
});
test('rejects invalid clock and time window',()=>{
  assert.throws(()=>sample({asOf:new Date('invalid')}),/REORDER_SALES_INPUT_INVALID/);
  for(const n of [0,366,1.5,NaN]){
    assert.throws(()=>sample({salesWindowDays:n}),/REORDER_SALES_INPUT_INVALID/);
  }
});
test('output identifies source and non-purchase semantics',()=>{
  const r=sample();
  assert.equal(r.version,REORDER_SALES_EVIDENCE_VERSION);
  assert.deepEqual(r.statusFilter,['issued','paid','overdue']);
  assert.equal(r.source,'SalesInvoiceLine.quantity+SalesInvoice.status/issueDate');
  assert.equal(r.asOf,now.toISOString());
});
