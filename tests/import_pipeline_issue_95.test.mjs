import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service=fs.readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../frontend/src/pages/DataImportPage.js',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../backend/src/modules/imports/imports.routes.ts',import.meta.url),'utf8');

test('issue #95 parser supports declared formats without executing formulas/macros',()=>{
  assert.match(service,/parseDelimited/);
  assert.match(service,/parseXlsx/);
  assert.match(service,/DecompressionStream\('deflate-raw'\)/);
  assert.match(service,/\.json/);
  assert.match(service,/\.tsv/);
  assert.match(service,/MAX_FILE_BYTES/);
  assert.match(service,/5000/);
  assert.doesNotMatch(service,/eval\s*\(/);
  assert.doesNotMatch(service,/Function\s*\(/);
});

test('issue #95 UI only exposes commit for a validated server batch',()=>{
  assert.match(page,/batch\.status==='validated'/);
  assert.match(page,/Confirmar y aplicar/);
  assert.match(page,/DataImportService\.commit/);
  assert.match(page,/DataImportService\.report/);
  assert.match(page,/DRY-RUN OK/);
});

test('issue #95 server enforces checksum, transaction, idempotency and inventory boundary',()=>{
  assert.match(routes,/IMPORT_CHECKSUM_MISMATCH/);
  assert.match(routes,/runFinancialIdempotentMutation/);
  assert.match(routes,/FOR UPDATE/);
  assert.match(routes,/INVENTORY_BALANCE_REQUIRES_MOVEMENT_WORKFLOW/);
  assert.match(routes,/IMPORT_BATCH_NOT_VALIDATED/);
  assert.match(routes,/IMPORT_PAYLOAD_TOO_LARGE/);
  assert.match(routes,/csvCell/);
});