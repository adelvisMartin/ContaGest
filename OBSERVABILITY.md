# ContaGest VE Observability

Status: **baseline**  
Owner: Backend/SRE  
Scope: ContaGest VE ERP backend. Control Hípico keeps its own product-specific observability roadmap.

## Goals

The observability foundation answers, without storing request/response bodies or customer PII:

- which service version and candidate commit is running;
- which `requestId` failed;
- which low-cardinality route template, method and status were involved;
- whether the process is live;
- whether production configuration and PostgreSQL are ready;
- recent HTTP/DB latency and error-rate signals;
- rate-limit and authentication throttle activity;
- import preview duration;
- queue/outbox/bridge gauges only when an applicable owner explicitly publishes them.

Business `AuditLog` remains the evidence system for business/financial actions. Technical logs never replace it.

## Architecture

```text
requestId
   ↓
requestObservability
   ├── Pino structured access/error events
   └── in-process bounded metrics
             ↓
       /metrics scraper
             ↓
 external storage/dashboard chosen by deployment

/health/live  → process responds only
/health/ready → production config + bounded PostgreSQL SELECT 1
```

There is no mandatory Datadog, New Relic, Sentry, OpenTelemetry collector or Prometheus server in this foundation. `/metrics` emits Prometheus-compatible text from a small internal adapter and can be scraped by any compatible backend.

## Deployment identity

Every structured log and health response includes:

- `service`
- `version`
- `commitSha` / `buildCommit`
- `environment`

Commit source priority:

1. `GIT_COMMIT_SHA`
2. `VERCEL_GIT_COMMIT_SHA`
3. `GITHUB_SHA`
4. `COMMIT_SHA`
5. `unknown`

Version source priority:

1. `SERVICE_VERSION`
2. repository/backend `package.json`
3. `npm_package_version`
4. `unknown`

Production sign-off still requires the repository rule from `AGENTS.md`:

```text
GitHub main SHA == deployment source SHA == /api/health buildCommit
```

`unknown` is acceptable for local development, not for a production evidence claim.

## Structured log contract

Canonical logger: `backend/src/shared/observability/logger.ts` using the already-declared `pino` dependency.

Common fields:

| Field | Meaning | Cardinality |
| --- | --- | --- |
| `timestamp` | ISO-8601 event time | high, expected |
| `level` | pino level | fixed |
| `service` | `contagest-api` | fixed |
| `version` | package/runtime version | low |
| `commitSha` | deployment source SHA | one per deploy |
| `environment` | development/test/preview/production | low |
| `event` | event catalog name | low |
| `requestId` | validated correlation id | per request |
| `route` | normalized route/path template | low/controlled |
| `method` | HTTP method | fixed |
| `status` | HTTP status | low |
| `durationMs` | request/probe duration | numeric |
| `tenantRef` | HMAC pseudonym only when needed | support-only |

### Event catalog

Current canonical events:

- `http.request`
- `http.request.aborted`
- `http.error`
- `service.started`
- `readiness.checked`
- `readiness.database_failed`
- `rate_limit.activated`
- `security.csp_report`
- `auth.login.failed`
- `auth.login.succeeded`
- `auth.throttle.activated`
- `auth.throttle.expired`

New modules should reuse these contracts or add a documented low-cardinality event name. Do not invent ad-hoc string logs when a structured event exists.

## Redaction and privacy policy

Pino centrally redacts known sensitive field names including:

- authorization;
- cookies;
- passwords/password hashes;
- tokens/access/refresh tokens;
- API keys;
- secrets;
- email;
- RIF;
- phone;
- full name.

Request/response bodies and complete request headers are not logged.

Additional rules:

- never log `req.headers` wholesale;
- never log raw session cookies, JWTs, CAPTCHA tokens, service-role keys or database URLs;
- never use email, RIF, phone, `userId`, raw `tenantId`, clinical data, document number or entity UUID as a metric label;
- tenant support correlation uses `tenantRef`, a short HMAC pseudonym, not raw tenant identity;
- financial logs use event/entity references only; do not duplicate document contents or monetary payloads;
- CSP URLs strip query strings and are length bounded;
- untrusted strings are length bounded and control characters are normalized before they become structural fields;
- Pino JSON encoding is relied on instead of interpolated log lines, preventing newline/log-record injection.

The logger must be treated as a technical telemetry channel. Product users must not receive unrestricted cross-tenant log search.

## Health semantics

### `GET /health/live`

Purpose: prove that the process/event loop can answer HTTP.

Properties:

- does **not** query PostgreSQL;
- does not depend on tenant/authentication;
- returns `200` while the process is alive;
- includes deployment identity.

Example shape:

```json
{
  "ok": true,
  "status": "live",
  "service": "contagest-api",
  "version": "11.14.0",
  "buildCommit": "<sha>",
  "environment": "production",
  "timestamp": "<iso>"
}
```

### `GET /health/ready`

Purpose: decide whether traffic should be routed to the instance.

Checks:

1. minimum production-like configuration;
2. explicit production `JWT_SECRET`;
3. explicit production `LICENSE_HASH_SECRET`;
4. production `DATABASE_RUNTIME_URL`;
5. bounded PostgreSQL `SELECT 1`.

Behavior:

- `200` + `status=ready` only when all critical checks pass;
- `503` + `status=not_ready` otherwise;
- DB probe timeout defaults to 1500 ms;
- readiness result is cached for 2000 ms to avoid turning public/platform probes into a DB amplification path;
- no connection string, secret, stack trace or database error message is returned.

Public response exposes only:

```json
{
  "checks": {
    "configuration": "ok|failed",
    "database": "ok|failed|not_checked"
  }
}
```

### Legacy health aliases

The following are retained for backward compatibility:

- `/health`
- `/api/health`
- `/api/v1/health`

They are **liveness aliases**, not readiness. They return `status=healthy`, `liveness=live`, version and `buildCommit`.

Infrastructure should migrate traffic-routing checks to `/health/ready` and process restart checks to `/health/live`.

## Metrics / SLI

Endpoint: `GET /metrics`

Format: Prometheus-compatible text generated by `backend/src/shared/observability/metrics.ts`.

Production access:

- production returns metrics only when `OBSERVABILITY_METRICS_TOKEN` contains at least 32 characters and the scraper supplies it as `Authorization: Bearer <token>` (or `x-observability-token` for non-browser tooling);
- otherwise the endpoint returns a generic `404`;
- the token is never logged.

Metrics:

- `contagest_build_info`
- `contagest_http_requests_total`
- `contagest_http_request_duration_ms` (`p50/p95/p99` over bounded recent samples)
- `contagest_db_probe_total`
- `contagest_db_probe_duration_ms`
- `contagest_rate_limit_activations_total`
- `contagest_auth_events_total`
- `contagest_import_batch_duration_ms`
- `contagest_operational_gauge`

`contagest_operational_gauge` accepts only this allowlist:

- `queue_depth`
- `outbox_depth`
- `bridge_spool_depth`
- `bridge_quarantine_depth`

Those gauges remain absent until an applicable owning module publishes them. Control Hípico must not be silently coupled into the ERP SRE foundation.

### Cardinality policy

Allowed metric labels:

- method;
- normalized route template;
- numeric status;
- fixed outcome/event/limiter names;
- build version/SHA/environment.

Forbidden metric labels:

- user ID;
- tenant ID;
- email;
- RIF;
- phone;
- raw URL containing customer/entity IDs;
- request ID;
- document ID;
- clinical/personal attributes.

Latency storage is bounded in memory and resets when the process restarts. Long-term SLI history requires a scraper/backend; the application database is not used as a second telemetry store.

## Reproducible SLI queries

PromQL-compatible examples once `/metrics` is scraped:

### 5xx error rate

```promql
sum(rate(contagest_http_requests_total{status=~"5.."}[5m]))
/
sum(rate(contagest_http_requests_total[5m]))
```

### p95 API latency

The application exports recent quantile series directly:

```promql
max(contagest_http_request_duration_ms{quantile="0.95"})
```

For long-term statistically correct fleet-wide quantiles, migrate the adapter to histogram buckets before aggregating across replicas.

### DB readiness failures

```promql
sum(increase(contagest_db_probe_total{outcome!="ok"}[10m]))
```

### Rate-limit activations

```promql
sum by (limiter) (increase(contagest_rate_limit_activations_total[15m]))
```

### Auth throttle activity

```promql
sum by (event) (increase(contagest_auth_events_total{event=~"auth\\.throttle\\..+"}[15m]))
```

## Initial SLO policy

These are **engineering baseline objectives**, not customer-facing contractual promises. They remain `baseline` until representative production traffic exists.

| SLI | Initial baseline objective | Status |
| --- | --- | --- |
| API availability | >= 99.5% non-5xx for routable API requests over 30d | baseline |
| API latency | p95 <= 750 ms for ordinary API routes over 30d | baseline |
| API latency | p99 <= 1500 ms for ordinary API routes over 30d | baseline |
| Readiness DB probe | >= 99.9% successful probes over 30d | baseline |
| Readiness DB latency | p95 <= 250 ms where network/provider baseline supports it | baseline |
| Auth/rate limiting | no fixed success SLO; alert on significant deviation from baseline | baseline |
| Imports | establish p95 by batch-size class before setting an SLO | baseline |

Do not convert these into commercial guarantees without measured traffic, capacity testing and product/legal approval.

## Initial alerts

Suggested starting alerts, to tune after baseline data:

- **Critical:** `/health/ready` fails continuously for 5 minutes on all instances.
- **High:** 5xx ratio > 5% for 10 minutes with meaningful request volume.
- **High:** ordinary-route p95 > 1500 ms for 15 minutes.
- **Medium:** DB probe failures > 3 in 10 minutes.
- **Medium:** auth throttle activations jump materially above the previous rolling baseline.
- **Medium:** rate-limit activation spike on a single limiter.
- **Medium:** import p95 doubles relative to established baseline.

Alert destination is deployment policy and is intentionally not hardcoded in the application.

## Retention

Application process:

- bounded latency samples only;
- counters/gauges reset on restart;
- no telemetry persistence in product tables.

External backend recommendation:

- hot searchable technical logs: 7–14 days initially;
- aggregate metrics: 30–90 days initially;
- longer retention only with cost/privacy justification.

Business AuditLog retention follows its own accounting/audit policy and is not governed by this file.

## Troubleshooting by requestId

1. Ask the user/support flow for the `requestId` shown in the error payload or response header.
2. Search structured logs for exact `requestId`.
3. Confirm `version`, `commitSha`, `environment`.
4. Inspect `http.error` and corresponding `http.request`.
5. Check `/health/ready` history around the event.
6. Check route-level error rate and p95/p99.
7. If DB-related, inspect `readiness.database_failed`/DB metrics; do not request the user's password or copy connection strings into tickets.
8. If financial, use the business AuditLog/entity reference for business reconstruction; technical logs are not the ledger.

Frontend `BackendApi` already preserves parsed error payloads on `error.payload`; backend errors now include `requestId` and every response exposes `x-request-id`, so UI/support surfaces can display/copy `error.payload.requestId` without stack traces.

## Failure isolation

Telemetry is best-effort:

- logger metadata resolution catches failures;
- metrics are in-process data structures with no network dependency;
- no external telemetry provider is called in request critical path;
- metric scrape failure cannot fail business API requests;
- DB readiness failure changes readiness only; it does not redefine liveness.

## QA

Canonical deterministic test:

```bash
npm --workspace backend run test:observability
```

Coverage includes:

- Pino secret/PII redaction;
- JSON/log-injection behavior;
- incoming valid vs generated request ID;
- `live=200` while injected `ready=503`;
- production-like missing-secret readiness failure;
- DB up/down readiness contract through injected probes;
- health response secret/stack exclusion;
- 4xx correlation ID;
- metrics names/cardinality safety;
- a small concurrent liveness request batch to detect pathological logging overhead.

Full release evidence still follows `AGENTS.md`; the observability test does not replace typecheck, build, AppSec or broader regression gates.

## Rollback

No database migration is introduced.

Rollback is code-only:

1. revert the issue #98 commit/PR;
2. restore previous health/access logging behavior;
3. keep external scraper tolerant of a temporary missing `/metrics`;
4. do not change business AuditLog data.

No product data is created, rewritten or deleted by this observability foundation.
