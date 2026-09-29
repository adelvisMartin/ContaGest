# Tenant Isolation Adversarial Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Establish a reusable, bidirectional tenant-isolation attack matrix and real two-tenant API/PostgreSQL regression suite.

**Architecture:** A machine-readable matrix owns coverage and non-disclosure expectations. A dependency-free validator turns every surface into A→B/B→A cases; a real backend harness suite exercises critical API/object-reference and database constraints against an ephemeral local PostgreSQL database. Local Verification v630 owns execution evidence.

**Tech Stack:** Node.js 22 ESM, TypeScript/tsx, Express, Prisma, PostgreSQL 17, node:test.

**Spec:** GitHub issue #641.

## Global Constraints

- Never point destructive QA at Supabase production.
- Authenticated request context is the tenant authority; client tenantId is never trusted.
- Foreign resource existence is not disclosed.
- Both A→B and B→A are mandatory.
- No sleeps, force, skips or relaxed assertions.
- Remote CI without executed steps is BLOCKED/NOT_EXECUTED, never PASS.

## Review Focus

- Foreign IDs in path/query/body cannot widen tenant scope.
- Nested sales/purchase/fiscal references fail before persistence.
- Direct SQL cannot bypass composite tenant integrity.
- RBAC role/user references remain tenant scoped.
- Error bodies do not echo foreign tenant/resource identifiers.

### Task 1: Matrix authority and validator

**Files:** `config/tenant-isolation-adversarial-v641.json`, `scripts/tenant-isolation-contract-v641.mjs`, `tests/tenant_isolation_adversarial_issue_641.test.mjs`.

- [x] Define critical bounded contexts, surfaces, layers, attacks and expected outcomes.
- [x] Require A_TO_B and B_TO_A expansion.
- [x] Fail closed when API or persistence coverage is omitted.
- [x] Pin existing CRUD/reference guards with source contracts.

### Task 2: Real two-tenant API/PostgreSQL suite

**Files:** `qa/tenant-isolation-adversarial-v641.test.ts`.

- [x] Create deterministic tenant B/user/role permissions beside the existing QA tenant A.
- [x] Exercise CRUD IDOR/list/update/delete in both directions.
- [x] Exercise client tenant spoofing, nested sales/purchase/fiscal references, direct SQL FK and RBAC foreign-role negatives.
- [x] Clean synthetic fixtures.

### Task 3: Runner integration and docs

**Files:** `scripts/local-verification-runner-v630.mjs`, `scripts/run-authoritative-contracts.mjs`, `docs/security/tenant-isolation-adversarial-v641.md`.

- [ ] Wire the source contract into authoritative contracts.
- [ ] Wire the real PostgreSQL suite into database/full local verification.
- [x] Document execution, semantics and review rules.

### Task 4: Exact-candidate review

- [ ] Run dependency-free contract tests.
- [ ] Run backend typecheck and real PostgreSQL suite when loopback PostgreSQL 17 is available.
- [ ] Review diff for unrelated auth/accounting/business changes.
- [ ] Create PR and merge only with evidence classified honestly.
