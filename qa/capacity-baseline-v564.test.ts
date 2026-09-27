import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/app.js';
import {
  prisma,
  prismaQueryTelemetryEnabled,
  prismaQueryTelemetrySnapshot,
  resetPrismaQueryTelemetry,
} from '../backend/src/database/prisma.js';
import { buildXlsxWorkbook } from '../backend/src/modules/exports/xlsx-writer.js';

const tenantId = randomUUID();
const datasetSize = Math.max(500, Math.min(Number(process.env.CAPACITY_DATASET_SIZE || 2500), 10_000));
const measuredRequests = Math.max(10, Math.min(Number(process.env.CAPACITY_REQUESTS || 30), 100));
const candidateSha = String(process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || 'unknown');
let server: Server | undefined;
let baseUrl = '';

const report: Record<string, any> = {
  ticket: '#564',
  candidateSha,
  capturedAt: new Date().toISOString(),
  budgetMode: 'observe-only',
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    datasetSize,
    measuredRequests,
  },
};

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function summarize(values: number[]) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Number(Math.max(...values).toFixed(3)) : 0,
  };
}

function fingerprint(query: string) {
  return query
    .replace(/\$\d+/g, '$?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

async function requestProducts(skip: number) {
  const start = performance.now();
  const response = await fetch(`${baseUrl}/api/v1/products?take=100&skip=${skip}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const elapsedMs = performance.now() - start;
  const payload = await response.json() as any;
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(Array.isArray(payload.data));
  assert.ok(payload.data.length <= 100);
  assert.equal(response.headers.get('x-cg-page-take'), '100');
  assert.equal(response.headers.get('x-cg-page-skip'), String(skip));
  return { elapsedMs, rows: payload.data as Array<{ id: string }> };
}

test.before(async () => {
  if (process.env.GITHUB_ACTIONS === 'true') assert.notEqual(candidateSha, 'unknown');
  assert.equal(process.env.ALLOW_DEV_TENANT_HEADER, 'true', 'Capacity baseline requires isolated development tenant headers.');
  assert.equal(prismaQueryTelemetryEnabled(), true, 'PRISMA_QUERY_TELEMETRY=true is required for N+1/query baselines.');

  await prisma.tenant.create({ data: { id: tenantId, rif: `J-V564-${Date.now()}`, name: 'Capacity v564 isolated tenant' } });
  await prisma.product.createMany({
    data: Array.from({ length: datasetSize }, (_, index) => ({
      tenantId,
      sku: `V564-${String(index).padStart(6, '0')}`,
      name: `Producto baseline ${index}`,
      cost: (index % 200) + 1,
      price: (index % 300) + 10,
      stock: index % 1000,
      reserved: 0,
      minStock: 2,
      taxRate: 16,
    })),
  });

  const app = createApp();
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  report.completedAt = new Date().toISOString();
  const outputDir = path.resolve('artifacts/performance');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'capacity-baseline-v564.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
});

test('API baseline publishes p50/p95/p99 and query fingerprints without invented budgets', async () => {
  for (let index = 0; index < 3; index += 1) await requestProducts(0);

  resetPrismaQueryTelemetry();
  const rssBefore = process.memoryUsage().rss;
  const samples: number[] = [];
  for (let index = 0; index < measuredRequests; index += 1) {
    const result = await requestProducts((index % 5) * 100);
    samples.push(result.elapsedMs);
  }
  const rssAfter = process.memoryUsage().rss;
  const queries = prismaQueryTelemetrySnapshot();
  assert.ok(queries.length > 0, 'Expected Prisma query telemetry from the measured API requests.');

  const fingerprints = new Map<string, { count: number; durations: number[] }>();
  for (const sample of queries) {
    const key = fingerprint(sample.query);
    const current = fingerprints.get(key) || { count: 0, durations: [] };
    current.count += 1;
    current.durations.push(sample.durationMs);
    fingerprints.set(key, current);
  }

  report.api = {
    route: '/api/v1/products?take=100&skip=N',
    latencyMs: summarize(samples),
    rssDeltaBytes: rssAfter - rssBefore,
    prismaQueries: {
      total: queries.length,
      perRequest: Number((queries.length / measuredRequests).toFixed(3)),
      latencyMs: summarize(queries.map((sample) => sample.durationMs)),
      topFingerprints: [...fingerprints.entries()]
        .map(([statement, value]) => ({ statement, count: value.count, latencyMs: summarize(value.durations) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    },
  };
});

test('large-table pagination is tenant-scoped, bounded and advances pages server-side', async () => {
  const first = await requestProducts(0);
  const second = await requestProducts(100);
  assert.equal(first.rows.length, 100);
  assert.equal(second.rows.length, 100);
  const firstIds = new Set(first.rows.map((row) => row.id));
  assert.equal(second.rows.some((row) => firstIds.has(row.id)), false);

  const oversized = await fetch(`${baseUrl}/api/v1/products?take=999999&skip=0`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const payload = await oversized.json() as any;
  assert.equal(oversized.status, 200);
  assert.equal(oversized.headers.get('x-cg-page-take'), '500');
  assert.ok(payload.data.length <= 500);
  report.pagination = { defaultTake: 100, maxTake: 500, skipSupported: true, tenantIdScoped: true };
});

test('PostgreSQL plan is captured for the representative large-table query', async () => {
  const plans = await prisma.$queryRawUnsafe<any[]>(
    'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "id","sku","name","createdAt" FROM "Product" WHERE "tenantId"=$1::uuid ORDER BY "createdAt" DESC,"id" DESC LIMIT 100',
    tenantId,
  );
  assert.ok(plans.length > 0);
  const root = plans[0]?.['QUERY PLAN']?.[0] || plans[0]?.['QUERY PLAN'] || plans[0];
  report.database = {
    representativeQuery: 'Product tenant list ordered by createdAt/id LIMIT 100',
    explainAnalyze: root,
  };
});

test('XLSX target dataset captures time and heap/RSS behavior without enforcing a synthetic budget', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    id: index + 1,
    reference: `V564-${String(index).padStart(6, '0')}`,
    description: `Fila de capacidad ${index}`,
    debit: (index % 100) + 0.25,
    credit: index % 3 === 0 ? (index % 80) + 0.5 : 0,
    period: '2026-09',
  }));
  const before = process.memoryUsage();
  const startedAt = performance.now();
  const workbook = buildXlsxWorkbook({ title: 'Capacity baseline #564', sheets: [{ name: 'Baseline', rows }] });
  const elapsedMs = performance.now() - startedAt;
  const after = process.memoryUsage();
  assert.ok(workbook.byteLength > 0);
  report.xlsx = {
    rows: rows.length,
    columns: 6,
    outputBytes: workbook.byteLength,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss,
  };
});
