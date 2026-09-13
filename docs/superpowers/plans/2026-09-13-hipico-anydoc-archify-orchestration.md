# Control Hípico AnyDoc + Archify Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la lectura segura de PDFs del WhatsApp SOURCE mediante el motor documental canónico, integrar AnyDoc localmente y añadir Archify como tooling reproducible de arquitectura sin conceder autoridad financiera.

**Architecture:** El WhatsApp Web Bridge descarga únicamente PDFs del mensaje SOURCE exacto y los transmite por un endpoint binario autenticado. El backend deriva scope confiable, valida el PDF, y delega en `DocumentIngestionService`; AnyDoc entra detrás del contrato `PdfTextExtractor` y Poppler/Tesseract permanece como fallback. Archify queda fuera del runtime y sólo genera/valida documentación.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, Playwright 1.62, PostgreSQL/Supabase, `@firecrawl/anydoc@0.2.4`, Archify v2.16.0.

**Spec:** `docs/superpowers/specs/2026-09-13-hipico-anydoc-archify-orchestration-design.md`

## Global Constraints

- SOURCE read-only; nunca enviar al grupo oficial.
- `financialAuthority=false` para toda evidencia documental/external/agent.
- AnyDoc hosted OCR OFF por defecto.
- PDF máximo 10 MiB; validar bytes, MIME, estructura y contenido activo antes de persistir.
- Scope owner/group derivado de configuración server-side; el cliente no puede elevar autoridad.
- Exact-SHA evidence before PASS; #119/#120/#134 permanecen gates independientes.

---

### Task 1: AnyDoc extractor adapter

**Files:**
- Create: `backend/src/modules/hipico/document-anydoc-extractor.ts`
- Create: `backend/src/modules/hipico/document-anydoc-extractor.test.ts`
- Modify: `backend/package.json`
- Modify: `package-lock.json`
- Modify: `backend/src/modules/hipico/document-extractor.ts`

**Interfaces:**
- Consumes: `PdfTextExtractor`, `ExtractionResult`.
- Produces: `createAnyDocDocumentExtractor(env, dependency?)`, `createPreferredDocumentExtractor(env)`.

- [ ] **Step 1:** Write tests proving local `toMarkdownBytes(..., 'pdf', {ocr:'reject'})`, stable error mapping, hosted OCR disabled by default and `auto` fallback semantics.
- [ ] **Step 2:** Run the focused test and verify RED because the adapter does not exist.
- [ ] **Step 3:** Implement the minimal adapter and provider selector; pin `@firecrawl/anydoc` to `0.2.4` in package metadata/lock.
- [ ] **Step 4:** Run focused tests, `typecheck`, and existing document tests; verify GREEN before continuing.
- [ ] **Step 5:** Commit adapter separately.

### Task 2: Binary Bridge PDF ingress

**Files:**
- Create: `backend/src/modules/hipico-bot/hipico-bridge-document.routes.ts`
- Create: `backend/src/modules/hipico-bot/hipico-bridge-document.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: Bridge token/identity policy, `DocumentIngestionService`, canonical document store/extractor.
- Produces: `POST /api/v1/hipico-bot/bridge/documents` accepting `application/pdf` only.

- [ ] **Step 1:** Write failing tests for token, SOURCE identity, server-side UUID owner, bounded metadata, MIME/body limits and provenance.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement a raw-PDF route using `express.raw`, trusted scope derivation and canonical ingest.
- [ ] **Step 4:** Verify focused unit/contracts and ensure JSON webhook path remains unchanged.
- [ ] **Step 5:** Commit route separately.

### Task 3: WhatsApp Web automatic PDF download and spool

**Files:**
- Create: `tools/hipico-whatsapp-web-bridge/src/document-media.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/tests/document-media.test.mjs`
- Modify: `tools/hipico-whatsapp-web-bridge/src/live-v130.mjs`
- Modify: `tools/hipico-whatsapp-web-bridge/src/runtime-config.mjs`
- Modify: `tools/hipico-whatsapp-web-bridge/package.json`

**Interfaces:**
- Consumes: visible row with exact `data-id`, SOURCE identity, backend document ingress URL/token.
- Produces: bounded local PDF file/Buffer delivery receipt keyed by `externalMessageId`.

- [ ] **Step 1:** Write tests for `shouldAutoIngestPdf`, filename normalization, 10 MiB limit, history exclusion, retry classification and no caption fallback.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Implement exact-message download via Playwright download event, temporary restricted file, raw backend POST, and cleanup. Keep event spool independent.
- [ ] **Step 4:** Run Bridge `check`/tests where executable; physical WhatsApp behavior remains #119 until real device evidence.
- [ ] **Step 5:** Commit Bridge feature separately.

### Task 4: Archify reproducible tooling and diagrams

**Files:**
- Create: `scripts/hipico-archify-doctor.mjs`
- Create: `docs/hipico/ARCHIFY_AND_ANYDOC_RUNBOOK.md`
- Create: `docs/hipico/diagrams/control-hipico-runtime.md`
- Create: `docs/hipico/diagrams/control-hipico-pdf-ingestion.md`
- Create: `docs/hipico/diagrams/control-hipico-orchestration.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: Archify v2.16.0 installation and deterministic update-check-off environment.
- Produces: doctor command, operator runbook, Mermaid sources and Archify generation commands.

- [ ] **Step 1:** Write a contract test asserting pin `v2.16.0`, expected release digest, update checks disabled in deterministic usage, and required diagram sources/runbook.
- [ ] **Step 2:** Verify RED.
- [ ] **Step 3:** Add doctor/tooling/docs/diagrams without runtime coupling.
- [ ] **Step 4:** Run doctor/validate/render if Archify is installed; otherwise report tooling execution as BLOCKED_ENVIRONMENT while source contracts remain testable.
- [ ] **Step 5:** Commit docs/tooling separately.

### Task 5: Orchestration + 2000 deterministic scenarios

**Files:**
- Create: `tests/hipico_anydoc_bridge_orchestration_2000.test.mjs`
- Modify: `scripts/agent-gate-router.mjs` only if Hípico is not routed to its own high-risk gates.
- Create: `docs/hipico/ORCHESTRATION_AND_PRODUCTION_READINESS.md`

**Interfaces:**
- Consumes: document ingress, bridge policy, existing release/physical/soak gates.
- Produces: deterministic campaign and readiness matrix.

- [ ] **Step 1:** Inspect agent/skills/gate router before changing it.
- [ ] **Step 2:** Write seeded 2000-case invariants covering replay, group isolation, PDF eligibility, size/MIME, no monetary authority, history behavior and duplicate identity.
- [ ] **Step 3:** Verify RED where new orchestration contract is absent, then implement only the missing routing/policy.
- [ ] **Step 4:** Run the deterministic campaign and record exact seed/case count/SHA when possible.
- [ ] **Step 5:** Document VERIFIED/BLOCKED production gates; do not collapse #119/#120/#134.

### Task 6: Integration verification and branch completion

**Files:**
- Review all changed files and PR diff.

**Interfaces:**
- Consumes: all tasks above.
- Produces: exact-SHA verification report and stacked PR.

- [ ] **Step 1:** Run focused AnyDoc, Bridge, document engine, typecheck, build and 2000-case campaign.
- [ ] **Step 2:** Run GitHub/Vercel exact-SHA workflows if infrastructure accepts jobs; inspect logs rather than check icons alone.
- [ ] **Step 3:** Run security review for secrets/logging, scope escalation, replay, active PDF content and external OCR egress.
- [ ] **Step 4:** Re-read #311/#312/#314 heads and ensure this PR does not hide unrelated known blockers.
- [ ] **Step 5:** Create a stacked PR against `fix/hipico-285-287-recovery`; no merge while required exact-SHA gates are not green.
