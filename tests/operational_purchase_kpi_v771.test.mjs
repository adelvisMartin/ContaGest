import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PURCHASE_KPI_VERSION, purchaseKpiRows, purchaseKpiDocumentRows
} from '../backend/src/modules/reports/purchase-kpi.ts';

const example = {
  currency: 'VES', status: 'paid', _count: { _all: 2 },
  _sum: {
    subtotal: '100000000000001.00', iva: '16000000000000.16',
    igtf: '3000000000000.03', retiva: '1000000000000.01',
    total: '118000000000001.18'
  }
};

test('purchase KPI has explicit stable schema version', () => {
  assert.equal(PURCHASE_KPI_VERSION, 'purchase-kpi-v1');
});

test('money never passes through binary floating point', () => {
  const [row] = purchaseKpiRows([example]);
  assert.equal(row.subtotalExact, '100000000000001.00');
  assert.equal(row.totalExact, '118000000000001.18');
  assert.equal(row.igtfExact, '3000000000000.03');
  assert.equal(row.retivaExact, '1000000000000.01');
});

test('original currencies and status buckets are never combined', () => {
  const rows = purchaseKpiRows([
    example,
    { ...example, currency: 'USD', status: 'issued' },
    { ...example, currency: 'USDT', status: 'overdue' }
  ]);
  assert.deepEqual(rows.map(r => [r.currency, r.status]), [
    ['VES', 'paid'], ['USD', 'issued'], ['USDT', 'overdue']
  ]);
});

test('null PostgreSQL SUM is exact zero in each tax component', () => {
  const [row] = purchaseKpiRows([{
    currency: 'VES', status: 'issued', _count: { _all: 0 },
    _sum: { subtotal: null, iva: null, igtf: null, retiva: null, total: null }
  }]);
  for (const key of ['subtotalExact','ivaExact','igtfExact','retivaExact','totalExact'])
    assert.equal(row[key], '0');
});

test('unrecognized statuses, currency codes and counts fail closed', () => {
  assert.throws(() => purchaseKpiRows([{ ...example, status: 'cancelled' }]), /PURCHASE_KPI_GROUP_INVALID/);
  assert.throws(() => purchaseKpiRows([{ ...example, status: 'draft' }]), /PURCHASE_KPI_GROUP_INVALID/);
  assert.throws(() => purchaseKpiRows([{ ...example, currency: 'USD;SQL' }]), /PURCHASE_KPI_GROUP_INVALID/);
  assert.throws(() => purchaseKpiRows([{ ...example, _count: { _all: -1 } }]), /PURCHASE_KPI_GROUP_INVALID/);
  assert.throws(() => purchaseKpiRows([{ ...example, _count: { _all: 1.5 } }]), /PURCHASE_KPI_GROUP_INVALID/);
});

test('malformed decimal inputs do not silently become numeric KPI values', () => {
  for (const value of ['NaN', '1e10', 'Infinity', '100,00']) {
    assert.throws(() => purchaseKpiRows([{
      ...example, _sum: { ...example._sum, total: value }
    }]), /KPI_DECIMAL_NOT_CANONICAL/);
  }
});

test('invoice drill-down includes only approved fields', () => {
  const rows = purchaseKpiDocumentRows([{
    id: 'purchase-1', number: 'P-1', issueDate: new Date('2026-10-01T02:03:04.000Z'),
    fiscalPeriod: '2026-10', currency: 'VES', status: 'paid',
    subtotal: '100.00', iva: '16.00', igtf: '3.00', retiva: '1.00', total: '118.00',
    supplierId: 'hidden-supplier', tenantId: 'tenant-b', ocrStatus: 'private'
  }]);
  assert.deepEqual(rows, [{
    id: 'purchase-1', number: 'P-1', issueDate: '2026-10-01T02:03:04.000Z',
    fiscalPeriod: '2026-10', currency: 'VES', status: 'paid',
    subtotalExact: '100.00', ivaExact: '16.00', igtfExact: '3.00',
    retivaExact: '1.00', totalExact: '118.00'
  }]);
});

test('purchase reports use authenticated tenant, fiscal period and exact PostgreSQL sums', () => {
  const routes = readFileSync(
    new URL('../backend/src/modules/reports/reports.routes.ts', import.meta.url), 'utf8'
  );
  assert.match(routes, /router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.match(routes, /router\.get\('\/operational\/purchases'/);
  assert.match(routes, /const where: Prisma\.PurchaseInvoiceWhereInput/);
  assert.match(routes, /tenantId: ctx\.tenantId/);
  assert.match(routes, /fiscalPeriod: period/);
  assert.match(routes, /tx\.purchaseInvoice\.groupBy/);
  assert.match(routes, /tx\.purchaseInvoice\.findMany/);
  assert.match(routes, /Prisma\.TransactionIsolationLevel\.RepeatableRead/);
  assert.match(routes, /_sum: \{ subtotal: true, iva: true, igtf: true, retiva: true, total: true \}/);
});

test('exported purchase metric is explicitly not a cash-paid or ledger KPI', () => {
  const routes = readFileSync(
    new URL('../backend/src/modules/reports/reports.routes.ts', import.meta.url), 'utf8'
  );
  assert.match(routes, /sourceAuthority: 'PurchaseInvoice'/);
  assert.match(routes, /liabilityOrCashPaymentKpi: false/);
  assert.match(routes, /fxConversion: 'NONE'/);
});

test('the operational purchases endpoint reuses strict bounds and deterministic pagination', () => {
  const routes = readFileSync(
    new URL('../backend/src/modules/reports/reports.routes.ts', import.meta.url), 'utf8'
  );
  assert.match(routes, /const parsed = salesKpiQuery\.safeParse\(req\.query\)/);
  assert.match(routes, /take: take \+ 1/);
  assert.match(routes, /orderBy: \[\{ issueDate: 'desc' \}, \{ id: 'desc' \}\]/);
  assert.match(routes, /hasMore \? skip \+ take : null/);
});
