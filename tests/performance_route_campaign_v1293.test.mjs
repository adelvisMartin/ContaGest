import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeLabCampaigns } from '../scripts/performance-route-campaign-v1293.mjs';

const sha = 'a'.repeat(40);
const catalog = Array.from({ length: 60 }, (_, i) => ({ route: `route-${i}`, family: 'qa', priority: 'high' }));
const env = Object.freeze({ nodeVersion: 'v22.16.0', osPlatform: 'linux', osArch: 'x64',
  cpuModel: 'isolated test cpu', cpuLogicalCores: 2, browserVersion: '140.0',
  networkProfile: 'UNTHROTTLED_NOT_VERIFIED', viewportWidth: 1440, viewportHeight: 900,
  colorScheme: 'light', reducedMotion: 'reduce' });
function campaign(index, changes = {}) {
  return { schemaVersion: 1293, candidateSha: sha, runId: `run-${index}`,
    sourceOfRoutes: 'qa/support/module-visual-catalog.mjs', profile: 'desktop-1440',
    routeCount: 60, measuredRouteCount: 60, missingRoutes: [], status: 'LAB_BASELINE_ONLY',
    fixtureProvenance: 'SYNTHETIC_TEST_ONLY', measurementType: 'synthetic-chromium-render-only',
    productionWebVitalsStatus: 'NOT_VERIFIED', authenticatedApiAndPostgresStatus: 'NOT_EXECUTED',
    percentilesStatus: 'NOT_MEASURED_SINGLE_SAMPLE',
    budgetsRatified: false, labEnvironment: env,
    routes: catalog.map(item => ({ route: item.route, family: item.family, risk: item.priority,
      status: 'LAB_MEASURED_PROVISIONAL', fieldLcpP75Ms: null, fieldInpP75Ms: null,
      fieldClsP75: null, realApiP95Ms: null, realDbP95Ms: null,
      lab: { routeReadyMs: index * 10, lcpMs: null, cls: index / 100,
        inpMs: null, resourceCount: 10, transferBytes: 1000,
        jsTransferBytes: 600, cssTransferBytes: 100, mockedApiRequests: 2 } })) ,
    ...changes };
}
const base = () => [1, 2, 3, 4, 5].map(index => campaign(index));
const measure = (runs) => summarizeLabCampaigns({ candidateSha: sha, catalog, campaigns: runs });

test('#1293 compares repeated lab route metrics, never promotes field or API measurements', () => {
  const result = measure(base());
  assert.equal(result.campaignCount, 5);
  assert.equal(result.routes.length, 60);
  assert.equal(result.percentilesStatus, 'LAB_ONLY_NOT_FIELD');
  assert.equal(result.budgetsRatified, false);
  assert.equal(result.routes[0].metrics.routeReadyMs.p50, 30);
  assert.equal(result.routes[0].metrics.routeReadyMs.p75, 40);
  assert.equal(result.routes[0].metrics.routeReadyMs.p95, 50);
  assert.equal(result.routes[0].metrics.routeReadyMs.variance, 200);
  assert.equal(result.routes[0].metrics.lcpMs.status, 'INSUFFICIENT_OBSERVATIONS');
  assert.equal(result.routes[0].metrics.lcpMs.p75, null);
});

test('#1293 only publishes a percentile with all five LCP observations', () => {
  const runs = base();
  for (let i = 0; i < runs.length; i++) runs[i].routes[0].lab.lcpMs = 300 + i * 20;
  assert.equal(measure(runs).routes[0].metrics.lcpMs.p95, 380);
  runs[0].routes[0].lab.lcpMs = null;
  assert.equal(measure(runs).routes[0].metrics.lcpMs.p75, null);
});

test('#1293 rejects incomplete/forged/mixed-environment campaigns', () => {
  const mutate = (callback) => {
    const runs = base(); callback(runs);
    assert.throws(() => measure(runs), /PERF1293_CAMPAIGN_/);
  };
  mutate(runs => runs.pop());
  mutate(runs => { runs[1].runId = runs[0].runId; });
  mutate(runs => { runs[1].candidateSha = 'b'.repeat(40); });
  mutate(runs => { runs[1].labEnvironment = { ...env, cpuModel: 'different runner' }; });
  mutate(runs => { runs[1].labEnvironment = { ...env, networkProfile: 'prod' }; });
  mutate(runs => { runs[1].routes[0].route = 'changed-route'; });
  mutate(runs => { runs[1].routes[0].fieldInpP75Ms = 120; });
  mutate(runs => { runs[1].routes[0].lab.inpMs = 120; });
  mutate(runs => { runs[1].routes[0].lab.routeReadyMs = Infinity; });
  mutate(runs => { runs[1].routes[0].lab.cssTransferBytes = 999; });
  mutate(runs => { runs[1].status = 'PASS'; });
});

test('#1293 guards route catalog integrity and source provenance', () => {
  const runs = base();
  assert.throws(() => summarizeLabCampaigns({ candidateSha: sha, catalog: catalog.slice(1), campaigns: runs }), /PERF1293_CAMPAIGN_ROUTE_CATALOG/);
  runs[0].fixtureProvenance = 'PRODUCTION';
  assert.throws(() => measure(runs), /PERF1293_CAMPAIGN_SUMMARY_AUTHORITY/);
});

test('#1293 rejects fractional counters and resource transfer byte counts', () => {
  for (const [key, value] of [
    ['resourceCount', 10.5],
    ['transferBytes', 1000.5],
    ['jsTransferBytes', 600.5],
    ['cssTransferBytes', 100.5],
    ['mockedApiRequests', 2.5],
  ]) {
    const runs = base();
    runs[1].routes[0].lab[key] = value;
    assert.throws(() => measure(runs), /PERF1293_CAMPAIGN_METRIC_INVALID/, key);
  }
});

test('#1293 rejects statistics overflow instead of serializing Infinity to null', () => {
  const runs = base();
  for (const run of runs) run.routes[0].lab.routeReadyMs = 1e308;
  assert.throws(() => measure(runs), /PERF1293_CAMPAIGN_METRIC_INVALID/);
});

test('#1293 treats equivalent environment keys as the same fingerprint', () => {
  const runs = base();
  runs[1].labEnvironment = Object.fromEntries(Object.entries(env).reverse());
  assert.equal(measure(runs).campaignCount, 5);
});

test('#1293 prevents unreviewed runner metadata in output', () => {
  const runs = base();
  runs[1].labEnvironment = { ...env, accessToken: 'never-record-this' };
  assert.throws(() => measure(runs), /PERF1293_CAMPAIGN_ENVIRONMENT_INVALID/);
});

test('#1293 canonical fingerprint handles the same environment regardless of JSON key ordering', async () => {
  const { labEnvironmentFingerprint } = await import('../scripts/performance-route-campaign-v1293.mjs');
  assert.equal(labEnvironmentFingerprint(env),
    labEnvironmentFingerprint(Object.fromEntries(Object.entries(env).reverse())));
  assert.notEqual(labEnvironmentFingerprint(env),
    labEnvironmentFingerprint({ ...env, browserVersion: 'different' }));
});
