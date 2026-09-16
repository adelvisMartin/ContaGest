# Control Hípico Production Hardening v9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actualizar el release hardening #290 al estado v6-v8 del producto y producir evidencia exact-SHA fail-closed para PostgreSQL v12-v24, seguridad, browser, Android, performance y readiness.

**Architecture:** Reutilizar el pipeline v290 existente como única autoridad de QA/release. Endurecer sus contratos, chain PostgreSQL, evidence verifier y report en cambios incrementales, sin cambiar lógica de negocio para fabricar verde.

**Tech Stack:** Node 22, TypeScript 5.9, Express 5, Prisma 6.19, PostgreSQL 16, Node test runner, tsx, Playwright 1.63, GitHub Actions, Android/Capacitor existente.

**Spec:** `docs/superpowers/specs/2026-09-16-hipico-production-hardening-v9-design.md`

## Global Constraints

- Baseline: `refactor/hipico-core-v8@d40a00134104bd7f6ad3d72e9b6ff267a7b94f75`.
- No authority financiera nueva; `financialAuthority=false`.
- SOURCE permanece SHADOW/read-only.
- No cambiar rutas/payloads públicos esenciales para satisfacer tests.
- No `continue-on-error: true`, `|| true`, `test.skip`, `test.only`, `waitForTimeout` ni `force: true`.
- GitHub runner sin steps/logs = `BLOCKED_INFRASTRUCTURE`, nunca PASS.
- TDD: contrato RED antes de cada producción GREEN cuando cambie comportamiento/validación.

---

### Task 1: Contract RED — v12-v24 + v6-v8 release boundaries

**Files:**
- Modify: `tests/hipico_postgres_e2e_chain_290.test.mjs`
- Modify: `tests/hipico_release_hardening_290_contract.test.mjs`
- Create: `tests/hipico_v9_release_boundaries.test.mjs`

**Interfaces:**
- Consumes: archivos v290 actuales y módulos v6-v8 existentes.
- Produces: contratos que requieren v23/v24, evidence hardening y boundaries v6-v8.

- [ ] **Step 1:** Cambiar el contrato PostgreSQL para exigir `hipico_v23_risk_policy.sql`, `hipico_v24_shadow_metrics.sql`, sus columnas/constraints y label `v12-v24`.
- [ ] **Step 2:** Cambiar release-hardening contract para exigir `currentPostgresChain: 'v12-v24'`, workflow ejecutable en stacked PR y scripts Agent v6-v8.
- [ ] **Step 3:** Crear un test que congele `financialAuthority=false`, SOURCE shadow-only, model advisory-only, dual-window promotion y canonical outbox authority mediante marcadores en producción.
- [ ] **Step 4:** Ejecutar `node --test tests/hipico_postgres_e2e_chain_290.test.mjs tests/hipico_release_hardening_290_contract.test.mjs tests/hipico_v9_release_boundaries.test.mjs` y confirmar RED por los gaps v22→v24/evidence actuales. Si el runner no está disponible, registrar `BLOCKED_INFRASTRUCTURE`; no fingir RED ejecutado.
- [ ] **Step 5:** Commit `test(hipico): require current v9 release boundaries`.

### Task 2: PostgreSQL v12-v24 E2E chain

**Files:**
- Modify: `scripts/hipico-apply-e2e-schema-v290.mjs`
- Modify: `scripts/hipico-release-guard-v290.mjs`
- Test: contratos de Task 1 + `backend/src/modules/hipico/hipico-agent.integration.ts`

**Interfaces:**
- Produces: chain real `v12-v24` y evidencia schema/RBAC.

- [ ] **Step 1:** Añadir v23/v24 al array de migrations en orden exacto después de v22.
- [ ] **Step 2:** Añadir probes `information_schema.columns` para policy + metric columns NOT NULL.
- [ ] **Step 3:** Añadir probes `pg_constraint` para policy disposition/evidence y metric schema version.
- [ ] **Step 4:** Mantener `hipico_agent_evaluations_review_once` como trigger obligatorio después de v24.
- [ ] **Step 5:** Actualizar artifact/logs/guard de `v12-v22` a `v12-v24` y exigir archivos v23/v24.
- [ ] **Step 6:** Ejecutar contratos RED→GREEN y PostgreSQL integration cuando haya runner/local DB.
- [ ] **Step 7:** Commit `feat(hipico): harden postgres release chain through v24`.

### Task 3: Evidence integrity and readiness caps

**Files:**
- Create: `tests/hipico_v9_evidence_readiness.test.mjs`
- Modify: `scripts/hipico-verify-evidence-v290.mjs`
- Modify: `scripts/hipico-release-report-v290.mjs`

**Interfaces:**
- Produces: required SHA-bound evidence set y release report con score/caps.

- [ ] **Step 1:** Escribir test RED que exija `staticGate`, `chromiumGate`, `securityGate`, `androidGate` como required evidence junto a release/postgres/restart/performance/manifest.
- [ ] **Step 2:** Escribir test RED para readiness caps 60/79/69/70 y `automationReadiness=NOT_VERIFIED` cuando shadow/race-context no estén verificados.
- [ ] **Step 3:** Promover los artifacts de código a `requiredDescriptors` en evidence verifier; mantener browser matrix/physical fuera del code-review aggregate.
- [ ] **Step 4:** Implementar funciones puras exportables en release report para `computeReadinessScore` y `automationReadiness`, conservando CLI execution.
- [ ] **Step 5:** Reportar `postgresChain: 'v12-v24'`, caps aplicados y razones; nunca inferir PASS de datos ausentes.
- [ ] **Step 6:** Ejecutar test RED→GREEN.
- [ ] **Step 7:** Commit `feat(hipico): make release evidence and readiness fail closed`.

### Task 4: Workflow exact-SHA usable in stacked PRs

**Files:**
- Modify: `.github/workflows/hipico-production-gates-v290.yml`
- Modify: `tests/hipico_release_hardening_290_contract.test.mjs`
- Create: `tests/hipico_v9_workflow_contract.test.mjs`

**Interfaces:**
- Produces: un workflow canónico que corre en stacked PR y main PR con exact candidate SHA.

- [ ] **Step 1:** Test RED: el workflow no debe restringirse sólo a `pull_request.branches: [main]`.
- [ ] **Step 2:** Test RED: PostgreSQL label/artifact debe decir v12-v24 y ejecutar Agent PostgreSQL E2E además de data E2E.
- [ ] **Step 3:** Mantener Chromium PR, scheduled/manual Firefox/WebKit, Android, security y release-report jobs.
- [ ] **Step 4:** Añadir `npm --workspace backend run test:hipico:agent` al PostgreSQL gate para persistencia/policy/metrics real.
- [ ] **Step 5:** Actualizar evidence JSON del PostgreSQL job a `v12-v24`.
- [ ] **Step 6:** Ejecutar contract tests y `git diff --check` cuando sea posible.
- [ ] **Step 7:** Commit `ci(hipico): run v9 production gates on exact stacked SHA`.

### Task 5: Security/browser/performance release contract consolidation

**Files:**
- Create: `tests/hipico_v9_security_browser_performance.test.mjs`
- Modify: `scripts/hipico-release-guard-v290.mjs`

**Interfaces:**
- Produces: contrato explícito de #290 sin reimplementar suites existentes.

- [ ] **Step 1:** Test RED para asegurar provider SSRF/security tests, replay/idempotency, group isolation, hostile documents, agent tool boundaries y no-bypass markers dentro de las suites/rutas ya existentes.
- [ ] **Step 2:** Test RED para browser config con Chromium/Firefox/WebKit y mobile viewport/accessibility evidence vigente.
- [ ] **Step 3:** Test RED para performance artifact con `[100, 500, 2000]`, memoria/query plan y physical acceptance separado.
- [ ] **Step 4:** Añadir únicamente checks contractuales faltantes al release guard; no duplicar lógica de las suites.
- [ ] **Step 5:** Ejecutar contract suite.
- [ ] **Step 6:** Commit `test(hipico): freeze production security browser and performance gates`.

### Task 6: Exact-SHA workflow and PR publication

**Files:**
- Modify only if failures reveal a defect covered by a failing regression test.

**Interfaces:**
- Produces: PR v9 stacked on `refactor/hipico-core-v8` con evidencia verificable.

- [ ] **Step 1:** Ejecutar/observar `npm run release:hipico:v290`, `npm run test:hipico`, backend typecheck/build, PostgreSQL E2E, Chromium/security/Android según Actions del candidate exacto.
- [ ] **Step 2:** Inspeccionar jobs; `steps=[]`/runner 0 se clasifica `BLOCKED_INFRASTRUCTURE`.
- [ ] **Step 3:** Revisar compare/diff completo contra `d40a001...` y confirmar scope sólo v9/docs/tests/gates.
- [ ] **Step 4:** Crear PR DRAFT `feat(hipico): production QA and release hardening v9` base `refactor/hipico-core-v8`.
- [ ] **Step 5:** Reintentar una vez un job sin runner para distinguir bloqueo transitorio; no hacer retries infinitos.
- [ ] **Step 6:** Si todos los required gates ejecutan y pasan, marcar ready; si infraestructura no ejecuta, mantener DRAFT y documentar bloqueo.
- [ ] **Step 7:** No mergear mientras no exista PASS real del SHA final.
