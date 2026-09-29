# Issue 635 RLS, Grants & SECURITY DEFINER Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ContaGest PostgreSQL policy authority fail closed for tenant isolation, least-privilege grants, and `SECURITY DEFINER` execution without rewriting historical Prisma migrations or using production for destructive QA.

**Architecture:** Keep `backend/prisma/schema.prisma` + `backend/prisma/migrations/**` as structural authority and add a new forward-only RLS policy sidecar after legacy `0002_rls_policies.sql`. The sidecar removes the unsafe public definer surface, closes function execution/search paths, and the new audit runner derives a deterministic manifest from PostgreSQL catalogs. Runtime-role tenant scoping is only promoted to PASS if the application can provide a transaction-scoped trusted tenant context without breaking Prisma; otherwise the gate reports the unsafe all-tenant runtime policy and #635 remains open.

**Tech Stack:** PostgreSQL 17, Prisma 6.19.3, Node.js 22, `pg` 8.23.0, Node test runner.

**Spec:** GitHub issue #635 `[P1][DB/SECURITY][11/N] RLS, Grants & SECURITY DEFINER Hardening — least privilege y tenant-safe SQL`.

## Global Constraints

- FREE-FIRST / mandatory infrastructure cost $0.
- Never use production Supabase for destructive QA.
- Prisma schema + migrations remain structural authority; applied Prisma migrations are immutable.
- Policy corrections are forward-only sidecars and explicitly classified by the canonical database-authority manifest.
- Runtime may not receive DDL/owner/superuser/BYPASSRLS privileges.
- Never classify BLOCKED/NOT_EXECUTED/FAIL as PASS.
- No secrets, connection URLs, credentials, or PII in generated evidence.
- Required DB evidence must run against real isolated PostgreSQL before #635 can be closed.

## Review Focus

- A policy sidecar must not recreate a public `SECURITY DEFINER` helper with mutable `public` search path.
- `PUBLIC`/`anon` must not retain EXECUTE on application `SECURITY DEFINER` functions.
- A tenant-scoped table with RLS disabled or a permissive `USING (true)` runtime/authenticated policy must be visible in the audit manifest and fail strict mode.
- The migration/owner role must remain able to deploy while runtime roles stay non-owner/non-DDL.
- The audit must sanitize evidence and fail when no explicit isolated database URL is supplied for destructive/negative tests.

---

### Task 1: Add policy-authority regression contracts

**Files:**
- Create: `tests/db_security_hardening_v635.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical policy manifest `config/database-authority-67-75.json`.
- Produces: `npm run test:db-security:v635` contract gate.

- [ ] **Step 1: Write failing tests** asserting the policy authority has a v635 sidecar, `apply-rls.mjs` executes it after `0002`, and public tenant/profile helpers are not left as public `SECURITY DEFINER` functions.
- [ ] **Step 2: Run `node --test tests/db_security_hardening_v635.test.mjs`** and confirm RED against baseline.
- [ ] **Step 3: Add the root script alias and keep the test dependency-free.**
- [ ] **Step 4: Re-run the contract test after Tasks 2–3 and require PASS.**

### Task 2: Add forward-only v635 RLS/definer sidecar

**Files:**
- Create: `backend/supabase/migrations/0003_rls_grants_security_definer_hardening.sql`
- Modify: `backend/scripts/apply-rls.mjs`
- Modify: `config/database-authority-67-75.json`

**Interfaces:**
- Consumes: legacy `0002_rls_policies.sql` and existing `private.current_tenant_id()` semantics.
- Produces: final policy state after `0002 -> 0003` with hardened helper functions and schema/function grants.

- [ ] **Step 1: Add safe private helpers** with schema-qualified references and closed `search_path`.
- [ ] **Step 2: Replace public compatibility helpers with `SECURITY INVOKER` wrappers** and revoke execution from `PUBLIC`/`anon`.
- [ ] **Step 3: Revoke `CREATE` on application schemas from runtime-facing roles and revoke default public execution on application `SECURITY DEFINER` functions while preserving trigger execution semantics.**
- [ ] **Step 4: Make `apply-rls.mjs` execute `0002` then `0003` in one connection and classify `0003` as policy authority.**
- [ ] **Step 5: Run the static policy-authority and v635 regression gates.**

### Task 3: Add catalog-driven RLS/grants/function audit manifest

**Files:**
- Create: `backend/scripts/db-security-hardening-v635.mjs`
- Modify: `backend/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DIRECT_DATABASE_URL` or `DATABASE_URL` in read-only audit mode.
- Produces: sanitized JSON manifest plus stable findings `TENANT_RLS_DISABLED`, `PERMISSIVE_TENANT_POLICY`, `UNSAFE_DEFINER_SEARCH_PATH`, `PUBLIC_DEFINER_EXECUTE`, `ANON_DEFINER_EXECUTE`, `RUNTIME_ROLE_ESCALATION`, `RUNTIME_DDL_PRIVILEGE`.

- [ ] **Step 1: Query `pg_class`, `pg_attribute`, `pg_policies`, `pg_proc`, role attributes, and grants for application-owned public/private objects.**
- [ ] **Step 2: Emit deterministic evidence without connection strings or row data.**
- [ ] **Step 3: Strict mode exits non-zero on P0/P1 findings; manifest-only mode remains read-only.**
- [ ] **Step 4: Add `audit:db-security:v635` scripts and regression tests for finding classification.**

### Task 4: Runtime tenant-boundary decision and negative test harness

**Files:**
- Modify: `ops/database/provision-security-roles.sql`
- Modify: `ops/database/verify-security-roles.sql`
- Create if architecture is safe: `backend/scripts/db-security-negative-v635.mjs`
- Create if a prerequisite is discovered: atomic follow-up GitHub issue describing the runtime tenant-context dependency.

**Interfaces:**
- Consumes: trusted tenant identity from the backend and PostgreSQL runtime role.
- Produces: either a verified transaction-scoped DB tenant boundary or an explicit blocking finding; never a permissive all-tenant policy presented as secure.

- [ ] **Step 1: Characterize whether `contagest_runtime` can receive a trusted transaction-scoped tenant identity for every application query.**
- [ ] **Step 2: If safe, replace `contagest_runtime_backend_all USING (true)` with tenant-aware policies and prove A→A allow, A→B/B→A deny for SELECT/INSERT/UPDATE/DELETE.**
- [ ] **Step 3: If not safe in this ticket, make the audit fail on the permissive runtime policy, create the prerequisite ticket, and keep #635 open/PARTIAL.**
- [ ] **Step 4: Verify runtime remains NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS and cannot DDL/escalate roles.**

### Task 5: Exact-SHA verification and closure decision

**Files:**
- Create: `docs/qa/issue-635-rls-grants-definer-hardening.md`
- Update only if all acceptance criteria pass: issue #635 / backlog #624.

**Interfaces:**
- Consumes: candidate commit SHA and outputs from Tasks 1–4 plus canonical #632 migration chain.
- Produces: VERIFIED/PARTIAL/BLOCKED report with exact commands and SHA.

- [ ] **Step 1: Run static tests, authority gate, typecheck/build/tests proportional to changed code.**
- [ ] **Step 2: Run real isolated PostgreSQL 17 #626/#632 plus v635 A/B/EXECUTE/search_path/escalation negative tests.**
- [ ] **Step 3: Review diff for secrets, historical migration mutation, and unrelated scope.**
- [ ] **Step 4: Create PR. Merge/close #635 only if all required local DB gates are VERIFIED on the exact candidate SHA; otherwise leave PR or issue open with precise BLOCKED/PARTIAL evidence.**
