import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./reports.routes.ts', import.meta.url), 'utf8');
const reorderScan = readFileSync(new URL('./reorder-scan-page.ts', import.meta.url), 'utf8');

test('reports are tenant-scoped and permission protected', () => {
  assert.match(source, /router\.use\(requireTenant, requirePermission\('reports\.view'\)\)/);
});

test('inventory reorder report reads active products only inside the current tenant', () => {
  assert.match(source, /router\.get\('\/inventory\/reorder'/);
  assert.match(source, /tenantId:\s*ctx\.tenantId/);
  assert.match(source, /active:\s*true/);
  assert.match(source, /buildInventoryStockHealth/);
  assert.match(source, /summarizeInventoryStockHealth/);
});

test('reorder API supports an explicit actionable-only filter and bounded take', () => {
  assert.match(source, /onlyNeedsReorder/);
  assert.match(source, /parseReorderScanQuery\(scanParams\)/);
  assert.match(source, /\.\.\.scanParams\s*\}\s*=\s*req\.query/);
  assert.match(reorderScan, /REORDER_SCAN_MAX_TAKE = 1000/);
  assert.match(reorderScan, /numericField\(raw\.take/);
  assert.match(source, /rows\.filter\(row\s*=>\s*row\.needsReorder\)/);
});
