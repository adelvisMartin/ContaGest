import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveReorderCandidates, inspectReorderStockRows } from '../backend/src/modules/reports/replenishment-candidates.ts';

const row = (fields = {}) => ({
  productId:'product-a',sku:'A',name:'Producto A',unit:'UND',
  stockExact:'5.000',reservedExact:'3.000',availableExact:'2.000',
  minStockExact:'4.000',shortfallExact:'2.000',
  status:'below_minimum',needsReorder:true,...fields
});

test('reconciled low stock remains eligible for review only', () => {
  const v=inspectReorderStockRows([row()]);
  assert.equal(v.eligibleRows.length,1);
  assert.deepEqual(v.stockExceptions,[]);
  assert.equal(deriveReorderCandidates([row()])[0].autoPurchaseEnabled,false);
});
test('over-reserved product excluded from reorder and surfaced as exception', () => {
  const bad=row({stockExact:'2.000',reservedExact:'3.000',availableExact:'-1.000',shortfallExact:'5.000'});
  const inspected=inspectReorderStockRows([bad]);
  assert.equal(deriveReorderCandidates([bad]).length,0);
  assert.equal(inspected.stockExceptions[0].reason,'RESERVED_EXCEEDS_STOCK');
  assert.equal(inspected.stockExceptions[0].manualReconciliationRequired,true);
  assert.equal(inspected.stockExceptions[0].autoPurchaseEnabled,false);
});
test('negative canonical stock is a distinct fail-closed exception', () => {
  const bad=row({stockExact:'-1.000',reservedExact:'0.000',availableExact:'-1.000'});
  assert.equal(inspectReorderStockRows([bad]).stockExceptions[0].reason,'NEGATIVE_STOCK');
  assert.deepEqual(deriveReorderCandidates([bad]),[]);
});
test('negative reservations are reported, not treated as free stock', () => {
  const bad=row({stockExact:'1.000',reservedExact:'-1.000',availableExact:'2.000'});
  assert.equal(inspectReorderStockRows([bad]).stockExceptions[0].reason,'NEGATIVE_RESERVED');
});
test('negative minimum is not silently interpreted as a usable policy', () => {
  const bad=row({minStockExact:'-1.000',shortfallExact:'0.000',needsReorder:false,status:'healthy'});
  assert.equal(inspectReorderStockRows([bad]).stockExceptions[0].reason,'NEGATIVE_MINIMUM');
});
test('mismatched canonical availability stops entire projection', () => {
  assert.throws(()=>inspectReorderStockRows([row({availableExact:'1.999'})]),/REORDER_AVAILABLE_MISMATCH/);
  assert.throws(()=>deriveReorderCandidates([row({availableExact:'1.999'})]),/REORDER_AVAILABLE_MISMATCH/);
});
test('bad data cannot be ignored just because product needsReorder is false', () => {
  assert.throws(()=>deriveReorderCandidates([row({shortfallExact:'1e3',needsReorder:false})]),/REORDER_NONCANONICAL_QUANTITY/);
});
test('supports exact Decimal(18,3) near limits without JavaScript floats', () => {
  const normal=row({stockExact:'999999999999999.999',reservedExact:'999999999999999.998',availableExact:'0.001',minStockExact:'1.000',shortfallExact:'0.999'});
  assert.equal(deriveReorderCandidates([normal])[0].availableExact,'0.001');
});
test('rejects overflow, scientific notation and thousandth precision errors', () => {
  for(const invalid of ['1000000000000000','1e9','0.0001','1,000','NaN'])
    assert.throws(()=>inspectReorderStockRows([row({reservedExact:invalid})]),/REORDER_NONCANONICAL_QUANTITY/);
});
test('a mixed catalog preserves valid candidates and isolates invalid products', () => {
  const bad=row({productId:'p-b',sku:'B',stockExact:'0.000',reservedExact:'1.000',availableExact:'-1.000'});
  const ok=row({productId:'p-c',sku:'C'});
  const input=[row(),bad,ok];
  assert.deepEqual(deriveReorderCandidates(input).map(x=>x.productId),['product-a','p-c']);
  assert.deepEqual(inspectReorderStockRows(input).stockExceptions.map(x=>x.productId),['p-b']);
});
test('no mutation of input, and exception output exposes only inventory fields', () => {
  const bad=Object.freeze(row({stockExact:'0',reservedExact:'1',availableExact:'-1'}));
  const snapshot=inspectReorderStockRows([bad]);
  assert.equal(bad.reservedExact,'1');
  assert.deepEqual(Object.keys(snapshot.stockExceptions[0]).sort(),[
    'productId','sku','reason','stockExact','reservedExact','availableExact','manualReconciliationRequired','autoPurchaseEnabled'
  ].sort());
});
