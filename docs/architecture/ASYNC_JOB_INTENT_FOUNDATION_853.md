# #853 · Transactional job intent foundation (increment 1)

Scope: tenant-bound storage and atomic enqueue/claim/completion/retry primitives. This is **not** a worker, handler registry, notification delivery system, or complete #853 implementation. Source reuse: `NONE`.

- **Producer:** inside the same existing `Prisma.TransactionClient` as the domain write, call `enqueueAsyncJobIntent(tx, ...)`. A standalone transaction/HTTP call after commit can lose the job and is forbidden. `handlerKey` must be a versioned, explicitly reviewed handler; do not enqueue until that handler has been registered by a subsequent approved implementation.
- **Idempotency:** `(tenantId,effectKey)` is unique at the DB. Same request fingerprint returns the original row; a different fingerprint is rejected with `ASYNC_JOB_IDEMPOTENCY_CONFLICT`. Request identity includes handler, canonical JSON payload, runAt and retry budget. Keep payload minimal, bounded to 16 KiB, without credentials, arbitrary contact details, or sensitive clinical data. This foundational policy does not yet enforce domain-specific payload schemas.
- **Consumer:** a future tenant-bound worker can claim up to 25 due jobs with `FOR UPDATE SKIP LOCKED`, using a 15–900 s lease and retryable-expiration takeover. The worker must execute each handler with durable effect idempotency; a lease by itself cannot guarantee exactly-once external effects. `completeClaimedAsyncJob` and `failClaimedAsyncJob` use compare-and-set lease guards. Failure writes only an allowlisted safe error code, not raw provider responses.
- **Tenant isolation:** RLS is always forced, runtime role has scoped SELECT/INSERT/UPDATE only and DB policy consumes `private.contagest_runtime_tenant_id()` from #845. The worker must bind the tenant in the same transaction before querying. No privileged multi-tenant dispatcher bypass has been added.
- **No activation:** `/api/v1/notifications/send` still fails closed with 503 until #854 consent/templates, an approved #853 worker and #772 provider adapters are actually wired. No automatic WhatsApp messages, finance posts, or external API calls are introduced.

## Required verification before merge/production

`node --experimental-strip-types --test tests/job_intent_policy_v853.test.mjs`; `npm ci`; `npm run typecheck`; `npm run lint`; `npm run build`; #626 forward migration and PostgreSQL 17 ephemeral from-zero/upgrade; negative A/B tenant RLS and invalid tenant context; two-worker claim/reclaim, collision, crash and idempotency integration tests. Do not mark these PASS unless they actually run for the exact candidate SHA.

## Current limitations and follow-ups

1. No deployed worker process/lifecycle/handler registry or health/readiness.
2. No completed asynchronous business flow or notification delivery.
3. No DB-backed concurrency/tenant E2E evidence without isolated PostgreSQL 17.
4. No source-identical full-repo build until a network-enabled checkout is available.
5. Potentially sensitive business payload must be validated per handler before enabling producers; no generic public enqueue API exists.
6. Fresh migration bootstrapping must prove `private.contagest_runtime_tenant_id()` is present before this policy is applied; do not assume sidecar order.

Rollback: stop any future producers/workers, then forward-fix. Do **not** drop the table if it contains pending/completed intents; migration is additive and non-destructive. Retain #853 OPEN until all material issue acceptance is proven.
