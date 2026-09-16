# Control Hípico Golden Adversarial v10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un corpus v10 sanitizado y un scorer determinista que demuestre que parser, Agent y Risk Policy clasifican correctamente y nunca conceden autoridad automática a mensajes ambiguos, monetarios o hostiles.

**Architecture:** Mantener intactos corpus/scorer históricos y añadir una capa v10 independiente. El scorer usa una interfaz mínima de engine, calcula métricas/firma puras y un runner de CI produce evidencia exact-SHA offline.

**Tech Stack:** Node 22, TypeScript 5.9, tsx, node:test, crypto SHA-256, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-hipico-golden-adversarial-v10-design.md`

## Global Constraints

- Baseline: `feat/hipico-production-hardening-v9@5c285ce12ff0f62f4fc69fade57dff447015b81e`.
- No modificar `backend/src/modules/hipico-bot/corpus/hipico-parser-corpus.v1.json`.
- No cambiar firma/semántica histórica de `scoreGoldenCorpus()`.
- No authority financiera nueva; `financialAuthority=false`.
- SOURCE permanece SHADOW/read-only.
- No DB migration, endpoint o LLM obligatorio.
- TDD: cada cambio productivo nace de un contrato RED.
- Runner sin steps/logs = `BLOCKED_INFRASTRUCTURE`.

---

### Task 1: RED — contrato del corpus/scorer v10

**Files:**
- Create: `backend/src/modules/hipico/agent-adversarial-golden.test.ts`
- Create: `tests/hipico_v10_golden_contract.test.mjs`

**Interfaces:**
- Consumes: `createDefaultHipicoAgentEngine()`, Risk Policy v6 y corpus v1 existente.
- Produces: contrato de tipos, métricas y seguridad que la implementación debe satisfacer.

- [ ] **Step 1:** Crear test que importe `scoreAdversarialGoldenCorpus` y pruebe con engine fake: match completo, mismatch, `unsafeAuto`, agregados y firma determinista.
- [ ] **Step 2:** Crear root contract que exija corpus v10 sanitizado, runner exact-SHA y workflow dedicado, y que compruebe que v1 no fue sustituido.
- [ ] **Step 3:** Ejecutar tests y confirmar RED por archivos/export inexistentes. Si no hay runner, registrar `BLOCKED_INFRASTRUCTURE`.
- [ ] **Step 4:** Commit `test(hipico): define adversarial golden v10 contract`.

### Task 2: GREEN — scorer puro y schema del corpus

**Files:**
- Create: `backend/src/modules/hipico/agent-adversarial-golden.ts`
- Test: `backend/src/modules/hipico/agent-adversarial-golden.test.ts`

**Interfaces:**
- Produces: `scoreAdversarialGoldenCorpus(value, engine, options?)` y tipos de report/case.

- [ ] **Step 1:** Implementar validación estricta de envelope/cases con IDs únicos, límites de tamaño y enums conocidos.
- [ ] **Step 2:** Evaluar cada caso en `AUTOMATIC_LOW_RISK` con contexto fresco/autorizado/sano por defecto.
- [ ] **Step 3:** Comparar intent/risk/tool/disposition/canAct y calcular `unsafeAuto`, `highRiskAuto`, `byIntent`, `byCategory`.
- [ ] **Step 4:** Calcular SHA-256 canónico sobre metadata versionada + resultados normalizados.
- [ ] **Step 5:** Ejecutar unit tests GREEN.
- [ ] **Step 6:** Commit `feat(hipico): add adversarial golden scorer`.

### Task 3: Corpus v10 real + integración Agent/Policy

**Files:**
- Create: `backend/src/modules/hipico/corpus/hipico-agent-adversarial.v10.json`
- Create: `backend/src/modules/hipico/agent-adversarial-integration.test.ts`

**Interfaces:**
- Consumes: scorer Task 2 + `createDefaultHipicoAgentEngine()`.
- Produces: corpus reproducible con expected intent/risk/tool/disposition/canAct.

- [ ] **Step 1:** Añadir controles safe query y conversación normal.
- [ ] **Step 2:** Añadir monetary/correction/lifecycle/attachment/ambiguous cases.
- [ ] **Step 3:** Añadir prompt/tool/token/Authorization/PowerShell/zero-width/admin impersonation cases.
- [ ] **Step 4:** Añadir caso oversized para comprobar truncation fail-safe.
- [ ] **Step 5:** Integración exige `matched === total`, `unsafeAuto === 0`, `highRiskAuto === 0`, `financialAuthority=false` en toda decisión.
- [ ] **Step 6:** Commit `test(hipico): add sanitized adversarial corpus v10`.

### Task 4: Evidencia exact-SHA offline

**Files:**
- Create: `backend/scripts/hipico-agent-golden-v10.ts`
- Modify: `tests/hipico_v10_golden_contract.test.mjs`

**Interfaces:**
- Produces: `artifacts/qa/hipico-v10/golden-adversarial.json`.

- [ ] **Step 1:** Runner carga corpus, ejecuta engine/scorer y obtiene candidate SHA de env/git.
- [ ] **Step 2:** En CI exige SHA de 40 hex; local puede etiquetarse `local` sin convertirse en evidencia release.
- [ ] **Step 3:** Artifact incluye schema, sha, versions, signature, counts, byIntent/byCategory y status.
- [ ] **Step 4:** Exit code no cero si mismatch/unsafeAuto/highRiskAuto.
- [ ] **Step 5:** Commit `feat(hipico): emit exact-sha adversarial golden evidence`.

### Task 5: Workflow y cierre

**Files:**
- Create: `.github/workflows/hipico-golden-adversarial-v10.yml`
- Modify: `tests/hipico_v10_golden_contract.test.mjs`

**Interfaces:**
- Produces: gate exact-SHA v10 reutilizable en PR/manual.

- [ ] **Step 1:** Workflow checkout exact candidate, Node 22, `npm ci`, backend typecheck y `test:hipico`.
- [ ] **Step 2:** Ejecutar `npm --workspace backend exec -- tsx scripts/hipico-agent-golden-v10.ts` y backend build.
- [ ] **Step 3:** Ejecutar `git diff --check` contra base PR/manual de forma explícita.
- [ ] **Step 4:** Upload artifact `hipico-v10-golden-<sha>` incluso para inspección de fallo cuando exista archivo.
- [ ] **Step 5:** Crear PR DRAFT stacked sobre v9, inspeccionar diff y Actions del SHA final.
- [ ] **Step 6:** Un único rerun si jobs terminan sin runner/steps. Mantener DRAFT si sigue `BLOCKED_INFRASTRUCTURE`.
- [ ] **Step 7:** No mergear sin PASS real exact-SHA.