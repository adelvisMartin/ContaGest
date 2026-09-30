# Issue 844 Auth Bootstrap Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate pre-tenant authentication bootstrap from tenant-scoped runtime access without preserving any all-tenant application bypass.

**Architecture:** Three narrow private `SECURITY DEFINER` database functions own the unavoidable pre-context reads/writes: login identity resolution, Supabase auth-user resolution, and first-tenant registration. Backend JWT claims are verified before any database access and then revalidated inside `runWithRuntimeTenant`; once identity bootstrap yields a tenant, all normal auth reads/writes execute through the transaction-scoped tenant authority introduced by #843.

**Tech Stack:** PostgreSQL 17, Prisma 6.19.3, Node 22, TypeScript 5.9, Express 5, jsonwebtoken, Supabase Auth bridge.

**Spec:** `docs/superpowers/specs/2026-09-29-trusted-runtime-tenant-context-design.md` plus GitHub issue #844.

## Global Constraints

- `SOURCE_REUSE=NONE`.
- No production database mutation or destructive QA.
- Bootstrap functions live in `private`, use `SECURITY DEFINER`, `SET search_path = pg_catalog`, schema-qualified objects, safe ownership, and no EXECUTE for `PUBLIC`, `anon`, or `authenticated`.
- Explicit EXECUTE is limited to `contagest_runtime` when that role exists; absence of the role during pre-cutover migration must remain fail-closed rather than widening grants.
- Client-provided `tenantId` is never an authority.
- Existing post-bootstrap behavior remains tenant scoped through #843.
- #845 owns the runtime RLS policy cutover; this ticket must not introduce or change tenant table policies.

## Review Focus

- A backend JWT whose tenant claim is modified without a valid signature must fail before any tenant DB lookup.
- A valid signed tenant claim must still match an active session/profile inside that tenant.
- Login resolution must require the exact RIF + normalized email pair and never enumerate tenants.
- Supabase resolution must bind one `authUserId` to one active profile in an active tenant and expose no arbitrary tenant selector.
- Registration retries/concurrency must never create a partial or duplicate tenant/admin graph.

---

### Task 1: PostgreSQL bootstrap authority and adversarial gate

**Files:**
- Create: `backend/prisma/migrations/20260930010500_issue_844_auth_bootstrap_authority/migration.sql`
- Create: `backend/scripts/auth-bootstrap-v844.mjs`
- Modify: `backend/package.json`
- Create: `.github/workflows/issue-844-auth-bootstrap.yml`

**Interfaces:**
- Produces `private.contagest_bootstrap_login_identity(text,text)`, `private.contagest_bootstrap_supabase_identity(text)`, and `private.contagest_bootstrap_register_tenant(text,text,text,text,text,text,text)`.
- The lookup functions return only identity fields required to establish tenant context; registration returns only newly-created tenant/profile IDs.

- [ ] Write the isolated PostgreSQL 17 test first, covering A/A, A/B, inactive profile/tenant, ACL/search_path/owner, registration atomicity, retry conflict, and no `BYPASSRLS` requirement for runtime.
- [ ] Run the gate on an ephemeral PostgreSQL instance and confirm RED because the functions do not exist.
- [ ] Add the migration with narrow functions and privileges.
- [ ] Re-run the gate and confirm GREEN.

### Task 2: Backend bootstrap adapter and runtime context handoff

**Files:**
- Create: `backend/src/database/auth-bootstrap.ts`
- Create: `backend/src/database/auth-bootstrap.test.ts`
- Modify: `backend/src/shared/middleware/context.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`
- Modify: `backend/src/modules/auth/auth.boundary.test.ts`

**Interfaces:**
- Produces `resolveLoginBootstrapIdentity`, `resolveSupabaseBootstrapIdentity`, and `registerTenantBootstrap`.
- Consumes #843 `runWithRuntimeTenant(tenantId, operation)` immediately after a signed/backend or database-resolved tenant identity exists.

- [ ] Add failing tests for minimal bootstrap result mapping and tampered backend JWT rejection.
- [ ] Implement the database adapter with parameterized Prisma raw queries only.
- [ ] Rework backend JWT and Supabase request context so verification/bootstrap occurs before tenant scope, then session/profile revalidation and downstream middleware execute inside #843 context.
- [ ] Rework `/login`, `/register`, and coordinate-login bootstrap paths to cross the boundary exactly once and keep post-bootstrap work tenant scoped.
- [ ] Run auth regressions and typecheck.

### Task 3: Documentation and exact-SHA release evidence

**Files:**
- Create: `docs/security/auth-bootstrap-authority-v844.md`

**Interfaces:**
- Documents trust boundaries, function ACLs, rollout dependency on #845, and verification commands.

- [ ] Document the bootstrap/runtime boundary and failure modes.
- [ ] Run `git diff --check` equivalent review through the GitHub patch, typecheck, auth tests, PostgreSQL gate, migration from-zero/upgrade, and relevant security gates on the exact branch SHA where infrastructure permits.
- [ ] Create the PR with `Closes #844` only if every acceptance criterion is implemented; merge only if required checks actually execute and are green.
