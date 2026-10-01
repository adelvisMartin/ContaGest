# Backend observability contract (#650)

This document records the runtime observability contract implemented by issue #650. It does not introduce a second telemetry authority; the canonical implementation remains under `backend/src/shared/observability/` and the shared error middleware.

## Request lifecycle

1. Request identity middleware establishes `requestId`.
2. `requestObservability` accepts a valid incoming `traceparent` / `x-correlation-id` when present, otherwise creates bounded identifiers.
3. The request context is propagated with `AsyncLocalStorage` so logs emitted by downstream application/service/repository code through the shared logger inherit `correlationId`, `traceId` and `spanId`.
4. The response includes `x-correlation-id` and `traceparent`.
5. The terminal request record contains only structured metadata: route template, method, status, outcome, duration and pseudonymous tenant/user references.
6. Expected and unexpected errors use one public envelope and retain the same request/correlation identifiers.

## Public error contract

Public errors use this bounded shape:

```json
{
  "ok": false,
  "message": "safe public message",
  "requestId": "...",
  "correlationId": "...",
  "code": "optional-stable-code",
  "details": "optional-sanitized-details"
}
```

Unexpected server errors return the generic public message `Error interno del servidor.`. Validation details are bounded and never include raw request input. `HttpError` details pass through the public-detail sanitizer before serialization.

## Privacy and redaction

Telemetry must never contain raw request/response payloads, query strings, cookies, authorization headers, passwords, session values, tokens, API keys, signed URLs, email addresses, phone numbers, RIF values or other direct user identifiers.

Tenant and user identifiers are represented only by deterministic pseudonymous references. The structured logger redacts known sensitive keys and the public-error sanitizer drops sensitive detail keys. Runtime errors are logged by bounded type/code/reference; raw thrown error messages and stacks are not production log fields.

Operational artifacts must follow the same rule: capture only sanitized structured metadata and test/assertion output needed to prove the contract. Do not attach raw production payloads, headers, database rows or provider credentials to PRs, issues or CI artifacts.

Retention duration is an environment/provider policy and is intentionally not hard-coded in application code. Whatever backend retains logs or artifacts must apply the organization/deployment retention policy while preserving the minimization rules above.

## Background jobs

`observeJob()` is the canonical wrapper for recurring/background work that needs this contract. It emits:

- `job.started`
- `job.completed` with `durationMs` and a bounded sanitized summary
- `job.failed` with `durationMs` and `errorType`, without serializing the thrown error message

The job callback executes inside the same async telemetry context, so shared-logger records emitted by nested work inherit the job correlation/trace identifiers. The canonical Hípico outbound runner consumes this wrapper without changing its dispatch/domain behavior.

## Healthchecks

Health endpoints remain intentionally narrow:

- `/health/live`: process liveness
- `/health/ready`: configuration + database + configured Redis dependency readiness
- `/health/metrics`: protected/controlled operational metrics surface as defined by the existing runtime contract

Health responses must not expose connection strings, credentials, stack traces, provider secrets or database contents.

## Verification

The contract regressions live in `qa/observability-v98.test.ts` and `qa/observability-v650.test.ts` and are wired through `npm --prefix backend run test:observability`.

For a release/merge candidate, execute from the repository checkout using the repository lockfile/configuration:

```text
npm --prefix backend run test:observability
npm --prefix backend run typecheck
npm --prefix backend run build
```

If the repository's canonical root gate performs broader checks, that gate remains authoritative. A CI/provider failure before test steps execute is infrastructure evidence, not a passing code-quality signal.
