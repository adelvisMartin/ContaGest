import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  buildInventoryStockHealth,
  summarizeInventoryStockHealth
} from './inventory-stock-health.service.js';

const D = (value: string) => new Prisma.Decimal(value);

test('reserved stock is excluded from available and produces exact shortfall', () => {
  const result = buildInventoryStockHealth({
    id: 'p-1', sku: 'SKU-1', name: 'Producto 1', unit: 'kg',
    stock: D('10.000'), reserved: D('7.500'), minStock: D('4.000')
  });
  assert.equal(result.unit, 'kg');
  assert.equal(result.availableExact, '2.500');
  assert.equal(result.shortfallExact, '1.500');
  assert.equal(result.status, 'below_minimum');
  assert.equal(result.needsReorder, true);
});

test('exact boundary at minimum is actionable but distinct from below minimum', () => {
  const result = buildInventoryStockHealth({
    id: 'p-2', sku: 'SKU-2', name: 'Producto 2', unit: 'unit',
    stock: D('5.000'), reserved: D('1.000'), minStock: D('4.000')
  });
  assert.equal(result.availableExact, '4.000');
  assert.equal(result.shortfallExact, '0.000');
  assert.equal(result.status, 'at_minimum');
  assert.equal(result.needsReorder, true);
});

test('zero minimum does not create reorder noise', () => {
  const result = buildInventoryStockHealth({
    id: 'p-3', sku: 'SKU-3', name: 'Producto 3', unit: 'unit',
    stock: D('0.000'), reserved: D('0.000'), minStock: D('0.000')
  });
  assert.equal(result.status, 'out_of_stock');
  assert.equal(result.needsReorder, false);
  assert.equal(result.shortfallExact, '0.000');
});

test('healthy stock remains non-actionable with exact decimals', () => {
  const result = buildInventoryStockHealth({
    id: 'p-4', sku: 'SKU-4', name: 'Producto 4', unit: 'lt',
    stock: D('9.125'), reserved: D('1.125'), minStock: D('3.500')
  });
  assert.equal(result.availableExact, '8.000');
  assert.equal(result.shortfallExact, '0.000');
  assert.equal(result.status, 'healthy');
  assert.equal(result.needsReorder, false);
});

test('summary reconciles counts but never sums heterogeneous quantity units', () => {
  const rows = [
    buildInventoryStockHealth({ id: 'p-1', sku: 'A', name: 'A', unit: 'kg', stock: D('2.000'), reserved: D('1.000'), minStock: D('3.000') }),
    buildInventoryStockHealth({ id: 'p-2', sku: 'B', name: 'B', unit: 'unit', stock: D('5.000'), reserved: D('1.000'), minStock: D('4.000') }),
    buildInventoryStockHealth({ id: 'p-3', sku: 'C', name: 'C', unit: 'lt', stock: D('9.000'), reserved: D('1.000'), minStock: D('2.000') })
  ];

  const summary = summarizeInventoryStockHealth(rows);
  assert.equal(summary.totalProducts, 3);
  assert.equal(summary.needsReorder, 2);
  assert.deepEqual(summary.counts, {
    out_of_stock: 0,
    below_minimum: 1,
    at_minimum: 1,
    healthy: 1
  });
  assert.equal('totalShortfallExact' in summary, false);
});
