import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const crud = fs.readFileSync('backend/src/modules/crud.factory.ts', 'utf8');
const backend = fs.readFileSync('qa/capacity-baseline-v564.test.ts', 'utf8');
const browser = fs.readFileSync('qa/capacity-frontend-v564.spec.mjs', 'utf8');
const bundle = fs.readFileSync('scripts/capacity-frontend-baseline-v564.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/capacity-baseline-v564.yml', 'utf8');
const adr = fs.readFileSync('docs/ADR_CAPACITY_BASELINE_V564.md', 'utf8');

test('#564 CRUD lists are bounded and support server-side windowing', () => {
  assert.match(crud, /MAX_LIST_TAKE = 500/);
  assert.match(crud, /MAX_LIST_SKIP/);
  assert.match(crud, /parseCrudListWindow/);
  assert.match(crud, /orderBy: \[\{ createdAt: 'desc' \}, \{ id: 'desc' \}\]/);
  assert.match(crud, /X-CG-Page-Take/);
  assert.match(crud, /X-CG-Page-Skip/);
});

test('#564 baseline measures latency, query/N+1 evidence, DB plan and export memory', () => {
  assert.match(backend, /p50/);
  assert.match(backend, /p95/);
  assert.match(backend, /p99/);
  assert.match(backend, /prismaQueryTelemetrySnapshot/);
  assert.match(backend, /topFingerprints/);
  assert.match(backend, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.match(backend, /buildXlsxWorkbook/);
  assert.match(backend, /heapUsedDeltaBytes/);
  assert.match(backend, /budgetMode: 'observe-only'/);
});

test('#564 browser and bundle baselines capture route/render/chunk evidence without synthetic budgets', () => {
  assert.match(browser, /PerformanceObserver/);
  assert.match(browser, /longtask/);
  assert.match(browser, /networkidle/);
  assert.match(browser, /budgetMode: 'observe-only'/);
  assert.match(bundle, /largestChunks/);
  assert.match(bundle, /jsCssBytes/);
  assert.match(bundle, /budgetMode: 'observe-only'/);
  assert.match(adr, /no activa thresholds/i);
});

test('#564 workflow uses disposable PostgreSQL, exact SHA and uploads evidence', () => {
  assert.match(workflow, /postgres:17/);
  assert.match(workflow, /CANDIDATE_SHA/);
  assert.match(workflow, /PRISMA_QUERY_TELEMETRY: 'true'/);
  assert.match(workflow, /ALLOW_DEV_TENANT_HEADER: 'true'/);
  assert.match(workflow, /capacity-baseline-v564\.test\.ts/);
  assert.match(workflow, /capacity-frontend-v564\.spec\.mjs/);
  assert.match(workflow, /upload-artifact@v6/);
});
