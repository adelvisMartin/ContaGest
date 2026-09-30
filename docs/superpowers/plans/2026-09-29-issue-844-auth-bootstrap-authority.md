# Issue 844 Auth Bootstrap Authority Implementation Plan

> **Execution:** apply with `superpowers:executing-plans` and TDD. The approved design is `docs/superpowers/specs/2026-09-29-trusted-runtime-tenant-context-design.md` plus issue #844.

**Goal:** Separate pre-tenant authentication bootstrap from tenant-scoped runtime access without preserving an all-tenant application bypass.

**Architecture:** Three narrow private `SECURITY DEFINER` functions own the unavoidable pre-context reads/writes: login identity resolution, Supabase auth-user resolution, and first-tenant registration. Backend JWT claims are verified before database authority is established; immediately after a signed/database-resolved tenant exists, all normal access crosses into #843 `runWithRuntimeTenant`.

**Constraints:** `SOURCE_REUSE=NONE`; forward-only migration; no production destructive QA; no client tenant selector as authority; no runtime BYPASSRLS/DDL/ownership; private functions use schema-qualified application objects, closed search path, safe ownership and explicit EXECUTE only for `contagest_runtime`.

## Task 1 — database bootstrap authority

Files:
- `backend/prisma/migrations/20260930010500_issue_844_auth_bootstrap_authority/migration.sql`
- `backend/scripts/auth-bootstrap-v844.mjs`
- `backend/package.json`

Verification contract:
- login accepts only RIF + email and returns only tenant/profile/password-hash identity;
- Supabase accepts only provider `authUserId` and returns one active profile/tenant identity;
- registration is one atomic database invocation with per-RIF advisory serialization and conflict mapping;
- PUBLIC/anon/authenticated/service_role cannot execute the private functions;
- runtime remains NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS.

Use existing zero-cost/local verification infrastructure; do not add a ticket-specific GitHub Actions workflow. PostgreSQL 17 execution is required when a local/container runtime exists and is otherwise recorded `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`, never PASS.

## Task 2 — backend handoff

Files:
- `backend/src/database/auth-bootstrap.ts`
- `backend/src/database/auth-bootstrap.test.ts`
- `backend/src/shared/middleware/context.ts`
- `backend/src/modules/auth/auth.routes.ts`
- `backend/src/modules/auth/auth.boundary.test.ts`

Verification contract:
- forged/tampered backend JWT fails before tenant DB lookup;
- signed tenant claim is revalidated against active server session/profile inside the same tenant;
- Supabase token is verified by provider before private identity resolution;
- login password validation is followed by same-profile revalidation inside tenant context;
- downstream Express work inherits tenant ALS context;
- registration materializes the session only after entering the newly created tenant context.

## Task 3 — docs and evidence

File:
- `docs/security/auth-bootstrap-authority-v844.md`

Run when infrastructure exists:

```bash
npm --workspace backend run test:auth-bootstrap:postgres
npm --workspace backend run test:auth-bootstrap:unit
npm --workspace backend run test:runtime-tenant-context
npm --workspace backend run typecheck
npm --workspace backend run build
npm --workspace backend run migration:test:from-zero
npm --workspace backend run migration:test:upgrade
npm run audit:database-authority
npm run audit:raw-sql-security
npm run agent:gates -- --base main --type backend
```

Create the PR with exact candidate SHA and classify every unavailable gate honestly. #845 remains the owner of runtime RLS cutover; #846 remains the owner of the two-tenant/pool adversarial closure gate.
