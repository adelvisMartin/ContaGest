# Supabase/Auth Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make identity/session verification deterministic and fail-closed without moving tenant/RBAC authority into client tokens.

**Architecture:** Bearer tokens are classified once by `authBoundary.ts` and routed to exactly one cryptographic verifier. ContaGest JWT remains the canonical backend/browser identity path; Supabase is an explicit opt-in bridge. Active profile, tenant, license, membership and RBAC remain server-side lookups. Browser refresh/revocation stays owned by `UserSession`.

**Tech Stack:** TypeScript, Express, jsonwebtoken, Supabase JS, Prisma, node:test/tsx.

**Spec:** GitHub issue #636.

## Constraints

- No verifier fallback after a ContaGest token verification failure.
- Do not trust tenant/role/permissions from client request payloads.
- Preserve cookie CSRF, refresh rotation and server revocation semantics.
- Supabase bridge stays off by default and fails closed if explicitly misconfigured.
- No real tokens/secrets in fixtures or artifacts.

### Task 1: Characterize and isolate token authority

**Files:** `backend/src/shared/auth/authBoundary.ts`, `backend/src/modules/auth/auth.boundary.test.ts`.

- [x] Route ContaGest-looking tokens to backend verifier only.
- [x] Route external tokens to Supabase only when bridge is explicitly enabled.
- [x] Fail closed on incomplete bridge configuration.

### Task 2: Harden backend JWT claims and request context

**Files:** `backend/src/shared/auth/jwt.ts`, `backend/src/shared/middleware/context.ts`.

- [x] Require algorithm/issuer/audience plus explicit `authMode` and `tokenType` claims.
- [x] Remove opportunistic backend→Supabase verifier fallback.
- [x] Keep active profile/tenant resolution server-side for every request.
- [x] Preserve cookie server-session and CSRF checks.

### Task 3: Preventive contracts and documentation

**Files:** `tests/auth_boundary_issue_636.test.mjs`, `docs/security/auth-boundary-v636.md`, `scripts/run-authoritative-contracts.mjs`.

- [x] Pin deterministic provider routing and JWT verification contract.
- [x] Pin refresh replay/revocation/CSRF and server-side RBAC authority.
- [x] Document 401/403/503 behavior and external-provider classification.
- [ ] Register focused contract in authoritative suite.

### Task 4: Exact candidate verification

- [ ] Run focused contract.
- [ ] Run backend auth tests/typecheck/build.
- [ ] Run applicable API/browser session smoke if runtime is available.
- [ ] Keep provider-specific unavailable behavior `BLOCKED_EXTERNAL_PROVIDER`, not PASS.
- [ ] Review diff and merge only after material local/backend gates execute on exact SHA.
