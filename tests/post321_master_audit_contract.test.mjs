import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');

test('post-321 toolchain no longer executes the blocked ExcelJS runtime in CI',()=>{
  const workflow=read('.github/workflows/toolchain-deps-v26.yml');
  assert.doesNotMatch(workflow,/import ExcelJS from ['"]exceljs['"]/);
  assert.doesNotMatch(workflow,/repair-typecheck-once/);
  assert.match(workflow,/xlsx-writer\.test\.ts/);
  assert.match(workflow,/stage-backend\.mjs/);
});

test('post-321 performance evidence remains fail-closed',()=>{
  const gate=read('scripts/erp-performance-gate-v157.mjs');
  const finalizer=read('scripts/erp-performance-finalize-v157.mjs');
  const assembler=read('scripts/erp-performance-assemble-v157.mjs');
  const frontend=read('qa/erp-performance-frontend-v157.spec.mjs');
  assert.match(gate,/typeof raw === 'number'/);
  assert.match(finalizer,/summary\.verdict!==['"]PASS['"]/);
  assert.match(assembler,/SYNTHETIC_TEST_ONLY/);
  assert.match(frontend,/ERP157_BROWSER_HEAP_METRIC_MISSING/);
});
