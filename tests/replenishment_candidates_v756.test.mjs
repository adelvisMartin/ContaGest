import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deriveReorderCandidates } from '../backend/src/modules/reports/replenishment-candidates.ts';

const row = (overrides = {}) => ({
  productId:'p-1', sku:'SKU-1', name:'Producto', unit:'UND',
  stockExact:'5.000', reservedExact:'3.000',
  availableExact:'2.000', minStockExact:'4.000',
  shortfallExact:'2.000', needsReorder:true, status:'below_minimum',
  ...overrides
});
test('calculates advisory candidates from canonical deficit without stock effects', () => {
  const [candidate] = deriveReorderCandidates([row()]);
  assert.equal(candidate.minShortfallExact,'2.000');
  assert.equal(candidate.availableExact,'2.000');
  assert.equal(candidate.reservedExact,'3.000');
  assert.equal(candidate.manualApprovalRequired,true);
  assert.equal(candidate.autoPurchaseEnabled,false);
});
test('never proposes healthy or disabled-minimum inventory', () => {
  assert.equal(deriveReorderCandidates([
    row({minStockExact:'1.000',status:'healthy',needsReorder:false,shortfallExact:'0.000'}),
    row({productId:'p-2',sku:'SKU-2',stockExact:'0.000',reservedExact:'0.000',availableExact:'0.000',shortfallExact:'0.000',status:'out_of_stock',needsReorder:false,minStockExact:'0.000'})
  ]).length,0);
});
test('at-minimum with zero deficit requests review instead of automatic zero-unit order', () => {
  const [candidate] = deriveReorderCandidates([row({status:'at_minimum',minStockExact:'2.000',shortfallExact:'0.000'})]);
  assert.equal(candidate.minShortfallExact,'0.000');
  assert.equal(candidate.action,'REVIEW_REORDER_POINT');
});
test('over-reserved available stock is excluded from ordinary replenishment candidates', () => {
  const candidates=deriveReorderCandidates([row({
    status:'out_of_stock',stockExact:'2.000',reservedExact:'3.000',
    availableExact:'-1.000',shortfallExact:'5.000'
  })]);
  assert.equal(candidates.length,0);
});
test('prioritizes out-of-stock before below-minimum before threshold, stable by SKU', () => {
  const rows=[
    row({productId:'p-c',sku:'C',status:'at_minimum',minStockExact:'2.000',shortfallExact:'0.000'}),
    row({productId:'p-b',sku:'B',status:'out_of_stock',stockExact:'0.000',reservedExact:'0.000',availableExact:'0.000',shortfallExact:'4.000'}),
    row({productId:'p-a',sku:'A',status:'below_minimum'}),
    row({productId:'p-a2',sku:'A2',status:'out_of_stock',stockExact:'0.000',reservedExact:'0.000',availableExact:'0.000',shortfallExact:'4.000'})
  ];
  assert.deepEqual(deriveReorderCandidates(rows).map(r=>r.sku),['A2','B','A','C']);
});
test('does not mutate source row objects during ranking', () => {
  const input=[Object.freeze(row()),Object.freeze(row({productId:'p-2',sku:'2',status:'out_of_stock',stockExact:'0.000',reservedExact:'0.000',availableExact:'0.000',shortfallExact:'4.000'}))];
  deriveReorderCandidates(input);
  assert.equal(input[0].sku,'SKU-1');
});
test('rejects invalid quantity strings and identity rather than silently casting floats', () => {
  for(const x of ['NaN','1e3','1,000.00','-1.000']) assert.throws(
    ()=>deriveReorderCandidates([row({shortfallExact:x})]),/REORDER_NONCANONICAL_QUANTITY/);
  assert.throws(()=>deriveReorderCandidates([row({sku:''})]),/REORDER_INVALID_PRODUCT/);
});
test('report endpoint preserves tenant/permission, scan scope and prohibits purchase writes', () => {
  const route=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
  assert.match(route,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.match(route,/router\.get\('\/inventory\/reorder'/);
  assert.match(route,/where: \{ tenantId: ctx\.tenantId, active: true \}/);
  assert.match(route,/scope: 'SCANNED_PAGE_ONLY'/);
  assert.match(route,/autoPurchaseEnabled: false/);
});
