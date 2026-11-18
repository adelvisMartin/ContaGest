import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const ROUTE = /^[a-z][a-z0-9-]{0,63}$/;
const RUN_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const PROFILE = 'desktop-1440';
const NOT_EXECUTED = 'NOT_EXECUTED';

function reject(message) { throw new Error(`PERF1293_${message}`); }
function metric(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Lab observations are NOT field Core Web Vitals, production SLA or API p95. */
export function summarizeRouteEvidence({ candidateSha, runId, catalog, observations }) {
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) reject('RUN_ID_REQUIRED');
  if (typeof candidateSha !== 'string' || !SHA.test(candidateSha)) reject('SHA_REQUIRED');
  if (!Array.isArray(catalog) || catalog.length !== 60 ||
      catalog.some(item => !item || typeof item.route !== 'string' || !ROUTE.test(item.route)) ||
      new Set(catalog.map(item => item.route)).size !== 60) reject('CANONICAL_60_ROUTE_SET_REQUIRED');
  if (!Array.isArray(observations)) reject('OBSERVATIONS_INVALID');
  const known = new Set(catalog.map(item => item.route));
  const byRoute = new Map();
  for (const row of observations) {
    if (!row || typeof row !== 'object' || row.schemaVersion !== 1293 ||
        row.candidateSha !== candidateSha || row.runId !== runId || !known.has(row.route) || byRoute.has(row.route) ||
        row.profile !== PROFILE || row.browser !== 'chromium' ||
        row.fixtureProvenance !== 'SYNTHETIC_TEST_ONLY' || row.captureMode !== 'LAB_RENDER_ONLY') {
      reject('OBSERVATION_AUTHORITY_INVALID');
    }
    const m = row.metrics;
    if (!m || !metric(m.routeReadyMs) || !metric(m.lcpMs, true) || !metric(m.cls, true) ||
        m.inpMs !== null || !Number.isSafeInteger(m.resourceCount) || m.resourceCount < 0 ||
        !Number.isSafeInteger(m.transferBytes) || m.transferBytes < 0 ||
        !Number.isSafeInteger(m.mockedApiRequests) || m.mockedApiRequests < 0) {
      reject('OBSERVATION_METRICS_INVALID');
    }
    byRoute.set(row.route, row);
  }
  const routes = catalog.map(item => {
    const observed = byRoute.get(item.route);
    return {
      route: item.route, family: item.family, risk: item.priority,
      status: observed ? 'LAB_MEASURED_PROVISIONAL' : NOT_EXECUTED,
      lab: observed ? observed.metrics : null,
      fieldLcpP75Ms: null, fieldInpP75Ms: null, fieldClsP75: null,
      realApiP95Ms: null, realDbP95Ms: null,
    };
  });
  return {
    schemaVersion: 1293, candidateSha, runId, profile: PROFILE,
    sourceOfRoutes: 'qa/support/module-visual-catalog.mjs',
    fixtureProvenance: 'SYNTHETIC_TEST_ONLY',
    measurementType: 'synthetic-chromium-render-only',
    routeCount: routes.length, measuredRouteCount: byRoute.size,
    missingRoutes: routes.filter(row => row.status === NOT_EXECUTED).map(row => row.route),
    status: byRoute.size === 60 ? 'LAB_BASELINE_ONLY' : NOT_EXECUTED,
    productionWebVitalsStatus: 'NOT_VERIFIED',
    authenticatedApiAndPostgresStatus: NOT_EXECUTED,
    percentilesStatus: 'NOT_MEASURED_SINGLE_SAMPLE',
    budgetsRatified: false,
    routes,
  };
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--strict')) reject('CLI_ARGUMENT_INVALID');
  const sha = String(process.env.CANDIDATE_SHA || '').trim().toLowerCase();
  if (!SHA.test(sha)) reject('SHA_REQUIRED');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  if (head !== sha) reject('SHA_MISMATCH');
  const runId = String(process.env.CG_PERF1293_RUN_ID || process.env.GITHUB_RUN_ID || '').trim();
  if (!RUN_ID.test(runId)) reject('RUN_ID_REQUIRED');
  const { MODULE_VISUAL_CATALOG } = await import('../qa/support/module-visual-catalog.mjs');
  const directory = path.resolve('artifacts/performance/v1293', sha, runId, PROFILE);
  const observations = [];
  for (const entry of MODULE_VISUAL_CATALOG) {
    if (!ROUTE.test(entry.route)) reject('ROUTE_FILENAME_INVALID');
    const file = path.join(directory, `${entry.route}.json`);
    if (existsSync(file)) {
      const data = readFileSync(file, 'utf8');
      if (Buffer.byteLength(data) > 24_000) reject('OBSERVATION_FILE_TOO_LARGE');
      observations.push(JSON.parse(data));
    }
  }
  const summary = summarizeRouteEvidence({ candidateSha: sha, runId, catalog: MODULE_VISUAL_CATALOG, observations });
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ticket: 1293, candidateSha: sha, runId, measured: summary.measuredRouteCount,
    expected: summary.routeCount, status: summary.status, production: summary.productionWebVitalsStatus }));
  if (process.argv.includes('--strict') && summary.missingRoutes.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
