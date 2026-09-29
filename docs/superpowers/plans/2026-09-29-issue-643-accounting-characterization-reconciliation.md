# Accounting Characterization & Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make transversal financial behavior characterizable before/after refactors using one synthetic golden manifest, explicit reconciliation invariants, deterministic failure injection, and the existing real isolated PostgreSQL adapter.

**Architecture:** v643 is an orchestration/characterization layer, not a second accounting engine. The manifest references the established v559 golden fixture and real PostgreSQL flow. A dependency-free BigInt/minor-unit reconciler detects duplicate, unbalanced, orphan and destructive-posting effects. Local Verification v630 remains the execution authority for the real database gate.

**Tech Stack:** Node.js ESM, node:test, TypeScript/tsx real backend harness, Prisma, PostgreSQL 17.

**Spec:** GitHub issue #643.

## Constraints

- No production data or live rates in fixtures.
- No binary floating-point money arithmetic in the v643 engine.
- Do not duplicate sales/purchase/ledger business rules in QA.
- Real PostgreSQL remains mandatory for DONE.
- Do not weaken existing v559 assertions to obtain green.
- Remote CI without executed steps is not PASS.

### Task 1: Golden manifest and pure reconciliation engine

**Files:** `qa/fixtures/accounting-characterization-v643.json`, `scripts/accounting-reconciliation-v643.mjs`.

- [x] Version synthetic scenarios/invariants and bind the real adapter.
- [x] Reconcile logical effects using integer minor units.
- [x] Detect duplicate, unbalanced, orphan and posted-mutation findings.

### Task 2: Characterization/failure contracts

**File:** `tests/accounting_characterization_reconciliation_issue_643.test.mjs`.

- [x] Verify full transversal scenario/invariant catalog.
- [x] Prove injected corruption fails closed.
- [x] Pin real PostgreSQL adapter coverage for sale/purchase/banking/reversal/close/tenant/idempotency.
- [x] Pin existing Local Verification financial/full real PostgreSQL gate.

### Task 3: Documentation

**File:** `docs/finance/accounting-characterization-reconciliation-v643.md`.

- [x] Document authority, invariants, failure taxonomy and before/after refactor use.
- [x] Keep real DB and CI evidence classification explicit.

### Task 4: Exact-candidate verification

- [ ] Run v643 contract on candidate SHA.
- [ ] Run `npm run test:backend:financial:reconciliation:real` on isolated PostgreSQL 17 candidate SHA.
- [ ] Review diff for business-rule/accounting-authority changes (expected: none).
- [ ] Merge only after mandatory real PostgreSQL evidence exists; otherwise keep BLOCKED with PR open.
