import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => {
  assert.equal(fs.existsSync(path), true, `required artifact missing: ${path}`);
  return fs.readFileSync(path, 'utf8');
};

const gate = read('scripts/erp-performance-gate-v157.mjs');
const backend = read('qa/erp-performance-backend-v157.ts');
const frontend = read('qa/erp-performance-frontend-v157.spec.mjs');
const crud = read('backend/src/modules/crud.factory.ts');
const workflow = read('.github/workflows/erp-performance-capacity-v157.yml');
const governance = read('docs/ADR_PERFORMANCE_BASELINE_V564.md');

test('#564 provisional measurements cannot fail CI against unratified numeric budgets', () => {
  assert.match(gate, /budgetsEnforced\s*=\s*ratificationValid/);
  assert.match(gate, /MEASURED_PROVISIONAL/);
  assert.match(gate, /if\s*\(budgetsEnforced[\s\S]*checks\.some/);
  assert.match(gate, /PROVISIONAL_MEASUREMENT_COMPLETE/);
  assert.match(governance, /budgets.*only.*ratified/i);
});

test('#564 exact-SHA backend evidence includes query/N+1, pagination and export memory', () => {
  assert.match(backend, /backend\.nPlusOneFindingCount/);
  assert.match(backend, /pagination/);
  assert.match(backend, /backend\.xlsx1000RowsHeapDeltaBytes/);
  assert.match(backend, /backend\.xlsx1000RowsRssDeltaBytes/);
  assert.match(workflow, /CANDIDATE_SHA/);
  assert.match(workflow, /postgres:/);
});

test('#564 generic list routes cap and paginate instead of accepting unbounded client datasets', () => {
  assert.match(crud, /MAX_PAGE_SIZE/);
  assert.match(crud, /Math\.min/);
  assert.match(crud, /skip/);
  assert.match(crud, /take/);
  assert.match(backend, /large-list-pagination/);
});

test('#564 frontend performance fixture respects tenant-user scoped persisted state', () => {
  assert.match(frontend, /sessionScope/);
  assert.match(frontend, /contagest_ve_enterprise_v7_state:/);
  assert.doesNotMatch(frontend, /localStorage\.setItem\('contagest_ve_enterprise_v7_state',/);
});

test('#564 baseline publication remains measurement-first and exact environment scoped', () => {
  assert.match(governance, /exact SHA/i);
  assert.match(governance, /environment/i);
  assert.match(governance, /N\+1/i);
  assert.match(governance, /no arbitrary/i);
  assert.match(workflow, /artifacts\/qa\/erp-performance-v157/);
});
