import test from 'node:test';
import assert from 'node:assert/strict';
import { previewProductCsvImport } from '../backend/src/modules/portability/product-csv-import-preview.mjs';

const input = csv => ({ tenantId: 'tenant-A', actorTenantId: 'tenant-A', entity: 'products', csv });

test('#770 dry-run diagnostics identify the offending product CSV column', () => {
  const result = previewProductCsvImport(input([
    'sku,name,description',
    'bad sku,Valid name,Valid description',
    'OK-1,=2+2,Valid description',
    'OK-2,Valid name,@SUM(A1)',
    'OK-3,Valid name,Normal description',
  ].join('\n')));

  assert.equal(result.persisted, false);
  assert.equal(result.committable, false);
  assert.equal(result.validCount, 1);
  assert.deepEqual(result.errors, [
    { row: 2, code: 'INVALID_SKU', column: 'sku' },
    { row: 3, code: 'UNSAFE_TEXT', column: 'name' },
    { row: 4, code: 'UNSAFE_TEXT', column: 'description' },
  ]);
});

test('#770 malformed row width keeps explicit unknown column and no writes', () => {
  const result = previewProductCsvImport(input('sku,name\nONE,Valid name,extra\nTWO,Valid name'));
  assert.deepEqual(result.errors, [
    { row: 2, code: 'COLUMN_COUNT', column: null },
  ]);
  assert.equal(result.readOnly, true);
  assert.equal(result.validCount, 1);
});

test('#770 no tenant change, persistence, or authorization on dry-run', () => {
  assert.throws(
    () => previewProductCsvImport({ ...input('sku,name\nONE,Valid name'), actorTenantId: 'tenant-B' }),
    /PORTABILITY_CSV_SCOPE_INVALID/,
  );
});
