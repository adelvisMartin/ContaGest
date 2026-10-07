# Backend observability operations (#650)

The canonical authority is the existing `backend/src/shared/observability/contract.ts`, `context.ts`, `redaction.ts`, shared logger, and error middleware. This document only records operational usage; it does not create a second telemetry/error contract.

## Request and error lifecycle

- `requestObservability` creates or propagates bounded correlation/trace identifiers and runs downstream work inside the canonical `AsyncLocalStorage` context.
- Shared logger calls made inside that context inherit `correlationId`, `traceId`, and `spanId`.
- Request/error records use route templates and pseudonymous tenant/user references rather than raw identifiers.
- Unmatched routes use the stable `/__unmatched__` bucket; raw URL paths/query strings are not reflected into the public error instance.
- Public errors are produced by `normalizeOperationalError()` + `buildErrorEnvelope()`; the envelope remains the repository's versioned v2 contract with safe message/detail, code, status, correlation and optional request identifier.
- Sensitive keys/values are handled by the canonical redaction module; logger redaction also covers signed URL/session fields.

## Background jobs

`observeJob()` is the shared wrapper for recurring/background work that needs the same correlation contract. It emits bounded `job.started`, `job.completed`, and `job.failed` records, runs nested work inside a canonical job telemetry context, and never serializes the thrown error message on failure.

The Hípico outbound runner consumes this wrapper without changing dispatch/domain behavior.

## Privacy and artifacts

Do not persist raw request/response bodies, query strings, cookies, authorization headers, passwords, sessions, tokens, API keys, signed URLs, email/phone/RIF values, or plaintext tenant/user identifiers in telemetry or CI artifacts. Provider retention remains deployment policy; application code enforces minimization/redaction rather than a provider-specific retention duration.

## Verification

The backend observability gate includes the canonical shared tests, `qa/observability-v98.test.ts`, frontend correlation regression, and `qa/observability-v650.test.ts`.

```text
npm --prefix backend run test:observability
npm --prefix backend run typecheck
npm --prefix backend run build
```

A provider/CI failure before those commands execute is infrastructure evidence, not a PASS.
