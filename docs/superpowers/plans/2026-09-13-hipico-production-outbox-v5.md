# Control Hípico Production Outbox v5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `public.hipico_outbox` the only production authority for all new outbound WhatsApp sends, with durable idempotency, leases, bounded retry/cooldown, Meta delivery receipts and fail-closed reconciliation for ambiguous delivery.

**Architecture:** All new sends enter one canonical PostgreSQL outbox. A worker claims eligible rows with a lease, invokes the transport adapter, and persists provider acceptance/receipts back to the same row plus append-only receipt evidence. Ambiguous transport outcomes never auto-retry; they move to `reconciliation_required` until a verified provider receipt or explicit operator reconciliation resolves them. Legacy `HipicoBotOutbox` remains compatibility-only and is not authoritative for new production sends.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, Prisma raw SQL/PostgreSQL, Supabase SQL migrations, Node test runner through `tsx --test`.

**Spec:** Approved production invariants from 2026-09-13: `public.hipico_outbox` is the sole outbound authority; any plausible provider acceptance uncertainty must enter `reconciliation_required` and be excluded from automatic retry.

## Global Constraints

- Preserve Control Hípico behavior and product identity; no unrelated ERP refactor.
- No automatic SOURCE enablement in this implementation.
- No financial authority or monetary mutation from outbound delivery.
- No client-side approval may grant production send authority.
- No blind retries after ambiguous provider delivery.
- New production sends must not write to legacy `HipicoBotOutbox` as authority.
- Every idempotency key reused with different semantic content must fail closed.
- All provider/raw diagnostics exposed to UI must be sanitized.

---

### Task 1: Pure outbound state machine and retry policy

**Files:**
- Create: `backend/src/modules/hipico-bot/hipico-outbox-policy.ts`
- Create: `backend/src/modules/hipico-bot/hipico-outbox-policy.test.ts`

**Interfaces:**
- Produces `outboundPayloadDigest()`, `retryDelayMs()`, `classifyOutboundFailure()`, `canAutoClaim()` and monotonic Meta receipt ordering helpers.

- [ ] Write failing tests for deterministic payload digest, exponential backoff with bounded jitter input, retryable pre-acceptance failures, ambiguous network/408/5xx classification, terminal 4xx, and monotonic receipt ordering.
- [ ] Run `cd backend && npm run test:hipico -- --test-name-pattern="outbox policy"` and verify RED for missing module/API.
- [ ] Implement only the policy helpers needed by the tests.
- [ ] Re-run the focused tests and then `npm run test:hipico`.
- [ ] Commit the policy/tests.

### Task 2: Canonical PostgreSQL outbox schema

**Files:**
- Create: `supabase/sql/hipico_v21_production_outbox.sql`
- Create: `backend/prisma/migrations/20260913233000_hipico_production_outbox_v5/migration.sql`
- Create: `backend/src/modules/hipico-bot/hipico-outbox-schema.test.ts`

**Interfaces:**
- Extends `public.hipico_outbox` with correlation/digest, provider, lease, retry/cooldown and lifecycle timestamps.
- Creates append-only `public.hipico_outbox_receipts` keyed by provider receipt identity.

- [ ] Write schema contract tests first for required columns, constraints, indexes and receipt dedupe.
- [ ] Run focused schema tests and verify RED.
- [ ] Add replay-safe additive migrations with status set `queued|sending|accepted|sent|delivered|read|retry|cancelled|failed|reconciliation_required`, `lease_token`, `leased_at`, `leased_until`, `attempts`, `max_attempts`, `next_attempt_at`, `cooldown_until`, `correlation_id`, `payload_digest`, `provider`, `external_message_id`, accepted/delivered/read timestamps and terminal error metadata.
- [ ] Add `hipico_outbox_receipts` append-only evidence and indexes for claim/read paths.
- [ ] Re-run schema tests.

### Task 3: Canonical outbox store with idempotent enqueue and lease-safe claim

**Files:**
- Create: `backend/src/modules/hipico-bot/hipico-outbox.store.ts`
- Create: `backend/src/modules/hipico-bot/hipico-outbox.store.test.ts`

**Interfaces:**
- Produces `enqueueCanonicalOutbound(input)`, `claimCanonicalOutbound(input)`, `markCanonicalAccepted(...)`, `markCanonicalRetry(...)`, `markCanonicalFailed(...)`, `markCanonicalReconciliationRequired(...)`, `recordCanonicalReceipt(...)`, `listCanonicalOutbox(...)`.

- [ ] Write failing tests for same-key/same-content replay, same-key/different-content conflict, owner/group isolation, one-winner lease claim, expired lease handling, cooldown exclusion and lease-token ownership on finalization.
- [ ] Verify RED.
- [ ] Implement enqueue as one-row authority in `public.hipico_outbox`; use transaction/row lock semantics and `FOR UPDATE SKIP LOCKED` for claims.
- [ ] Ensure ambiguous/stale sending rows become `reconciliation_required`, never `retry`.
- [ ] Re-run focused and Hípico tests.

### Task 4: Move operator/webhook production sends to canonical outbox

**Files:**
- Modify: `backend/src/modules/hipico-bot/hipico-bot.service.ts`
- Modify: `backend/src/modules/hipico-bot/hipico-operator.routes.ts`
- Modify: `backend/src/modules/hipico-bot/hipico-webhook.routes.ts`
- Create: `backend/src/modules/hipico-bot/hipico-outbound-worker.ts`
- Create: `backend/src/modules/hipico-bot/hipico-outbound-worker.test.ts`

**Interfaces:**
- New sends enqueue canonical records and worker executes a claimed lease through `sendCloudText`.

- [ ] Write failing route/worker tests proving no new production send depends on `HipicoBotOutbox`, claim loss prevents send, deterministic pre-acceptance failure can retry, ambiguous transport parks in reconciliation, and accepted provider ID is durably persisted.
- [ ] Verify RED.
- [ ] Implement canonical worker and adapt `/test-message`, `/approve/:id`, and automatic webhook response path.
- [ ] Keep legacy table reads only where compatibility views require them; no production enqueue/send authority remains there.
- [ ] Re-run focused and Hípico tests.

### Task 5: Meta delivery receipt ingestion and reconciliation

**Files:**
- Modify: `backend/src/modules/hipico-bot/hipico-webhook.routes.ts`
- Create: `backend/src/modules/hipico-bot/hipico-meta-receipts.ts`
- Create: `backend/src/modules/hipico-bot/hipico-meta-receipts.test.ts`

**Interfaces:**
- Parses webhook `statuses` and records idempotent evidence against canonical outbox by provider message id.

- [ ] Write failing tests for `sent`, `delivered`, `read`, `failed`, duplicate receipts, out-of-order receipts and reconciliation resolution only with verifiable matching provider ID.
- [ ] Verify RED.
- [ ] Implement strict receipt extraction/validation and monotonic lifecycle updates.
- [ ] Do not expose raw provider secrets or full payloads in public responses/logs.
- [ ] Re-run focused and full Hípico tests.

### Task 6: Command Center canonical outbox read model

**Files:**
- Modify: `backend/src/modules/hipico/command-center.routes.ts`
- Modify relevant Command Center frontend module only if its existing contract requires adaptation.
- Add/update route contract tests under `backend/src/modules/hipico/`.

**Interfaces:**
- Exposes sanitized counts/items for `queued`, `sending`, `retry`, `reconciliation_required`, `failed`, `accepted`, `sent`, `delivered`, `read`, plus oldest pending age.

- [ ] Write failing contract tests first.
- [ ] Verify RED.
- [ ] Read only from canonical outbox/read model and preserve no-store/operator authorization.
- [ ] Re-run route tests and Hípico suite.

### Task 7: Regression, security and release verification

**Files:**
- Update documentation only where operational env/behavior changed.

- [ ] Run `cd backend && npm run typecheck`.
- [ ] Run `cd backend && npm run test:hipico`.
- [ ] Run `cd backend && npm run build`.
- [ ] Run repository contract/security tests relevant to Hípico and outbox.
- [ ] Review diff for secrets, accidental workflow weakening, SOURCE auto-enable, financial writes and legacy-authority regressions.
- [ ] Open PR from `feat/hipico-production-outbox-v5` to current `main`; validate exact head SHA CI.
- [ ] Merge only if exact-SHA evidence meets project gates. If CI infrastructure produces no executable job evidence, report BLOCKED rather than fabricating PASS.
