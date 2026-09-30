# Issue 845 Runtime RLS Cutover Implementation Plan

> Execute with `superpowers:executing-plans`; security/database changes follow TDD and exact-SHA evidence rules.

**Goal:** replace `contagest_runtime_backend_all USING(true) WITH CHECK(true)` with fail-closed tenant-aware policies while preserving narrow bootstrap/shared identity/platform flows.

**Architecture:** a pure SQL sidecar owns runtime RLS policy generation. Direct tenant tables are discovered from the catalog by `tenantId`; dependent children inherit tenant through FK parents; shared/global tables are an explicit versioned catalog with narrow policies. Runtime tenant identity comes only from `current_setting('contagest.tenant_id', true)` after UUID validation. Existing #844 bootstrap functions and #843 transaction-local binding remain separate authorities.

**Constraints**
- forward-only; historical migrations are immutable;
- no production destructive QA;
- runtime stays NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS and owns no objects;
- missing/invalid/stale tenant context denies tenant-owned access;
- A↔B isolation applies to SELECT/INSERT/UPDATE/DELETE and child tables;
- shared/global exceptions are explicit and versioned, never inferred as `USING(true)` tenant bypasses;
- platform cross-tenant access is limited to the existing internal tenant authority and an explicit table catalog;
- multi-company discovery/switch uses narrow SECURITY DEFINER functions that first prove the source profile belongs to the current tenant.

## Task 1 — Regression contracts first

Create:
- `tests/runtime_rls_policy_v845.test.mjs`
- `backend/scripts/runtime-rls-v845.mjs`

Contracts:
- helper validates UUID context and returns NULL when absent/invalid;
- no tenant-owned runtime all-tenant policy may be provisioned;
- direct tenant tables receive tenant-context policies;
- child tables receive parent-EXISTS tenant policies;
- no-context, invalid-context and stale-context tests deny;
- A→A CRUD succeeds, A→B/B→A CRUD fails;
- shared catalog has explicit names/policies;
- runtime attributes/ownership/DDL remain least-privilege;
- identity multi-company helper cannot be called to pivot from an unrelated source profile.

## Task 2 — Runtime RLS authority

Create:
- `ops/database/runtime-rls-policy-v845.sql`

Modify:
- `ops/database/provision-security-roles.sql`
- `ops/database/verify-security-roles.sql`

Implementation:
- `private.contagest_runtime_tenant_id()` reads transaction-local GUC, canonicalizes UUID, and returns NULL on invalid input;
- drop legacy `contagest_runtime_backend_all` from all application tables;
- discover PascalCase direct tenant tables by `tenantId` and create fail-closed policy;
- derive child-table tenant scope from FKs to direct tenant tables;
- explicit shared/global catalog for Permission, AccountUser/AuthLoginAttempt, commercial subscription tables and platform-managed tenant objects;
- bootstrap #844 EXECUTE grants are restored when the runtime role is provisioned after migrations;
- unknown/non-RLS PascalCase tables do not get runtime DML.

## Task 3 — Preserve multi-company identity without blanket RLS

Modify:
- `backend/src/shared/identity/accountMembership.ts`

Use narrow private functions from the sidecar for cross-tenant membership discovery/switch. Source profile must belong to the currently bound tenant; target work is re-entered under the target tenant context before license/subscription checks.

## Task 4 — Verification and rollout docs

Create:
- `docs/security/runtime-rls-cutover-v845.md`

Modify package scripts only to expose the isolated PostgreSQL gate. Reuse existing canonical/local runners; do not add a ticket-specific workflow.

Expected commands when PG17/local runtime exists:

```bash
node --test tests/runtime_rls_policy_v845.test.mjs
npm --workspace backend run test:runtime-rls:postgres
npm --workspace backend run test:auth-bootstrap:unit
npm --workspace backend run test:runtime-tenant-context
npm --workspace backend run typecheck
npm --workspace backend run build
npm run audit:db-security:strict
npm run test:bootstrap:zero-cost
npm run agent:gates -- --base main --type backend
```

Unavailable PG17/Actions infrastructure is reported `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`, never PASS.
