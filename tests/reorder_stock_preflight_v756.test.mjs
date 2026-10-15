import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareReorderStockPage } from '../backend/src/modules/reports/replenishment-candidates.ts';

const row = (extra={}) => ({
  productId:'product-a',sku:'A',name:'Product A',unit:'UND',
  stockExact:'5.000', reservedExact:'3.000', availableExact:'2.000',
  minStockExact:'4.000',shortfallExact:'2.000',status:'below_minimum', needsReorder:true,
  ...extra
});

test('canonical low stock is one safe candidate with its sales query product id',()=>{
  const out=prepareReorderStockPage([row()]);
  assert.equal(out.reorderCandidates.length,1);
  assert.deepEqual(out.salesCandidateIds,['product-a']);
  assert.equal(out.stockReview.stockExceptions.length,0);
});
test('over-reservation is reported but omitted from sales query product ids',()=>{
  const bad=row({stockExact:'1.000',reservedExact:'2.000',availableExact:'-1.000',shortfallExact:'5.000'});
  const out=prepareReorderStockPage([bad]);
  assert.equal(out.rows.length,1);
  assert.equal(out.reorderCandidates.length,0);
  assert.deepEqual(out.salesCandidateIds,[]);
  assert.equal(out.stockReview.stockExceptions[0].reason,'RESERVED_EXCEEDS_STOCK');
});
test('mixed safe and unsafe rows do not expose unsafe invoice query keys',()=>{
  const bad=row({productId:'product-b',sku:'B',stockExact:'0.000',reservedExact:'1.000',availableExact:'-1.000',shortfallExact:'5.000'});
  const safe=row({productId:'product-c',sku:'C'});
  const out=prepareReorderStockPage([bad,row(),safe]);
  assert.deepEqual(out.salesCandidateIds,['product-a','product-c']);
  assert.deepEqual(out.stockReview.stockExceptions.map(x=>x.productId),['product-b']);
  assert.equal(out.rows.length,3);
});
test('invalid available arithmetic aborts before publishing any candidates',()=>{
  assert.throws(()=>prepareReorderStockPage([row(),row({productId:'bad',sku:'Z',availableExact:'2.001'})]),
    /REORDER_AVAILABLE_MISMATCH/);
});
test('malformed canonical quantity aborts even if sales candidates exist',()=>{
  assert.throws(()=>prepareReorderStockPage([row(),row({productId:'bad',sku:'Z',reservedExact:'NaN'})]),
    /REORDER_NONCANONICAL_QUANTITY/);
});
test('out-of-stock, negative stock and negative reserved never produce commercial keys',()=>{
  const invalid=[
    row({productId:'negative',stockExact:'-1.000',reservedExact:'0.000',availableExact:'-1.000'}),
    row({productId:'reserved',stockExact:'1.000',reservedExact:'-1.000',availableExact:'2.000'}),
  ];
  const out=prepareReorderStockPage(invalid);
  assert.deepEqual(out.salesCandidateIds,[]);
  assert.deepEqual(out.stockReview.stockExceptions.map(x=>x.reason),['NEGATIVE_STOCK','NEGATIVE_RESERVED']);
});
test('at-minimum and healthy rows preserve review eligibility semantics',()=>{
  const out=prepareReorderStockPage([
    row({productId:'minimum',sku:'M',stockExact:'4.000',reservedExact:'0.000',availableExact:'4.000',shortfallExact:'0.000',status:'at_minimum'}),
    row({productId:'healthy',sku:'H',stockExact:'10.000',reservedExact:'0.000',availableExact:'10.000',shortfallExact:'0.000',needsReorder:false,status:'healthy'}),
  ]);
  assert.deepEqual(out.salesCandidateIds,['minimum']);
  assert.equal(out.reorderCandidates[0].action,'REVIEW_REORDER_POINT');
});
test('BigInt thousandths stay exact at Decimal 18,3 ceiling',()=>{
  const out=prepareReorderStockPage([row({stockExact:'999999999999999.999',reservedExact:'999999999999999.998',availableExact:'0.001',shortfallExact:'3.999'})]);
  assert.equal(out.reorderCandidates[0].availableExact,'0.001');
});
test('does not mutate source rows or change manual approval and no-purchase flags',()=>{
  const source=Object.freeze(row());
  const out=prepareReorderStockPage([source]);
  assert.strictEqual(out.rows[0],source);
  assert.equal(out.reorderCandidates[0].manualApprovalRequired,true);
  assert.equal(out.reorderCandidates[0].autoPurchaseEnabled,false);
});
test('no scan results produces no phantom sales lookup or exceptions',()=>{
  const out=prepareReorderStockPage([]);
  assert.deepEqual(out.salesCandidateIds,[]);
  assert.deepEqual(out.stockReview.stockExceptions,[]);
});
test('route source gates: preflight and 409 happen inside transaction before any optional invoice SQL',()=>{
  const text=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
  const begin=text.indexOf("router.get('/inventory/reorder',");
  const end=text.indexOf("router.get('/taxes',",begin);
  assert.ok(begin>=0 && end>begin);
  const route=text.slice(begin,end);
  const startTx=route.indexOf('await prisma.$transaction(async tx =>');
  const validation=route.indexOf('prepareReorderStockPage(');
  const catchError=route.indexOf('REORDER_STOCK_PROJECTION_CONFLICT');
  const aggregate=route.indexOf('tx.salesInvoiceLine.groupBy(');
  const txEnd=route.indexOf('}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });');
  assert.ok(startTx>=0 && startTx<validation && validation<catchError && catchError<aggregate && aggregate<txEnd);
  assert.match(route,/salesOptions\.includeSalesEvidence\s*\?\s*scan\.salesCandidateIds/);
  assert.match(route,/tenantId: ctx\.tenantId/);
  assert.match(text,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.doesNotMatch(route,/\b(?:prisma|tx)\.\w+\.(?:create|update|upsert|delete)\(/);
});
