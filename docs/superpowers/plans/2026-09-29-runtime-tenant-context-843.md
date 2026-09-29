# Runtime Tenant Context #843 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the reusable server-side tenant context and Prisma transaction binding required before runtime RLS can be cut over.

**Architecture:** `AsyncLocalStorage` carries only a validated server-derived UUID. The existing Prisma singleton remains the codebase authority but gains a proxy that binds `contagest.tenant_id` with transaction-local PostgreSQL state before tenant-context model/raw queries and interactive transactions.

**Tech Stack:** Node.js 22, TypeScript 5.9, Prisma 6.19, PostgreSQL, node:test/tsx.

**Spec:** `docs/superpowers/specs/2026-09-29-trusted-runtime-tenant-context-design.md`

## Global Constraints

- `SOURCE_REUSE=NONE`.
- No production RLS mutation in #843.
- No session-level tenant setting.
- No environment/browser override for tenant identity.
- Sequential `$transaction([...])` must fail closed under active tenant context.
- Remote jobs without steps are `BLOCKED_INFRASTRUCTURE / NOT_EXECUTED`.

## Review Focus

- concurrent A/B AsyncLocalStorage execution must never cross-contaminate;
- invalid/non-UUID identifiers must fail before database binding;
- interactive transaction callback must receive the same bound transaction client;
- rollback must not leak database/session context;
- raw Prisma operations must use the same binding rule as model operations.

---

### Task 1: Runtime context authority

**Files:**
- Create: `backend/src/database/runtime-tenant-context.ts`
- Test: `backend/src/database/runtime-tenant-context.test.ts`

**Interfaces:**
- Produces: `normalizeRuntimeTenantId(value)`, `currentRuntimeTenantId()`, `requireRuntimeTenantId()`, `runWithRuntimeTenant(tenantId, operation)`.

- [x] Write UUID + concurrent A/B tests.
- [x] Implement AsyncLocalStorage authority.
- [x] Verify isolated equivalent harness.

### Task 2: Prisma transaction binding

**Files:**
- Create: `backend/src/database/tenant-prisma-proxy.ts`
- Modify: `backend/src/database/prisma.ts`
- Test: `backend/src/database/runtime-tenant-context.test.ts`

**Interfaces:**
- Consumes: `currentRuntimeTenantId()`.
- Produces: `createTenantScopedPrismaProxy(base, bindTenant)` preserving the existing `prisma.*` API.

- [x] Add tests for model query, interactive transaction, rollback and sequential-array fail-closed behavior.
- [x] Implement same-transaction binding.
- [x] Observe and fix the synchronous sequential-array guard failure.
- [x] Re-run isolated equivalent harness: 6/6 PASS.

### Task 3: Authoritative suite + docs

**Files:**
- Modify: `backend/package.json`
- Create: `docs/superpowers/specs/2026-09-29-trusted-runtime-tenant-context-design.md`

- [x] Register `test:runtime-tenant-context` in backend test suite.
- [x] Document #739 slice boundaries and security constraints.
- [ ] Run repository typecheck/test when executable; otherwise classify infrastructure honestly.
- [ ] Review exact branch diff, PR, merge and close #843.
