import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { STOCK_COVERAGE_VERSION, calculateObservedStockCoverage } from '../backend/src/modules/reports/stock-coverage.ts';

const coverage = (data = {}) => calculateObservedStockCoverage({
  stockExact: '100.000', reservedExact: '20.000',
  outboundQuantityWindowExact: '30.000', windowDays: 30, reconciled: true, ...data
});

test('exact coverage in days subtracts reserved before division', () => {
  const row = coverage();
  assert.equal(row.availableExact, '80.000');
  assert.equal(row.dailyPhysicalOutboundExact, '1.000000');
  assert.equal(row.coverageDaysExact, '80.00');
  assert.equal(row.status, 'COVERAGE_ESTIMATE');
});
test('rounds non-terminating ratios half-up without float', () => {
  const row = coverage({stockExact:'2.000', reservedExact:'0', outboundQuantityWindowExact:'3.000', windowDays:1});
  assert.equal(row.coverageDaysExact, '0.67');
  assert.equal(row.dailyPhysicalOutboundExact, '3.000000');
});
test('physical outbound daily rate shows six decimals on sub-unit quantities', () => {
  const row = coverage({stockExact:'2', reservedExact:'0', outboundQuantityWindowExact:'1.000', windowDays:3});
  assert.equal(row.dailyPhysicalOutboundExact, '0.333333');
  assert.equal(row.coverageDaysExact, '6.00');
});
test('no recorded physical outbound must not guess infinite or numeric coverage', () => {
  const row = coverage({outboundQuantityWindowExact:'0'});
  assert.equal(row.coverageDaysExact, null);
  assert.equal(row.dailyPhysicalOutboundExact, '0.000000');
  assert.equal(row.status, 'NO_PHYSICAL_OUTBOUND_SAMPLE');
});
test('no free stock remains zero even when total stock exists', () => {
  const row = coverage({reservedExact:'100.000'});
  assert.equal(row.availableExact, '0.000');
  assert.equal(row.coverageDaysExact, '0.00');
  assert.equal(row.status, 'NO_AVAILABLE_STOCK');
});
test('refuses over-reserved stock rather than displaying negative coverage', () => {
  assert.throws(() => coverage({reservedExact:'100.001'}), /COVERAGE_RESERVES_EXCEED_STOCK/);
});
test('supports maximum Decimal(18,3) without JS overflow', () => {
  const row = coverage({stockExact:'999999999999999.999', reservedExact:'0', outboundQuantityWindowExact:'0.001', windowDays:3650});
  assert.equal(row.availableExact, '999999999999999.999');
  assert.equal(row.coverageDaysExact, '3649999999999999996350.00');
});
test('invalid numeric encodings and excessive precision fail closed', () => {
  for(const value of ['NaN','1e8','1,000','-1','0.0009','9999999999999999']) {
    assert.throws(() => coverage({stockExact:value}), /COVERAGE_QUANTITY_INVALID/);
  }
});
test('invalid windows and missing reconciliation are rejected', () => {
  for(const windowDays of [0,-1,3651,1.5,Number.NaN]) {
    assert.throws(() => coverage({windowDays}), /COVERAGE_CONTEXT_INVALID/);
  }
  assert.throws(() => coverage({reconciled:false}), /COVERAGE_CONTEXT_INVALID/);
});
test('never claims sales demand or authorizes purchase', () => {
  const row=coverage();
  assert.equal(row.hasDemandForecast, false);
  assert.equal(row.createsPurchaseOrder,false);
  assert.equal(row.interpretation, 'OBSERVED_PHYSICAL_OUTBOUND_PROXY_NOT_SALES_DEMAND');
  assert.equal(row.version, STOCK_COVERAGE_VERSION);
});
test('report route enforces tenant and reconciliation before projecting coverage', () => {
  const routes=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
  const excerpt=routes.slice(routes.indexOf("router.get('/inventory/slow-moving'"),routes.indexOf("router.get('/inventory/reorder'"));
  assert.match(routes,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.match(excerpt,/where: \{ id: parsed\.data\.productId, tenantId: ctx\.tenantId, active: true \}/);
  assert.match(excerpt,/select: \{ id: true, sku: true, name: true, unit: true, stock: true, reserved: true \}/);
  assert.match(excerpt,/const reconciliation = calculateStockAgeing\(/);
  assert.match(excerpt,/coverage: calculateObservedStockCoverage\(/);
  assert.match(excerpt,/reservedExact: product\.reserved/);
  assert.match(excerpt,/reconciled: true/);
});
