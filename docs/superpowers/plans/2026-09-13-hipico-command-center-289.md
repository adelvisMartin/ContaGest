# Control Hípico Command Center #289 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar #289 como Command Center operacional seguro, accesible, responsive, offline-aware y con identidad de grupo resuelta server-side.

**Architecture:** El navegador envía únicamente `groupKey`; el backend resuelve internamente un `groupId` único desde el dominio de automatización y falla cerrado si no existe o es ambiguo. `command-center.service.ts` mantiene el read-model observable; frontend sólo renderiza/actualiza; `app.css` sigue siendo autoridad visual y PWA/Android comparten exactamente el mismo runtime.

**Tech Stack:** Node 22, TypeScript, Express, Prisma/PostgreSQL, vanilla ESM PWA, Playwright, Service Worker, Android WebView wrapper.

**Spec:** `docs/superpowers/specs/2026-09-13-hipico-command-center-289-design.md`

## Global Constraints

- No React/MUI ni reescritura de framework.
- Browser no recibe ni envía JID/`groupId` SOURCE.
- SOURCE permanece read-only; LAB es QA/simulación.
- Ningún componente obtiene autoridad financiera.
- `app.css` es autoridad visual; no crear hojas globales paralelas.
- Targets críticos >=44px; WCAG 2.2 AA; `system/light/dark`; reduced motion.
- Datos API/live usan `no-store`; offline previo = stale, offline sin lectura = offline.
- Android/PWA deben conservar paridad hash.
- Runner sin steps se reporta BLOCKED/NOT VERIFIED, nunca PASS.

---

### Task 1: Contrato de identidad server-side

**Files:**
- Modify: `backend/src/modules/hipico/command-center.service.test.ts`
- Modify: `backend/src/modules/hipico/command-center.service.ts`
- Modify: `backend/src/modules/hipico/command-center.routes.ts`
- Modify: `frontend/api/hipico/command-center.js`
- Modify: `tests/hipico_command_center_289_contract.test.mjs`

**Interfaces:**
- Consumes: `groupKey` validado y tablas `hipico_group_automation`.
- Produces: `resolveAgentGroupId(scope): unique | missing | ambiguous` interno; browser nunca controla `groupId`.

- [ ] Escribir tests que exijan resolución única server-side, `GROUP_ID_NOT_CONFIGURED` cuando no hay fila y `GROUP_ID_AMBIGUOUS` cuando hay más de una.
- [ ] Verificar RED contra el baseline actual.
- [ ] Implementar `agentGroupIds(scope)` como dependencia del read-model y eliminar `groupId` del contrato público de ruta/BFF.
- [ ] Hacer que `agent` sea `ready`, `not_configured` o `unavailable` según resolución, sin seleccionar arbitrariamente una identidad.
- [ ] Ejecutar unit/contract tests y confirmar que no aparece `groupId`/`@g.us` en shell/BFF público.

### Task 2: Design System y estados completos

**Files:**
- Create: `docs/hipico/design-system.md`
- Modify: `frontend/public/hipico-control/STYLE-GUIDE.md`
- Modify: `frontend/public/hipico-control/assets/js/command-center.js`
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify: `frontend/public/hipico-control/assets/css/mobile-accessibility.css`
- Modify: `tests/hipico_command_center_289_contract.test.mjs`

**Interfaces:**
- Produces: estados explícitos `loading/empty/error/success/disabled/offline/stale/unavailable/not_configured/degraded`.

- [ ] Escribir contratos para `empty`, `disabled`, stale banner, 44px y ausencia de nueva hoja global.
- [ ] Verificar RED para estados aún no representados.
- [ ] Implementar estados con texto semántico, badges y acciones accesibles; no usar color como única señal.
- [ ] Documentar tokens, tipografía, spacing, radius, shadows, icons, buttons, forms, tables, dialogs, status, cards, navigation, responsive, themes, a11y y motion.
- [ ] Ejecutar contratos y revisar que una lectura fallida nunca se convierta en cero sano.

### Task 3: Offline, Service Worker y stale explícito

**Files:**
- Modify: `frontend/public/hipico-control/sw.js`
- Modify: `frontend/public/hipico-control/assets/js/command-center.js`
- Modify: `frontend/public/hipico-control/assets/js/command-center-shell.js`
- Modify: `tests/hipico_command_center_289_contract.test.mjs`

**Interfaces:**
- API: network-only/no-store.
- Shell/assets: cacheables.

- [ ] Escribir contrato que bloquee cache de `/api/hipico/command-center` y `/api/v1/hipico/*`.
- [ ] Verificar RED si falta clasificación explícita.
- [ ] Mantener último read-model sólo en memoria; al perder red marcarlo `stale`, nunca persistirlo en cache del SW.
- [ ] Añadir estado de reconexión/refresco sin doble request concurrente.
- [ ] Ejecutar contratos.

### Task 4: Browser QA responsive/accessibility/theme

**Files:**
- Create: `qa/hipico-command-center-v289.spec.mjs`
- Modify: `package.json`
- Modify: `playwright.config.*` sólo si es imprescindible y sin afectar suites existentes.

**Interfaces:**
- Produces: `npm run test:browser:hipico:command-center`.

- [ ] Crear Playwright con fixtures sin secretos para 360/390/430/768/1440, landscape y viewport 390x500.
- [ ] Cubrir loading/error/offline/stale/empty/unavailable/not_configured/disabled/success.
- [ ] Verificar focus, teclado, 44px, ausencia de horizontal overflow, 200% zoom, themes y reduced motion.
- [ ] Añadir assertions de `aria-live`, `aria-busy` y refresh disabled offline.
- [ ] Ejecutar suite cuando el entorno lo permita.

### Task 5: PWA/Android parity y gate exact-SHA

**Files:**
- Modify: `android/hipico-control-v1130/scripts/sync-web.mjs`
- Create: `.github/workflows/hipico-command-center-v289.yml`
- Modify: `tests/hipico_command_center_289_contract.test.mjs`

**Interfaces:**
- Produces: paridad hash completa y workflow exact-SHA.

- [ ] Asegurar assets Command Center/theme en la lista Android y hash completo source/target.
- [ ] Crear gate con checkout candidate SHA, `npm ci`, contratos, backend typecheck/tests, Playwright Chromium y evidence upload.
- [ ] Añadir assertions de que el workflow conserva SHA-bound evidence y no usa caché de respuestas live.
- [ ] Ejecutar gate o clasificar infraestructura si no asigna runner.

### Task 6: Revisión final y publicación

**Files:**
- Review complete diff only.

- [ ] Comparar rama contra `integration/hipico-platform-2-green`; confirmar behind=0 y scope #289.
- [ ] Ejecutar/fetch fresh evidence de contratos, typecheck, backend tests, Playwright, SW/PWA y Android parity.
- [ ] Revisar que no haya secretos, JID expuesto, autosend SOURCE, nueva autoridad financiera ni CSS paralelo.
- [ ] Crear PR con SHA exacto, criterios, riesgos y blockers reales.
- [ ] Mergear sólo con autorización explícita y `expected_head_sha`; cualquier runner `steps=[]` queda documentado como infraestructura, no PASS.
