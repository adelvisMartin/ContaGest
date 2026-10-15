import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseGrossInvoiceLeadTime, projectGrossInvoiceLeadTimeReview,
  GROSS_INVOICE_LEADTIME_REVIEW_VERSION
} from '../backend/src/modules/reports/gross-invoice-leadtime-review.ts';

const make = (overrides = {}) => projectGrossInvoiceLeadTimeReview({
  candidates: [{productId:'p1',availableExact:'2.000'},{productId:'p2',availableExact:'20.000'}],
  salesItems: [
    {productId:'p1',grossInvoicedUnitsExact:'30.000',invoiceLineCount:4,evidenceAvailable:true},
    {productId:'p2',grossInvoicedUnitsExact:'0.000',invoiceLineCount:0,evidenceAvailable:false}
  ], salesWindowDays:30, leadTimeDays:7, ...overrides
});

test('optional lead time is omitted by default', () => {
  assert.equal(parseGrossInvoiceLeadTime(undefined,false),null);
  assert.equal(parseGrossInvoiceLeadTime(undefined,true),null);
});
test('valid operator-entered lead time must be a bounded positive integer', () => {
  assert.equal(parseGrossInvoiceLeadTime('1',true),1);
  assert.equal(parseGrossInvoiceLeadTime('365',true),365);
});
test('reject lead time without opt-in, malformed strings or multivalue input',()=>{
  for(const [v,e] of [['7',false],['0',true],['366',true],['07',true],['2.0',true],['1e2',true],['-1',true],[' 7 ',true],[['7'],true],[7,true],[{},true]])
    assert.throws(()=>parseGrossInvoiceLeadTime(v,e),/INVOICE_LEADTIME_QUERY_INVALID/);
});
test('gross invoiced throughput exposes coverage and leadtime comparison',()=>{
  const r=make();
  assert.equal(r.rows[0].observedCoverageDaysExact,'2.00');
  assert.equal(r.rows[0].reviewStatus,'AT_OR_BELOW_LEADTIME_PROXY');
  assert.equal(r.rows[1].observedCoverageDaysExact,null);
  assert.equal(r.rows[1].reviewStatus,'NO_GROSS_INVOICES_IN_WINDOW');
});
test('at leadtime boundary compares exact fractions, not rounded display',()=>{
  const r=make({candidates:[{productId:'p',availableExact:'0.334'}],salesItems:[{productId:'p',grossInvoicedUnitsExact:'1.000',invoiceLineCount:1,evidenceAvailable:true}],salesWindowDays:3,leadTimeDays:1});
  assert.equal(r.rows[0].observedCoverageDaysExact,'1.00');
  assert.equal(r.rows[0].reviewStatus,'ABOVE_LEADTIME_PROXY');
});
test('zero free stock is visible even with no invoice sample',()=>{
  const r=make({candidates:[{productId:'p',availableExact:'0'}],salesItems:[{productId:'p',grossInvoicedUnitsExact:'0',invoiceLineCount:0,evidenceAvailable:false}]});
  assert.equal(r.rows[0].reviewStatus,'NO_FREE_STOCK');
  assert.equal(r.rows[0].observedCoverageDaysExact,null);
});
test('large exact Decimal(18,3) values avoid floating point overflow',()=>{
  const r=make({candidates:[{productId:'p',availableExact:'900719925474099.123'}],salesItems:[{productId:'p',grossInvoicedUnitsExact:'0.001',invoiceLineCount:1,evidenceAvailable:true}]});
  assert.equal(r.rows[0].availableExact,'900719925474099.123');
  assert.equal(r.rows[0].reviewStatus,'ABOVE_LEADTIME_PROXY');
});
test('input window/leadtime and cardinality are bounded',()=>{
  for(const cfg of [{salesWindowDays:0},{salesWindowDays:366},{leadTimeDays:0},{leadTimeDays:366},{salesItems:[]}])
    assert.throws(()=>make(cfg),/INVOICE_LEADTIME_INPUT_INVALID/);
});
test('reject duplicate candidates and mismatched linked evidence',()=>{
  const duplicated={candidates:[{productId:'p',availableExact:'1'},{productId:'p',availableExact:'1'}]};
  assert.throws(()=>make(duplicated),/INVOICE_LEADTIME_EVIDENCE_INVALID/);
  assert.throws(()=>make({salesItems:[{productId:'foreign',grossInvoicedUnitsExact:'1',invoiceLineCount:1,evidenceAvailable:true},{productId:'p2',grossInvoicedUnitsExact:'0',invoiceLineCount:0,evidenceAvailable:false}]}),/INVOICE_LEADTIME_EVIDENCE_INVALID/);
});
test('reject inconsistent zero quantities, count and evidence flags',()=>{
  for(const [quantity,count,evidence] of [['0',1,true],['1',0,false],['1',1,false],['0',0,true]]){
    assert.throws(()=>make({candidates:[{productId:'p',availableExact:'1'}],salesItems:[{productId:'p',grossInvoicedUnitsExact:quantity,invoiceLineCount:count,evidenceAvailable:evidence}]}),/INVOICE_LEADTIME_EVIDENCE_INVALID/);
  }
});
test('negative and noncanonical quantities are rejected',()=>{
  for(const str of ['-1','NaN','1e4','1.0001','01',' 2','9999999999999999'])
    assert.throws(()=>make({candidates:[{productId:'p',availableExact:str}],salesItems:[{productId:'p',grossInvoicedUnitsExact:'1',invoiceLineCount:1,evidenceAvailable:true}]}),/INVOICE_LEADTIME_QUANTITY_INVALID/);
});
test('advisory never authorizes purchases or suggests demand forecasting',()=>{
  const r=make();
  assert.equal(r.version,GROSS_INVOICE_LEADTIME_REVIEW_VERSION);
  assert.equal(r.automatedProcurement,false);
  assert.equal(r.demandForecast,false);
  assert.equal(r.netReturnsKnown,false);
  assert.equal(r.locationAllocationVerified,false);
  assert.ok(r.rows.every(x=>x.createsPurchaseOrder===false && x.requiresManualVerification===true));
});
