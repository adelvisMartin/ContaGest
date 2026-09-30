# Runtime tenant/pool adversarial gate v846

## Purpose

This gate is the closure evidence for #739 after #843 (transaction-scoped tenant context), #844 (narrow auth bootstrap) and #845 (fail-closed runtime RLS). It exercises the real PostgreSQL role/policy boundary with two synthetic tenants and proves that tenant identity does not survive transaction completion or failure.

`SOURCE_REUSE=NONE`

## Safety contract

- PostgreSQL **17** only.
- `DIRECT_DATABASE_URL`/`DATABASE_URL` must point to a database whose name contains `v846`, `ephemeral` or `test`.
- The admin connection must be `postgres`; production/Supabase shared databases are not valid test targets.
- Fixtures are synthetic random UUIDs and are deleted in `finally`.
- `contagest_runtime` remains `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, owns no application object and receives no schema CREATE privilege.
- The gate never treats remote runner failure without executed steps as a code failure or PASS.

## Prerequisite composition

The target isolated database must already contain the canonical migration chain. Use the repository migration/from-zero authority and zero-cost PostgreSQL bootstrap to prepare that database; #846 does not create a second migration authority. The runner then provisions the runtime role and reapplies the idempotent #845 RLS sidecar before executing adversarial checks.

The gate verifies that the #844 bootstrap functions exist and remain executable only through the intended runtime authority before exercising normal tenant-scoped access.

## Adversarial matrix

The runner creates Tenant A/B, direct `Client` rows and `SalesInvoice`/`SalesInvoiceLine` parent-child fixtures, then uses a `pg.Pool` with `max: 1`. It releases and reacquires the client between phases and requires the same `pg_backend_pid()`, demonstrating physical connection reuse rather than merely separate logical transactions.

Checks include:

- no tenant context: SELECT sees zero rows and INSERT is denied;
- invalid UUID and stale UUID: fail closed;
- A→A and B→B visibility;
- A→B INSERT rejected and UPDATE/DELETE affect zero rows;
- B→A UPDATE affects zero rows;
- child insert pointing to the other tenant parent is rejected;
- context is absent after COMMIT and ROLLBACK;
- a transaction aborted by SQL error does not leak context;
- `statement_timeout` cancellation does not leak context;
- explicit `pg_cancel_backend` of an active query does not leak context;
- legacy `contagest_runtime_backend_all` is absent;
- runtime role attributes and ownership remain least privilege.

## Prisma interactive transaction

`runtime-tenant-prisma-v846.ts` starts with the same runtime credential and the production tenant-scoped Prisma proxy. `runWithRuntimeTenant()` wraps real interactive `$transaction(async tx => ...)` calls for A and B. The probe asserts `current_setting('contagest.tenant_id', true)` is bound inside the transaction, own rows are visible, the opposite tenant row is invisible, and no rows become visible without context after success or rollback.

## Supavisor/PgBouncer contract

ContaGest stores tenant identity with `set_config('contagest.tenant_id', tenant, true)`, which is transaction-local. Therefore production pooling must use **transaction mode**, never session state as tenant authority. Supavisor/PgBouncer may reuse a server connection for another request only after the transaction boundary; #846 models that risk directly by forcing one physical PostgreSQL connection through A → commit → no-context → B → rollback → no-context and through error/cancel/timeout paths.

This local gate does not claim to emulate provider scheduling or availability. Provider-specific live validation is separate; the security invariant is that connection reuse cannot preserve the tenant GUC because it is transaction-local.

## Exact-SHA execution

On a migrated isolated PG17 database:

```bash
CG_CANDIDATE_SHA=<40-hex-candidate> \
DIRECT_DATABASE_URL=postgresql://postgres:...@127.0.0.1:5432/contagest_v846_test \
npm --workspace backend run test:runtime-tenant-adversarial:postgres
```

The runner writes a sanitized artifact to:

```text
artifacts/qa/db-security-v846/<candidate-sha>.json
```

The artifact contains only the ticket, candidate SHA, check names and verdict. It contains no DB URL, passwords, tokens, fixture payloads or PII.

Then run the surrounding authorities when infrastructure exists:

```bash
node --test tests/runtime_tenant_adversarial_v846.test.mjs
npm --workspace backend run test:auth-bootstrap:unit
npm --workspace backend run test:runtime-tenant-context
npm --workspace backend run typecheck
npm --workspace backend run build
npm run audit:db-security:strict
npm run test:bootstrap:zero-cost
npm run agent:gates -- --base main --type backend
```

## Evidence classification

- A command that executes and passes: `PASS` for that exact SHA.
- A command that executes and fails because of the candidate: `FAIL`.
- GitHub Actions/provider jobs that allocate no runner and execute no steps: `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`.
- Never convert `steps=[]`, quota exhaustion or provider unavailability into PASS.

## Rollout / rollback

#846 adds verification only; it does not alter production schema or policies. Rollback is therefore removal of the runner/docs/package entry. The actual policy cutover/rollback authority remains #845. Production changes are never tested destructively by this gate.
