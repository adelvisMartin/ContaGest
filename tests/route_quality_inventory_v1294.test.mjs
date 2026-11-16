import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';
import {
  buildRouteQualityBaseline,
  assertRouteQualityCliArgs,
  ROUTE_PERFORMANCE_TARGETS
} from '../scripts/route-quality-baseline-v1294.mjs';

test('#773/#1294 runtime page registry yields exactly 60 traceable UX review rows', () => {
  const matrix = buildRouteQualityBaseline();
  assert.equal(matrix.routesInventoried, 60);
  assert.deepEqual(matrix.rows.map((row) => row.route), MODULE_VISUAL_CATALOG.map((item) => item.route));
  assert.deepEqual(matrix.viewportWidths, [360, 390, 430, 768, 1024, 1440]);
  for (const row of matrix.rows) {
    assert.match(row.sourcePage, /^frontend\/src\/pages\/[\w-]+\.(?:js|jsx)$/);
    assert.equal(row.sourceStatus, 'SOURCE_PRESENT');
    assert.equal(row.browserContract, 'qa/exhaustive-route-v164.spec.mjs');
    assert.equal(row.functionalJourney, 'NOT_EXECUTED');
    assert.equal(row.authorization, 'NOT_EXECUTED');
    assert.equal(row.browserE2e, 'NOT_EXECUTED');
    assert.equal(row.refactorOwner, 'NOT_REVIEWED');
  }
});

test('#1293 inventory distinguishes performance targets from executed measurement', () => {
  const matrix = buildRouteQualityBaseline();
  assert.deepEqual(ROUTE_PERFORMANCE_TARGETS, {
    percentile: 75, lcpMs: 2500, inpMs: 200, cls: 0.1
  });
  assert.equal(matrix.performanceMeasurements, 0);
  assert.equal(matrix.routesVerifiedInBrowser, 0);
  assert.equal(matrix.allEvidence, 'NOT_EXECUTED');
  for (const row of matrix.rows) {
    assert.equal(row.lcpP75, null);
    assert.equal(row.inpP75, null);
    assert.equal(row.clsP75, null);
    assert.equal(row.apiP95, null);
    assert.equal(row.performanceStatus, 'NOT_EXECUTED');
  }
});

test('#1294 mismatched, duplicate and tampered route binding fail closed', () => {
  const missing = { ...PAGE_REGISTRY };
  delete missing.dashboard;
  assert.throws(() => buildRouteQualityBaseline({ registry: missing }), /ROUTE_MATRIX_RUNTIME_VISUAL_DRIFT/);

  const duplicated = MODULE_VISUAL_CATALOG.map((item) => ({ ...item }));
  duplicated[0].route = duplicated[1].route;
  assert.throws(() => buildRouteQualityBaseline({ catalog: duplicated }), /ROUTE_MATRIX_RUNTIME_VISUAL_DRIFT/);

  const traversal = { ...PAGE_REGISTRY, dashboard: ['../secret.js', 'DashboardPage'] };
  assert.throws(() => buildRouteQualityBaseline({ registry: traversal }), /ROUTE_MATRIX_UNSAFE_PAGE_BINDING/);

  assert.throws(() => buildRouteQualityBaseline({ sourceExists: () => false }), /ROUTE_MATRIX_PAGE_SOURCE_MISSING/);
});

test('#1294 quality gate CLI accepts --check and rejects unknown or extra flags', () => {
  assert.doesNotThrow(() => assertRouteQualityCliArgs([]));
  assert.doesNotThrow(() => assertRouteQualityCliArgs(['--check']));
  for (const args of [['--fix'], ['--help'], ['--check', '--check'], ['--check', '--fix']]) {
    assert.throws(() => assertRouteQualityCliArgs(args), /ROUTE_MATRIX_UNSUPPORTED_ARGUMENT/);
  }
});
