import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectReorderStockRows, prepareReorderStockPage } from '../backend/src/modules/reports/replenishment-candidates.ts';

const row = (productId, patch = {}) => ({
  productId, sku: productId, name: productId, unit: 'UND',
  stockExact: '5.000', reservedExact: '3.000', availableExact: '2.000',
  minStockExact: '4.000', shortfallExact: '2.000',
  status: 'below_minimum', needsReorder: true, ...patch
});
test('duplicate eligible catalog identity rejects the entire page', () => {
  assert.throws(() => prepareReorderStockPage([row('p-1'),row('p-1')]), /REORDER_DUPLICATE_PRODUCT/);
});
test('duplicate identity also rejects when one copy is an exception', () => {
  const negative = row('p-1', {
    stockExact:'0.000', reservedExact:'1.000', availableExact:'-1.000',
    shortfallExact:'5.000', status:'out_of_stock'
  });
  assert.throws(() => prepareReorderStockPage([row('p-1'),negative]), /REORDER_DUPLICATE_PRODUCT/);
  assert.throws(() => prepareReorderStockPage([negative,row('p-1')]), /REORDER_DUPLICATE_PRODUCT/);
});
test('different identities preserve their exact safe sales lookup IDs', () => {
  const p = prepareReorderStockPage([row('p-1'),row('p-2')]);
  assert.deepEqual(p.salesCandidateIds,['p-1','p-2']);
  assert.equal(p.reorderCandidates.length,2);
});
test('a normal single exceptional row remains visible without candidate', () => {
  const result = inspectReorderStockRows([row('p-1', {
    stockExact:'0.000',reservedExact:'1.000',availableExact:'-1.000',
    shortfallExact:'5.000',status:'out_of_stock'
  })]);
  assert.equal(result.stockExceptions[0].reason,'RESERVED_EXCEEDS_STOCK');
  assert.deepEqual(result.eligibleRows,[]);
});
test('empty catalog remains valid and does not manufacture candidates', () => {
  assert.deepEqual(prepareReorderStockPage([]).salesCandidateIds,[]);
});
