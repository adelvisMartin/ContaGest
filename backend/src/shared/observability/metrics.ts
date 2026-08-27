import { deploymentMetadata } from './logger.js';

type HttpSample = {
  method: string;
  route: string;
  status: number;
  durationMs: number;
};

const MAX_LATENCY_SAMPLES_PER_ROUTE = 512;
const httpCounts = new Map<string, number>();
const httpDurations = new Map<string, number[]>();
const dbProbeCounts = new Map<'ok' | 'error' | 'timeout', number>();
const dbProbeDurations: number[] = [];
const rateLimitCounts = new Map<string, number>();
const authEventCounts = new Map<string, number>();
const importDurations: number[] = [];
const operationalGauges = new Map<string, number>();

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function boundedPush(samples: number[], value: number, limit = MAX_LATENCY_SAMPLES_PER_ROUTE) {
  if (!Number.isFinite(value) || value < 0) return;
  samples.push(value);
  if (samples.length > limit) samples.splice(0, samples.length - limit);
}

function httpKey(method: string, route: string, status: number) {
  return JSON.stringify([method, route, status]);
}

function durationKey(method: string, route: string) {
  return JSON.stringify([method, route]);
}

export function recordHttpRequest(sample: HttpSample) {
  const method = String(sample.method || 'UNKNOWN').toUpperCase().slice(0, 12);
  const route = String(sample.route || '/').slice(0, 240);
  const status = Number.isInteger(sample.status) ? sample.status : 0;
  increment(httpCounts, httpKey(method, route, status));

  const key = durationKey(method, route);
  const samples = httpDurations.get(key) || [];
  boundedPush(samples, sample.durationMs);
  httpDurations.set(key, samples);
}

export function recordDatabaseProbe(outcome: 'ok' | 'error' | 'timeout', durationMs: number) {
  dbProbeCounts.set(outcome, (dbProbeCounts.get(outcome) || 0) + 1);
  boundedPush(dbProbeDurations, durationMs, 1024);
}

const ALLOWED_RATE_LIMITERS = new Set([
  'global',
  'mutation',
  'expensive_operation',
  'auth_transport',
  'csp_report'
]);

const ALLOWED_AUTH_EVENTS = new Set([
  'auth.login.failed',
  'auth.login.succeeded',
  'auth.throttle.activated',
  'auth.throttle.expired'
]);

export function recordRateLimit(limiter: string) {
  const key = ALLOWED_RATE_LIMITERS.has(limiter) ? limiter : 'unknown';
  increment(rateLimitCounts, key);
}

export function recordAuthEvent(event: string) {
  const key = ALLOWED_AUTH_EVENTS.has(event) ? event : 'unknown';
  increment(authEventCounts, key);
}

export function recordImportBatchDuration(durationMs: number) {
  boundedPush(importDurations, durationMs, 512);
}

const ALLOWED_OPERATIONAL_GAUGES = new Set([
  'queue_depth',
  'outbox_depth',
  'bridge_spool_depth',
  'bridge_quarantine_depth'
]);

export function setOperationalGauge(name: string, value: number) {
  if (!ALLOWED_OPERATIONAL_GAUGES.has(name) || !Number.isFinite(value)) return false;
  operationalGauges.set(name, value);
  return true;
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function labelValue(value: unknown) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"')
    .slice(0, 240);
}

function labels(entries: Record<string, unknown>) {
  return `{${Object.entries(entries).map(([key, value]) => `${key}="${labelValue(value)}"`).join(',')}}`;
}

function metricNumber(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(3))) : '0';
}

export function metricsSnapshot() {
  const requests = [...httpCounts.entries()].map(([key, count]) => {
    const [method, route, status] = JSON.parse(key);
    return { method, route, status, count };
  });
  const latencies = [...httpDurations.entries()].map(([key, values]) => {
    const [method, route] = JSON.parse(key);
    return {
      method,
      route,
      count: values.length,
      p50: quantile(values, 0.50),
      p95: quantile(values, 0.95),
      p99: quantile(values, 0.99)
    };
  });

  const total = requests.reduce((sum, item) => sum + item.count, 0);
  const errors = requests.filter((item) => item.status >= 500).reduce((sum, item) => sum + item.count, 0);

  return {
    deployment: deploymentMetadata,
    http: {
      total,
      errors,
      errorRate: total ? errors / total : 0,
      requests,
      latencies
    },
    database: {
      probes: Object.fromEntries(dbProbeCounts),
      p50: quantile(dbProbeDurations, 0.50),
      p95: quantile(dbProbeDurations, 0.95),
      p99: quantile(dbProbeDurations, 0.99)
    },
    rateLimits: Object.fromEntries(rateLimitCounts),
    authEvents: Object.fromEntries(authEventCounts),
    imports: {
      count: importDurations.length,
      p50: quantile(importDurations, 0.50),
      p95: quantile(importDurations, 0.95),
      p99: quantile(importDurations, 0.99)
    },
    gauges: Object.fromEntries(operationalGauges)
  };
}

export function renderPrometheusMetrics() {
  const snapshot = metricsSnapshot();
  const lines: string[] = [
    '# HELP contagest_build_info Deployment identity for this process.',
    '# TYPE contagest_build_info gauge',
    `contagest_build_info${labels({
      service: deploymentMetadata.service,
      version: deploymentMetadata.version,
      commit_sha: deploymentMetadata.commitSha,
      environment: deploymentMetadata.environment
    })} 1`,
    '# HELP contagest_http_requests_total HTTP requests grouped by low-cardinality route template.',
    '# TYPE contagest_http_requests_total counter'
  ];

  for (const item of snapshot.http.requests) {
    lines.push(`contagest_http_requests_total${labels({
      method: item.method,
      route: item.route,
      status: item.status
    })} ${item.count}`);
  }

  lines.push(
    '# HELP contagest_http_request_duration_ms Recent in-process HTTP latency quantiles in milliseconds.',
    '# TYPE contagest_http_request_duration_ms summary'
  );
  for (const item of snapshot.http.latencies) {
    const base = { method: item.method, route: item.route };
    lines.push(`contagest_http_request_duration_ms${labels({ ...base, quantile: '0.50' })} ${metricNumber(item.p50)}`);
    lines.push(`contagest_http_request_duration_ms${labels({ ...base, quantile: '0.95' })} ${metricNumber(item.p95)}`);
    lines.push(`contagest_http_request_duration_ms${labels({ ...base, quantile: '0.99' })} ${metricNumber(item.p99)}`);
    lines.push(`contagest_http_request_duration_ms_count${labels(base)} ${item.count}`);
  }

  lines.push(
    '# HELP contagest_db_probe_total Readiness database probe outcomes.',
    '# TYPE contagest_db_probe_total counter'
  );
  for (const outcome of ['ok', 'error', 'timeout'] as const) {
    lines.push(`contagest_db_probe_total${labels({ outcome })} ${snapshot.database.probes[outcome] || 0}`);
  }

  lines.push(
    '# HELP contagest_db_probe_duration_ms Recent readiness database latency quantiles.',
    '# TYPE contagest_db_probe_duration_ms summary',
    `contagest_db_probe_duration_ms${labels({ quantile: '0.50' })} ${metricNumber(snapshot.database.p50)}`,
    `contagest_db_probe_duration_ms${labels({ quantile: '0.95' })} ${metricNumber(snapshot.database.p95)}`,
    `contagest_db_probe_duration_ms${labels({ quantile: '0.99' })} ${metricNumber(snapshot.database.p99)}`,
    '# HELP contagest_rate_limit_activations_total Rate-limit activations by limiter.',
    '# TYPE contagest_rate_limit_activations_total counter'
  );

  for (const [limiter, count] of Object.entries(snapshot.rateLimits)) {
    lines.push(`contagest_rate_limit_activations_total${labels({ limiter })} ${count}`);
  }

  lines.push(
    '# HELP contagest_auth_events_total Aggregated authentication security events.',
    '# TYPE contagest_auth_events_total counter'
  );
  for (const [event, count] of Object.entries(snapshot.authEvents)) {
    lines.push(`contagest_auth_events_total${labels({ event })} ${count}`);
  }

  lines.push(
    '# HELP contagest_import_batch_duration_ms Import batch duration hook; populated by import workflows when enabled.',
    '# TYPE contagest_import_batch_duration_ms summary',
    `contagest_import_batch_duration_ms${labels({ quantile: '0.50' })} ${metricNumber(snapshot.imports.p50)}`,
    `contagest_import_batch_duration_ms${labels({ quantile: '0.95' })} ${metricNumber(snapshot.imports.p95)}`,
    `contagest_import_batch_duration_ms${labels({ quantile: '0.99' })} ${metricNumber(snapshot.imports.p99)}`,
    `contagest_import_batch_duration_ms_count ${snapshot.imports.count}`,
    '# HELP contagest_operational_gauge Queue/outbox/bridge gauges using an allowlisted low-cardinality name.',
    '# TYPE contagest_operational_gauge gauge'
  );

  for (const [name, value] of Object.entries(snapshot.gauges)) {
    lines.push(`contagest_operational_gauge${labels({ name })} ${metricNumber(value)}`);
  }

  return `${lines.join('\n')}\n`;
}

export function resetMetricsForTests() {
  httpCounts.clear();
  httpDurations.clear();
  dbProbeCounts.clear();
  dbProbeDurations.splice(0);
  rateLimitCounts.clear();
  authEventCounts.clear();
  importDurations.splice(0);
  operationalGauges.clear();
}
