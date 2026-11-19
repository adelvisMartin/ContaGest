import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeRouteEvidence } from '../scripts/performance-route-evidence-v1293.mjs';

const sha = 'a'.repeat(40);
const runId = 'synthetic-run-1293';
const catalog = Array.from({ length: 60 }, (_, i) => ({ route: `route-${i}`, family: 'qa', priority: 'high' }));
const labEnvironment = {
  nodeVersion: 'v22.16.0', osPlatform: 'linux', osArch: 'x64', cpuModel: 'test cpu',
  cpuLogicalCores: 2, browserVersion: '140.0', networkProfile: 'UNTHROTTLED_NOT_VERIFIED',
  viewportWidth: 1440, viewportHeight: 900, colorScheme: 'light', reducedMotion: 'reduce',
};
const observation = (route, changes = {}) => ({
  schemaVersion: 1293, candidateSha: sha, runId, route, profile: 'desktop-1440',
  browser: 'chromium', fixtureProvenance: 'SYNTHETIC_TEST_ONLY',
  captureMode: 'LAB_RENDER_ONLY', labEnvironment,
  metrics: { routeReadyMs: 95.5, lcpMs: null, cls: 0, inpMs: null,
    resourceCount: 17, transferBytes: 1012, jsTransferBytes: 700, cssTransferBytes: 112, mockedApiRequests: 3 }, ...changes,
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
    [observation('route-0', { labEnvironment: { ...labEnvironment, cpuLogicalCores: 0 } })],
    [observation('route-0', { metrics: { ...valid.metrics, jsTransferBytes: 999, cssTransferBytes: 112 } })],
  ]) assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog, observations }), /PERF1293_/);
  assert.throws(() => summarizeRouteEvidence({ candidateSha: 'invalid', runId, catalog, observations: [] }), /PERF1293_SHA_REQUIRED/);
  assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog: catalog.slice(1), observations: [] }), /PERF1293_CANONICAL/);
});

test('#1293 refuses mixed runner/browser conditions within one lab run', () => {
  assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
    observations: [observation('route-0'), observation('route-1', {
      labEnvironment: { ...labEnvironment, browserVersion: 'different' },
    })] }), /PERF1293_ENVIRONMENT_MISMATCH/);
});

test('#1293 same-run environment identity is independent of JSON property order', () => {
  const equivalent = Object.fromEntries(Object.entries(labEnvironment).reverse());
  const summary = summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
    observations: [observation('route-0'), observation('route-1', { labEnvironment: equivalent })] });
  assert.equal(summary.measuredRouteCount, 2);
});

test('#1293 refuses undocumented metrics that could leak sensitive data into artifacts', () => {
  const valid = observation('route-0');
  for (const extras of [
    { sessionToken: 'never-publish-me' },
    { rawUrl: 'https://example.test/?authorization=secret' },
  ]) {
    assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
      observations: [observation('route-0', { metrics: { ...valid.metrics, ...extras } })] }),
    /PERF1293_OBSERVATION_METRICS_INVALID/);
  }
});

test('#1293 checks 1000 deterministic runner permutations and rejects unapproved artifact fields', () => {
  const originalKeys = Object.keys(labEnvironment);
  const seenOrders = new Set();
  let seed = 1293;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const valid = observation('route-0');
  for (let index = 0; index < 1000; index += 1) {
    const keys = [...originalKeys];
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = next() % (i + 1);
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    seenOrders.add(keys.join(','));
    const reordered = Object.fromEntries(keys.map(key => [key, labEnvironment[key]]));
    const summary = summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
      observations: [observation('route-0'), observation('route-1', { labEnvironment: reordered })] });
    assert.equal(summary.measuredRouteCount, 2);
    const injected = { ...valid.metrics, [`unreviewed_${index}`]: index };
    assert.throws(() => summarizeRouteEvidence({ candidateSha: sha, runId, catalog,
      observations: [observation('route-0', { metrics: injected })] }), /PERF1293_OBSERVATION_METRICS_INVALID/);
  }
  assert.ok(seenOrders.size >= 900, `Expected diverse permutations; saw ${seenOrders.size}`);
});

test('#1293 aggregator uses the same lab metric schema authority as the campaign comparator', async () => {
  const { LAB_METRIC_KEYS } = await import('../scripts/performance-route-campaign-v1293.mjs');
  assert.equal(Object.isFrozen(LAB_METRIC_KEYS), true);
  assert.deepEqual([...LAB_METRIC_KEYS].sort(), Object.keys(observation('route-0').metrics).sort());
});
