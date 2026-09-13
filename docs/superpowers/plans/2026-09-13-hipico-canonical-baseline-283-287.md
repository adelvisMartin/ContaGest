# Control Hípico Canonical Baseline #283–#287 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the canonical Control Hípico domain plus document, provider and race-lifecycle engines into one production baseline stacked on the completed #284 messaging boundary.

**Architecture:** `/api/v1/hipico/*` is the product API and `backend/src/modules/hipico/**` owns canonical document/provider/race behavior. `/api/v1/hipico-bot/*` remains a compatibility/integration edge for Bridge/webhooks, while the existing hardened provider transport is reused instead of duplicated. PostgreSQL migrations remain additive and all external/provider/document evidence remains non-financial by default.

**Tech Stack:** Node.js 22, TypeScript, Express, Zod, PostgreSQL/Supabase SQL, Poppler/Tesseract for document extraction, Node test runner via tsx, GitHub Actions.

**Spec:** GitHub issues #283, #285, #286 and #287; parent EPIC #282; source reconciliation merge #317.

## Global Constraints

- Preserve #284 `MessagingChannel`/Bridge boundary and do not move WhatsApp DOM/session concerns into the canonical domain.
- `/api/v1/hipico/*` owns product behavior; `/api/v1/hipico-bot/*` remains compatibility/integration only.
- No LLM or external provider receives financial authority; `financialAuthority=false` unless a future explicit requirement changes it.
- No invented racing providers or undocumented INH/Valencia APIs.
- Document ingest accepts bounded PDFs only; native extraction precedes OCR fallback; active/hostile content fails closed.
- Race state is scoped by owner/group/meeting/race, idempotent, versioned and auditable; `CLOSED` never implies settlement.
- Official results require trusted internal evidence; provisional/verified/official remain distinct.
- Preserve existing hardened `hipico-bot/hipico-race-provider.ts` transport when it already matches the reconciled source.
- Do not declare tests/build/runtime PASS unless they execute on the exact final SHA.

---

### Task 1: Reintroduce failing canonical data-engine contracts

**Files:**
- Create: `backend/src/modules/hipico/document-engine.test.ts`
- Create: `backend/src/modules/hipico/document-policy.test.ts`
- Create: `backend/src/modules/hipico/document-recovery.test.ts`
- Create: `backend/src/modules/hipico/racing-provider.test.ts`
- Create: `backend/src/modules/hipico/racing-provider-freshness.test.ts`
- Create: `backend/src/modules/hipico/race-evidence-policy.test.ts`
- Create: `backend/src/modules/hipico/race-lifecycle.test.ts`
- Create: `backend/src/modules/hipico/operator-audit-identity.test.ts`
- Create: `backend/src/modules/hipico/hipico-route-mount-contract.test.ts`
- Create: `backend/src/modules/hipico/hipico-data.integration.ts`

**Interfaces:**
- Consumes: existing #283 canonical contracts and #284 messaging boundary.
- Produces: executable behavior contracts for #285–#287.

- [ ] **Step 1:** Add the reconciled tests from the #317 source merge without their production implementations.
- [ ] **Step 2:** Trigger exact-SHA CI and verify the tests fail because the canonical data-engine modules/routes/migrations are absent; if runners do not execute, record `BLOCKED_INFRASTRUCTURE` rather than inventing RED evidence.
- [ ] **Step 3:** Commit the test-only RED stage separately.

### Task 2: Restore the canonical Document/PDF Intelligence Engine (#285)

**Files:**
- Create: `backend/src/modules/hipico/document-engine.ts`
- Create: `backend/src/modules/hipico/document-extractor.ts`
- Create: `backend/src/modules/hipico/document-parser.ts`
- Create: `backend/src/modules/hipico/document-policy.ts`
- Create: `backend/src/modules/hipico/document.routes.ts`
- Create: `backend/src/modules/hipico/document.store.ts`

**Interfaces:**
- Consumes: authenticated operator actor identity, PostgreSQL access, canonical owner/group context.
- Produces: upload/list/read/reprocess/approve document API with SHA-256 provenance, immutable revisions and recoverable extraction state.

- [ ] **Step 1:** Restore bounded PDF policy and deterministic parser/extractor.
- [ ] **Step 2:** Restore persistence with hash/revision identity, transaction/locking and recoverable processing state.
- [ ] **Step 3:** Restore authenticated routes; reject client-supplied audit authority and keep `financialAuthority=false`.
- [ ] **Step 4:** Run document unit/recovery tests and record actual evidence.

### Task 3: Restore the canonical Racing Provider Registry (#286)

**Files:**
- Create: `backend/src/modules/hipico/racing-provider.ts`
- Create: `backend/src/modules/hipico/provider-registry.ts`
- Create: `backend/src/modules/hipico/sportradar-provider.adapter.ts`
- Create: `backend/src/modules/hipico/provider-evidence.store.ts`
- Create: `backend/src/modules/hipico/provider.routes.ts`
- Preserve: `backend/src/modules/hipico-bot/hipico-race-provider.ts`

**Interfaces:**
- Consumes: hardened compatibility transport with HTTPS/vendor allowlist/DNS public-IP validation.
- Produces: capability-driven normalized provider reads with provenance, freshness, officiality, confidence and `financialAuthority=false`.

- [ ] **Step 1:** Restore provider contract/registry and explicit unsupported-capability errors.
- [ ] **Step 2:** Restore Sportradar UOF normalization without inventing provider capabilities.
- [ ] **Step 3:** Persist normalized evidence/payload hashes and fail closed on conflicts.
- [ ] **Step 4:** Run provider, freshness and SSRF tests and record actual evidence.

### Task 4: Restore race lifecycle and live query engine (#287)

**Files:**
- Create: `backend/src/modules/hipico/race-evidence-policy.ts`
- Create: `backend/src/modules/hipico/race-lifecycle.ts`
- Create: `backend/src/modules/hipico/race.routes.ts`
- Create: `backend/src/modules/hipico/race.store.ts`

**Interfaces:**
- Consumes: canonical evidence from documents/providers and authenticated operator actor.
- Produces: Meeting/Race state machine, idempotent commands, lifecycle audit events and bounded schedule/status/scratches/result queries.

- [ ] **Step 1:** Restore lifecycle transition policy and official-evidence gate.
- [ ] **Step 2:** Restore transactionally locked/versioned/idempotent persistence and append-only events.
- [ ] **Step 3:** Restore routes with strict owner/group/meeting/race scope and server-derived actor identity.
- [ ] **Step 4:** Run lifecycle/evidence tests and record actual evidence.

### Task 5: Mount canonical API and add additive PostgreSQL schema

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/shared/middleware/security.ts`
- Modify: `backend/package.json`
- Create: `supabase/sql/hipico_v17_data_engines.sql`
- Create: `supabase/sql/hipico_v18_evidence_hardening.sql`
- Create: `supabase/sql/hipico_v19_provider_evidence.sql`
- Create: `supabase/sql/hipico_v20_lifecycle_idempotency.sql`

**Interfaces:**
- Consumes: canonical routers from Tasks 2–4.
- Produces: `/api/v1/hipico/documents*`, `/providers*`, `/races*` product routes and compatibility `/api/v1/hipico-bot/*` separation.

- [ ] **Step 1:** Mount canonical routers with one shared auth/mutation-rate-limit chain; keep legacy provider router under `/hipico-bot` only.
- [ ] **Step 2:** Skip mutation limiting for GET/HEAD/OPTIONS and allow only canonical idempotency headers in browser CORS.
- [ ] **Step 3:** Add v17–v20 additive migrations without rewriting historical evidence.
- [ ] **Step 4:** Add `test:hipico-data-integration` to backend scripts.
- [ ] **Step 5:** Run route contracts, typecheck, build and PostgreSQL integration when runners are available.

### Task 6: Exact-SHA production gate for #285–#287

**Files:**
- Create: `.github/workflows/hipico-data-engines.yml`
- Create: `backend/src/modules/hipico-bot/hipico-data-workflow-contract.test.ts`
- Create: `backend/src/modules/hipico-bot/hipico-race-provider-ssrf.test.ts`
- Create: `docs/hipico/PROVIDER-RESEARCH-286.md`

**Interfaces:**
- Consumes: final canonical source/migrations.
- Produces: exact-SHA evidence for unit/contracts/typecheck/build/PostgreSQL/Poppler/Tesseract/runtime and cleanup.

- [ ] **Step 1:** Restore the dedicated data-engine workflow with PostgreSQL 16 isolation, native PDF/OCR tooling and fail-closed cleanup.
- [ ] **Step 2:** Restore workflow/SSRF contracts and provider research matrix.
- [ ] **Step 3:** Review final diff against the #284 base and confirm no unrelated historical-stack files were imported.
- [ ] **Step 4:** Execute/inspect all final-SHA gates; classify jobs with no runner steps/logs as `BLOCKED_INFRASTRUCTURE`.
- [ ] **Step 5:** Keep the PR Draft/unmerged until required final-SHA gates actually execute green.
