# Repo Runtime CI Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la dependencia ExcelJS/JSZip que rompió el bootstrap serverless, reconciliar lockfile/workflows con el XLSX interno ya canónico y recuperar la máxima evidencia ejecutable sin rebajar gates ni fabricar PASS.

**Architecture:** Mantener el writer XLSX interno basado en Node `zlib` como único owner de exportación XLSX. El artifact serverless seguirá externalizando sólo dependencias runtime estables y fallará el build si reaparece `exceljs`, `@excel.js/jszip` o `es-pako`. Los proveedores externos (GitHub Actions/Vercel), QA físico, soak de 24 h, governance y legal conservarán sus gates fail-closed y sólo cambiarán a PASS con evidencia real.

**Tech Stack:** Node.js 22, npm workspaces/lockfile v3, TypeScript/tsx, esbuild, Express, Playwright, GitHub Actions, Vercel.

**Spec:** `AGENTS.md` + issues #134, #97, #29, #119, #120 y evidencia runtime de Vercel para `ERR_REQUIRE_ESM` en la cadena `@excel.js/jszip -> es-pako`.

## Global Constraints

- Rama dedicada; no merge/deploy/migración/firma sin autorización explícita del owner en el mismo turno.
- PASS sólo si el comando o prueba ejecutó realmente sobre el SHA candidato.
- Preservar auth, tenant/RIF isolation, RBAC, contabilidad y seguridad; no cambiar reglas de negocio para arreglar infraestructura.
- No instalar ejecutables remotos ni usar `curl | sh`; dependencias sólo mediante npm/lockfile revisado.
- No sustituir PostgreSQL real por producción ni browser QA por inspección estática.
- No fabricar evidencia legal, física, soak de 24 h, branch protection ni proveedor externo.

---

### Task 1: Retirar el contrato obsoleto de ExcelJS

**Files:**
- Modify: `tests/toolchain_dependency_cleanup_issue_26.test.mjs`
- Modify: `backend/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `backend/src/modules/exports/xlsx-writer.ts` como implementación XLSX canónica.
- Produces: manifiesto y lockfile sin `exceljs`, `@excel.js/*` ni `es-pako` cuando esas entradas sean exclusivas del fork retirado.

- [ ] **Step 1: Escribir el contrato de regresión** que exija ausencia de `exceljs` en `backend/package.json`, `backend.dependencies` del lock y paquetes runtime `exceljs`, `@excel.js/jszip`, `es-pako`.
- [ ] **Step 2: Ejecutar el test** `node --test tests/toolchain_dependency_cleanup_issue_26.test.mjs`. Resultado esperado antes del fix: FAIL por dependencia `exceljs` aún declarada. Si la infraestructura impide ejecutar, registrar `BLOCKED`, no PASS.
- [ ] **Step 3: Eliminar la dependencia de `backend/package.json` y regenerar/prunar el lock de forma determinista**, sin tocar dependencias no relacionadas.
- [ ] **Step 4: Re-ejecutar el contrato** y confirmar cero fallos antes de continuar.

### Task 2: Normalizar el workflow de dependencias con el XLSX interno

**Files:**
- Modify: `.github/workflows/toolchain-deps-v26.yml`
- Test: `backend/src/modules/exports/xlsx-writer.test.ts`

**Interfaces:**
- Consumes: `buildXlsxWorkbook()` y `XLSX_LIMITS`.
- Produces: gate que valida el writer realmente usado por producción, no el fork retirado.

- [ ] **Step 1: Añadir/confirmar prueba de round-trip estructural del OpenXML interno**, fórmula tratada como texto y límites fail-closed.
- [ ] **Step 2: Sustituir el smoke `import ExcelJS` del workflow por `tsx --test src/modules/exports/xlsx-writer.test.ts` desde el workspace backend.**
- [ ] **Step 3: Ejecutar el test del writer y el contrato de workflow.**

### Task 3: Blindar bootstrap y artifact serverless

**Files:**
- Verify/modify if necessary: `backend/src/modules/auth/auth.captcha-bootstrap.test.ts`
- Verify/modify if necessary: `frontend/scripts/stage-backend.mjs`
- Add/modify source contract under `tests/` only if existing coverage does not assert both invariants.

**Interfaces:**
- Consumes: `createApp()` completo y bundle generado por esbuild.
- Produces: garantía de que una ruta stateless puede arrancar el grafo completo sin DB y de que el bundle no contiene la cadena XLSX retirada.

- [ ] **Step 1: Ejecutar el bootstrap test del full app** en modo production-like sin DB; debe responder CAPTCHA y mantener DB fail-closed.
- [ ] **Step 2: Ejecutar `stage-backend`/build o contrato equivalente** y verificar ausencia de `exceljs|@excel.js/jszip|es-pako`.
- [ ] **Step 3: Re-ejecutar typecheck/backend tests y revisar que auth/DB guards no se debilitaron.**

### Task 4: Normalizar gates de preview y evitar otra saturación de Vercel

**Files:**
- Modify only if needed: `vercel.json`
- Modify/add matching source contract under `tests/`.

**Interfaces:**
- Consumes: `deploymentEnabled` fail-closed y `npm ci`.
- Produces: previews únicamente para main/release/QA/candidato explícito; ramas históricas dejan de consumir cuota.

- [ ] **Step 1: Verificar que `npm ci --no-audit --no-fund` sea el install command y que `**` permanezca false.**
- [ ] **Step 2: Retirar allowlists históricas ya absorbidas por main y habilitar sólo la rama candidata si hace falta evidencia exact-SHA.**
- [ ] **Step 3: Comprobar status de Vercel del SHA candidato y, si obtiene build, inspeccionar source gates + browser + runtime.**

### Task 5: Recuperar o caracterizar GitHub Actions #134 sin bypass

**Files:**
- Verify: `.github/workflows/actions-recovery-v134.yml`
- Verify: `scripts/actions-recovery-orchestrator-v134.mjs`
- Verify: `tests/actions_recovery_issue_134.test.mjs`

**Interfaces:**
- Produces: evidencia runner-bound (`runner_id != 0`, Checkout real) o un BLOCKED administrativo explícito.

- [ ] **Step 1: Consultar runs frescos del SHA actual y comprobar jobs/steps/logs.**
- [ ] **Step 2: Reintentar sólo cuando GitHub lo permita; no marcar success por API/status.**
- [ ] **Step 3: Si sigue sin runner, conservar #134 OPEN y documentar la acción de cuenta necesaria (Actions enabled/usage/billing/budget).**

### Task 6: Ejecutar la matriz de verificación del candidato

**Files:** ninguno salvo evidencia generada por scripts existentes.

**Interfaces:**
- Produces: tabla exacta PASS/FAIL/BLOCKED/NOT_EXECUTED ligada al SHA final.

- [ ] **Step 1:** `npm ci`.
- [ ] **Step 2:** `npm run skills:check` y `npm run agent:gates -- --base main`.
- [ ] **Step 3:** `npm run typecheck`, `npm test`, writer/bootstrap contracts, `npm run build`, `npm run check:bundle`, `npm run audit:prod`.
- [ ] **Step 4:** source/visual/function gates y Chromium 58x5 reales.
- [ ] **Step 5:** PostgreSQL real y migraciones/tests; no usar DB de producción.
- [ ] **Step 6:** Android/APK sólo con toolchain/runner real y sin firma si no hay autorización explícita.

### Task 7: Mantener fail-closed los prerrequisitos no técnicos

**Files:** sólo documentación/evidence existente si necesita aclaración; no cambiar aprobaciones.

- [ ] **Step 1:** #119 sólo PASS con QA físico real y evidencia del dispositivo/proveedor.
- [ ] **Step 2:** #120 sólo PASS después de un soak ejecutado >=24 h.
- [ ] **Step 3:** #97 sólo PASS cuando GitHub aplique enforcement/protección verificable; no volver público el repo ni cambiar plan sin autorización.
- [ ] **Step 4:** #29 sólo PASS con identidad/datos legales y revisión profesional real; no completar attestations con valores inventados.

## Self-review

- Spec coverage: cubre runtime, npm/lock, source, Chromium, PostgreSQL, Android, #119, #120, #97 y #29.
- Placeholder scan: no contiene pasos TBD/TODO ni pruebas ficticias.
- Type/interface consistency: el writer canónico es `buildXlsxWorkbook`; el bootstrap usa `createApp`; la evidencia usa exclusivamente PASS/FAIL/BLOCKED/NOT_EXECUTED.
- Rollback: la rama parte de `main@42d7ed9e1919af9f0d6228af52d5d93e87be1f4b`; cualquier cambio puede revertirse por commit sin migraciones ni mutación de datos.