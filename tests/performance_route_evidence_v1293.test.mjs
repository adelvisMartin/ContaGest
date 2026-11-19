import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeRouteEvidence } from '../scripts/performance-route-evidence-v1293.mjs';

const sha = 'a'.repeat(40);
const runId = 'synthetic-run-1293';
const catalog = Array.from({ length: 60 }, (_, i) => ({ route: `route-${i}`, family: 'qa', priority: 'high' }));
const observation = (route, changes = {}) => ({
  schemaVersion: 1293, candidateSha: sha, runId, route, profile: 'desktop-1440',
  browser: 'chromium', fixtureProvenance: 'SYNTHETIC_TEST_ONLY',
  captureMode: 'LAB_RENDER_ONLY',
  metrics: { routeReadyMs: 95.5, lcpMs: null, cls: 0, inpMs: null,
    resourceCount: 17, transferBytes: 1012, mockedApiRequests: 3 }, ...changes,
});

test('#1293 inventories all routes but cannot invent field vitals from missing samples', () => {
  const summary = summarizeRouteEvidence({ candidateSha: sha, runId, catalog, observations: [] });
  assert.equal(summary.routeCount, 60);
  assert.equal(summary.measuredRouteCount, 0);
  assert.equal(summary.status, 'NOT_EXECUTED');
  assert.equal(summary.missingRoutes.length, 60);
  assert.equal(summary.productionWebVitalsStatus, 'NOT_VERIFIED');
  assert.equal(summary.routes[0].fieldInpP75Ms, null);
});

test('#1293 single lab observation never becomes production p75 or API latency', () => {
  const summary = summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
    observations: [observation('route-0')] });
  assert.equal(summary.measuredRouteCount, 1);
  assert.equal(summary.routes[0].status, 'LAB_MEASURED_PROVISIONAL');
  assert.equal(summary.routes[0].lab.routeReadyMs, 95.5);
  assert.equal(summary.routes[0].realApiP95Ms, null);
  assert.equal(summary.routes[0].fieldLcpP75Ms, null);
  assert.equal(summary.percentilesStatus, 'NOT_MEASURED_SINGLE_SAMPLE');
});

test('#1293 full synthetic coverage is still not a certified production baseline', () => {
  const summary = summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
    observations: catalog.map(item => observation(item.route)) });
  assert.equal(summary.status, 'LAB_BASELINE_ONLY');
  assert.equal(summary.missingRoutes.length, 0);
  assert.equal(summary.productionWebVitalsStatus, 'NOT_VERIFIED');
  assert.equal(summary.budgetsRatified, false);
});

test('#1293 rejects wrong SHA, cross-route duplicates and fake performance samples', () => {
  const valid = observation('route-0');
  for (const observations of [
    [valid, valid],
    [observation('route-unknown')],
    [observation('route-0', { candidateSha: 'b'.repeat(40) })],
    [observation('route-0', { runId: 'another-run' })],
    [observation('route-0', { fixtureProvenance: 'REAL_PRODUCTION' })],
    [observation('route-0', { metrics: { ...valid.metrics, routeReadyMs: NaN } })],
    [observation('route-0', { metrics: { ...valid.metrics, inpMs: 75 } })],
    [observation('route-0', { metrics: { ...valid.metrics, mockedApiRequests: -1 } })],
  ]) assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog, observations }), /PERF1293_/);
  assert.throws(() => summarizeRouteEvidence({ candidateSha: 'invalid', runId, catalog, observations: [] }), /PERF1293_SHA_REQUIRED/);
  assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog: catalog.slice(1), observations: [] }), /PERF1293_CANONICAL/);
});
