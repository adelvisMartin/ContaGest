import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import {
  prismaQueryTelemetryEnabled,
  prismaQueryTelemetrySnapshot,
  resetPrismaQueryTelemetry,
} from '../backend/src/database/prisma.ts';

const sha = String(process.env.CANDIDATE_SHA || '').trim();
assert.match(sha, /^[a-f0-9]{40}$/i, 'CANDIDATE_SHA required');
assert.equal(prismaQueryTelemetryEnabled(), true, 'Set PRISMA_QUERY_TELEMETRY=true for #157 calibration');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for the real PostgreSQL calibration.');

const outDir = path.resolve('artifacts/qa/erp-performance-v157', sha);
fs.mkdirSync(outDir, { recursive: true });
const q = (values: number[], percentile: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1))];
};
const profiles = {
  'finance-admin': ['/clients?limit=50', '/bank-accounts?limit=50', '/reports/accounting'],
  'operations-clerk': ['/products?limit=50', '/suppliers?limit=50', '/tasks?limit=50'],
  'read-only-analyst': ['/reports/sales', '/reports/inventory', '/reports/trial-balance'],
};

const h = await createRealBackendHarness();
try {
  resetPrismaQueryTelemetry();
  const apiSamples: number[] = [];
  const profileEvidence: Record<string, { requests: number; samplesMs: number[] }> = {};
  let apiErrors = 0;
  let apiTotal = 0;
  const started = performance.now();

  for (const [profile, endpoints] of Object.entries(profiles)) {
    const samples: number[] = [];
    for (let round = 0; round < 5; round += 1) {
      for (const endpoint of endpoints) {
        const requestStarted = performance.now();
        const result = await h.request(endpoint);
        const durationMs = performance.now() - requestStarted;
        samples.push(durationMs);
        apiSamples.push(durationMs);
        apiTotal += 1;
        if (!result.response.ok) apiErrors += 1;
        assert.equal(result.response.ok, true, `${profile} ${endpoint} -> ${result.response.status}`);
      }
    }
    profileEvidence[profile] = { requests: samples.length, samplesMs: samples };
  }

  const querySamples = prismaQueryTelemetrySnapshot().filter((item) => !/pg_stat_activity|current_setting\('max_connections'\)/i.test(item.query));
  assert.ok(querySamples.length > 0, 'Prisma query telemetry produced no samples; refusing to report a synthetic DB p95.');
  const dbDurations = querySamples.map((item) => item.durationMs).filter(Number.isFinite);
  assert.ok(dbDurations.length > 0, 'Prisma query telemetry produced no finite durations; refusing to report a synthetic DB p95.');

  const run = `PERF157-CAL-${Date.now().toString(36).toUpperCase()}`;
  const tenantB = await h.prisma.tenant.create({ data: { rif: `${run}-B`, name: `${run} Tenant B`, legalName: `${run} Tenant B` } });
  const foreignRif = `${run}-FOREIGN`;
  let crossTenantLeakCount = 0;
  try {
    await h.prisma.client.create({ data: { tenantId: tenantB.id, rif: foreignRif, name: 'Synthetic calibration tenant client' } });
    const isolation = await h.request(`/clients?search=${encodeURIComponent(foreignRif)}&limit=100`);
    assert.equal(isolation.response.ok, true);
    crossTenantLeakCount = JSON.stringify(isolation.payload).includes(foreignRif) ? 1 : 0;
    assert.equal(crossTenantLeakCount, 0, 'Calibration detected a cross-tenant data leak.');
  } finally {
    await h.prisma.client.deleteMany({ where: { tenantId: tenantB.id } }).catch(() => undefined);
    await h.prisma.tenant.delete({ where: { id: tenantB.id } }).catch(() => undefined);
  }

  const exportRows = Array.from({ length: 1000 }, (_, index) => ({
    id: index,
    name: `Synthetic row ${index}`,
    amount: (index + 1) / 100,
    status: 'active',
  }));
  const exportStarted = performance.now();
  const exportResult = await h.request('/exports/xlsx', {
    method: 'POST',
    body: JSON.stringify({ filename: `${run}-export`, title: 'Synthetic calibration export', sheets: [{ name: 'QA', rows: exportRows }] }),
  });
  const exportDurationMs = performance.now() - exportStarted;
  assert.equal(exportResult.response.status, 200, `XLSX calibration smoke -> ${exportResult.response.status}`);
  assert.match(String(exportResult.response.headers.get('content-type') || ''), /spreadsheetml\.sheet/);

  const reportStarted = performance.now();
  const report = await h.request('/reports/sales');
  const reportDurationMs = performance.now() - reportStarted;
  assert.equal(report.response.status, 200);

  const elapsedMs = performance.now() - started;
  const output = {
    schemaVersion: 1,
    issue: 157,
    candidateSha: sha,
    fixtureProvenance: process.env.ERP157_FIXTURE_PROVENANCE || 'UNVERIFIED',
    truthState: 'MEASURED_PROVISIONAL',
    mode: 'CALIBRATION_ONLY',
    capacityCertified: false,
    expectedPeakConcurrentUsers: null,
    loadFactors: { '1x': 'NOT_EXECUTED', '3x': 'NOT_EXECUTED' },
    environment: { runtime: `node ${process.version} + postgres`, network: 'loopback-local' },
    profileCoverage: Object.fromEntries(Object.keys(profiles).map((name) => [name, 'MEASURED'])),
    profileEvidence,
    metrics: {
      'backend.apiP50Ms': q(apiSamples, 0.50),
      'backend.apiP95Ms': q(apiSamples, 0.95),
      'backend.apiP99Ms': q(apiSamples, 0.99),
      'backend.errorRatePct': apiTotal ? (100 * apiErrors) / apiTotal : 0,
      'backend.sequentialCalibrationThroughputRps': apiTotal / Math.max(elapsedMs / 1000, 0.001),
      'backend.dbQueryP95Ms': q(dbDurations, 0.95),
      'backend.crossTenantLeakCount': crossTenantLeakCount,
      'backend.xlsx1000RowsMs': exportDurationMs,
      'backend.salesReportMs': reportDurationMs,
    },
    smoke: { postgres: 'MEASURED', api: 'MEASURED', tenantIsolation: 'MEASURED', xlsx1000Rows: 'MEASURED', report: 'MEASURED' },
    disclaimer: 'Calibration is not capacity certification. 1x/3x remain NOT_EXECUTED until ERP157_EXPECTED_PEAK_USERS is declared by the owner.',
  };
  fs.writeFileSync(path.join(outDir, 'calibration-backend.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output));
} finally {
  await h.close();
}
