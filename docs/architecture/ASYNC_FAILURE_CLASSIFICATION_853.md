# #853 — Fail-closed error classification for asynchronous jobs

**Scope:** pure retry/dead-letter classification policy. This increment does not install a worker, connect to PostgreSQL, or activate external providers. It is independent of the draft persistence foundation in PR #1047.

## Contract

- Provider exceptions, strings, status codes and duck-typed error objects do **not** authorize a retry; an unknown result is terminal `JOB_UNCLASSIFIED_FAILURE`. Never read/log arbitrary `.message`, `.stack`, `.code`, getters or raw payload.
- Only a reviewed adapter may call `makeClassifiedAsyncJobFailure` with one of seven allowlisted categories. Object identity is recorded internally in a `WeakMap`; forging an Error object or using a similarly named code cannot elevate a failure into the retryable path.
- Temporary transport, rate limiting and provider outages are eligible for retry **only** if the handler has separately established safe effect idempotency. Without that proof, the policy is terminal `JOB_RETRY_UNSAFE_EFFECT`.
- Permanent rejection, missing handler version, invalid payload and **uncertain external side-effect outcome** are terminal. No automatic retry of an ambiguous financial/notification effect.
- The `idempotentRetryVerified` flag is a trusted caller assertion, **not itself proof** of provider idempotency. Handler/adapter implementation must establish its effect ledger, idempotency key or compare-and-swap invariant before passing `true` and before any worker activation.
- The result exposes only `{safeErrorCode, retryable}`. The SQL retry budget/backoff, lease fencing, tenant security and dead-letter persistence remain governed by PR #1047 and its PostgreSQL acceptance tests.

## Local evidence

```bash
node --experimental-strip-types --test tests/async_failure_policy_v853.test.mjs
tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/jobs/async-failure-policy.ts
node --check tests/async_failure_policy_v853.test.mjs
```

These are native Node 22 tests and a strict source-level typecheck of a dependency-free module, not proof of full-repository install/build, DB concurrency or provider recovery. Do not declare the parent #853 completed solely because this increment is merged. No action/workflow setting is changed.

**Rollback:** revert this new policy, its tests and this doc. No database state changes.
