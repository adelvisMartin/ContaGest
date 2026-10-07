# Observability contract v650

Issue authority: #650. Permanent policy authority remains `AGENTS.md`.

## Single authority

The canonical runtime contract lives in `backend/src/shared/observability/contract.ts`. Existing `context.ts`, `logger.ts`, `http.ts`, `health.ts` and the global error middleware are adapters around that authority; feature modules must not create alternate error envelopes, secret-redaction rules or correlation formats.

## Correlation and trace propagation

Inbound HTTP accepts only bounded correlation IDs and valid W3C `traceparent`. `requestObservability` creates the request context once, returns `x-correlation-id`/`traceparent`, and enters an `AsyncLocalStorage` scope. Services, repositories and background adapters may obtain the active context through `currentTelemetryContext()` and create child/job spans through `createJobTelemetryContext()` without trusting browser tenant/identity data.

The correlation reference is operational metadata, not authentication or tenant authority.

## Error contract

Public API failures use the stable envelope:

```json
{
  "ok": false,
  "code": "STABLE_MACHINE_CODE",
  "message": "safe user message",
  "correlationId": "bounded-safe-reference",
  "requestId": "optional bounded legacy/reference id"
}
```

Safe 4xx details may be included only after recursive redaction. Dependency failures are normalized to 503/`DEPENDENCY_UNAVAILABLE`; unhandled failures are 500/`INTERNAL_ERROR`. Raw stack traces, database connection strings, provider responses and internal causes are never returned in the public envelope.

## Structured logging and redaction

Pino remains the only logger. `redactTelemetryValue()` supplements Pino's fixed-path redaction with recursive, bounded handling of nested objects/arrays, bearer tokens, credential-bearing DSNs and signed-URL secret query parameters. Tenant/user references used in metrics/log dimensions remain pseudonymized/minimized.

Sensitive payloads are forbidden as telemetry/evidence artifacts. Logs must remain one-record structured JSON; raw prompts, request bodies, message content, clinical data, credentials, cookies and tokens are not evidence.

## Jobs and persisted error evidence

Job/outbox error fields use `safePersistedError()` rather than raw `Error.message`/provider payloads. The persisted representation is bounded to 320 characters and stores stable classification plus a safe message. The Hípico autonomous outbox is wired to this adapter; future transactional jobs/outbox workers must use the same contract instead of local `safeError` clones.

## Frontend diagnostic reference

The generic frontend API adapter consumes the public envelope and exposes only validated `code`, `correlationId` and `requestId`. A user-visible error may include `Referencia: <correlationId>` so support can correlate a report without exposing stack/cause/provider payload.

## Health/readiness

`/health/live` proves process liveness only. `/health/ready` reports bounded readiness categories and may execute the existing bounded DB probe. Health payloads must never expose database URLs, schema names, credentials, JWT/license secrets, stack traces or provider internals. Metrics protection remains independent from readiness.

## Retention and provider policy

Observability must remain provider-neutral. Local correctness cannot depend on Datadog/Sentry/SaaS availability. External telemetry export is fail-open for business execution; provider outages are recorded separately from product correctness. Production debug artifacts containing sensitive raw payloads are prohibited.

## Verification

Material verification for #650 is:

- `npm --workspace backend run test:observability`
- `npm --workspace backend run typecheck`
- `npm --workspace backend run build`
- source review of API middleware, job adapter, frontend diagnostic adapter and bounded health/readiness

Evidence is bound to the final PR candidate SHA. Remote CI/deploy state is reported independently and is never upgraded from queued/blocked/not-executed to PASS.
