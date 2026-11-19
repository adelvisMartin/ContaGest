#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const RUN_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const PROFILE = 'desktop-1440';
const METRICS = ['routeReadyMs', 'lcpMs', 'cls', 'resourceCount', 'transferBytes',
  'jsTransferBytes', 'cssTransferBytes', 'mockedApiRequests'];
const OPTIONAL = new Set(['lcpMs', 'cls']);

function reject(reason) { throw new Error(`PERF1293_CAMPAIGN_${reason}`); }
function isMetric(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
export function validateLabEnvironment(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) reject('ENVIRONMENT_REQUIRED');
  const strings = ['nodeVersion', 'osPlatform', 'osArch', 'cpuModel', 'browserVersion', 'networkProfile',
    'colorScheme', 'reducedMotion'];
  if (strings.some(key => typeof env[key] !== 'string' || !env[key].trim() || env[key].length > 160) ||
      !Number.isSafeInteger(env.cpuLogicalCores) || env.cpuLogicalCores < 1 ||
      env.viewportWidth !== 1440 || env.viewportHeight !== 900 ||
      env.colorScheme !== 'light' || env.reducedMotion !== 'reduce' ||
      env.networkProfile !== 'UNTHROTTLED_NOT_VERIFIED') reject('ENVIRONMENT_INVALID');
}
function percentile(sorted, fraction) { return sorted[Math.ceil(sorted.length * fraction) - 1]; }
function stats(values) {
  if (values.some(value => !isMetric(value))) reject('METRIC_INVALID');
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { samples: values.length, min: sorted[0], p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75), p95: percentile(sorted, 0.95), max: sorted.at(-1),
    mean, variance, standardDeviation: Math.sqrt(variance) };
}

/** Repeated laboratory render measurements, NEVER user field CWV or authenticated API/DB latency. */
export function summarizeLabCampaigns({ candidateSha, catalog, campaigns }) {
  if (typeof candidateSha !== 'string' || !SHA.test(candidateSha)) reject('SHA_INVALID');
  if (!Array.isArray(catalog) || catalog.length !== 60 ||
      new Set(catalog.map(item => item?.route)).size !== 60 ||
      catalog.some(item => typeof item?.route !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(item.route))) {
    reject('ROUTE_CATALOG_INVALID');
  }
  if (!Array.isArray(campaigns) || campaigns.length < 5 || campaigns.length > 30) reject('RUN_COUNT_INVALID');
  const runIds = new Set();
  let environmentFingerprint = null;
  const expectedRoutes = catalog.map(item => item.route);
  const observationsByRoute = new Map(expectedRoutes.map(route => [route, []]));
  for (const summary of campaigns) {
    if (!summary || summary.schemaVersion !== 1293 || summary.candidateSha !== candidateSha ||
        (typeof summary.runId !== 'string' || !RUN_ID.test(summary.runId)) || runIds.has(summary.runId) ||
        summary.profile !== PROFILE || summary.sourceOfRoutes !== 'qa/support/module-visual-catalog.mjs' ||
        summary.percentilesStatus !== 'NOT_MEASURED_SINGLE_SAMPLE' || summary.routeCount !== 60 || summary.measuredRouteCount !== 60 ||
        summary.status !== 'LAB_BASELINE_ONLY' || summary.budgetsRatified !== false ||
        summary.fixtureProvenance !== 'SYNTHETIC_TEST_ONLY' ||
        summary.measurementType !== 'synthetic-chromium-render-only' ||
        summary.productionWebVitalsStatus !== 'NOT_VERIFIED' ||
        summary.authenticatedApiAndPostgresStatus !== 'NOT_EXECUTED' ||
        !Array.isArray(summary.missingRoutes) || summary.missingRoutes.length !== 0 ||
        !Array.isArray(summary.routes) || summary.routes.length !== 60) reject('SUMMARY_AUTHORITY_INVALID');
    validateLabEnvironment(summary.labEnvironment);
    const fingerprint = JSON.stringify(summary.labEnvironment);
    if (environmentFingerprint !== null && environmentFingerprint !== fingerprint) reject('ENVIRONMENT_MISMATCH');
    environmentFingerprint = fingerprint;
    runIds.add(summary.runId);
    summary.routes.forEach((row, index) => {
      if (!row || row.route !== expectedRoutes[index] || row.family !== catalog[index].family ||
          row.risk !== catalog[index].priority || row.status !== 'LAB_MEASURED_PROVISIONAL' ||
          row.fieldLcpP75Ms !== null || row.fieldInpP75Ms !== null || row.fieldClsP75 !== null ||
          row.realApiP95Ms !== null || row.realDbP95Ms !== null || !row.lab) reject('ROUTE_AUTHORITY_INVALID');
      for (const key of METRICS) {
        const value = row.lab[key];
        if (!(OPTIONAL.has(key) && value === null) && !isMetric(value)) reject('METRIC_INVALID');
      }
      if (row.lab.inpMs !== null || row.lab.jsTransferBytes + row.lab.cssTransferBytes > row.lab.transferBytes) {
        reject('METRIC_PROVENANCE_INVALID');
      }
      observationsByRoute.get(row.route).push(row.lab);
    });
  }
  const routes = catalog.map(item => {
    const samples = observationsByRoute.get(item.route);
    const metrics = {};
    for (const key of METRICS) {
      const values = samples.map(sample => sample[key]);
      metrics[key] = values.every(isMetric) ? { status: 'LAB_REPEATED_ONLY', ...stats(values) } :
        { status: 'INSUFFICIENT_OBSERVATIONS', samples: values.filter(isMetric).length,
          min: null, p50: null, p75: null, p95: null, max: null, mean: null,
          variance: null, standardDeviation: null };
    }
    return { route: item.route, family: item.family, risk: item.priority, metrics };
  });
  return { schemaVersion: 1293, candidateSha, profile: PROFILE, campaignCount: campaigns.length,
    runIds: [...runIds], labEnvironment: campaigns[0].labEnvironment,
    measurementType: 'REPEATED_LAB_RENDER_ONLY', percentilesStatus: 'LAB_ONLY_NOT_FIELD',
    productionWebVitalsStatus: 'NOT_VERIFIED', authenticatedApiAndPostgresStatus: 'NOT_EXECUTED',
    budgetsRatified: false, routes };
}

async function main() {
  if (process.argv.length !== 2) reject('CLI_ARGUMENT_INVALID');
  const sha = String(process.env.CANDIDATE_SHA || '').trim().toLowerCase();
  if (!SHA.test(sha)) reject('SHA_INVALID');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  if (head !== sha) reject('SHA_MISMATCH');
  const runIds = String(process.env.CG_PERF1293_COMPARE_RUN_IDS || '').split(',').map(id => id.trim());
  if (runIds.length < 5 || runIds.length > 30 || runIds.some(id => !RUN_ID.test(id)) ||
      new Set(runIds).size !== runIds.length) reject('RUN_IDS_INVALID');
  const { MODULE_VISUAL_CATALOG } = await import('../qa/support/module-visual-catalog.mjs');
  const root = path.resolve('artifacts/performance/v1293', sha);
  const campaigns = runIds.map(runId => {
    const file = path.join(root, runId, PROFILE, 'summary.json');
    if (!existsSync(file)) reject('SUMMARY_FILE_MISSING');
    const content = readFileSync(file, 'utf8');
    if (Buffer.byteLength(content) > 75_000) reject('SUMMARY_FILE_TOO_LARGE');
    return JSON.parse(content);
  });
  const report = summarizeLabCampaigns({ candidateSha: sha, catalog: MODULE_VISUAL_CATALOG, campaigns });
  const output = path.join(root, 'lab-campaign-comparison.json');
  mkdirSync(root, { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ticket: 1293, candidateSha: sha, campaigns: report.campaignCount,
    routes: report.routes.length, status: report.percentilesStatus, output }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
