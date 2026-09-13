# Hípico Messaging Adapters + Windows CLI #284 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar WhatsApp/Bridge como adaptadores de canal sin lógica de negocio y entregar un CLI operativo único para Windows que reutilice el runtime existente, preserve SOURCE read-only y produzca salida JSON estable y sin secretos.

**Architecture:** Mantener `backend/src/modules/hipico-bot/**` como borde de compatibilidad/transporte y `/api/v1/hipico/*` como autoridad canónica. Introducir un contrato pequeño `MessagingChannel` en el Bridge hospedado, envolver el runtime WhatsApp existente en `WhatsAppWebAdapter` por composición y añadir `TestChannelAdapter` determinista. El CLI consumirá únicamente capacidades operacionales existentes (status/health/spool/traces/grupos) y no contendrá clasificadores, transiciones de dominio ni persistencia financiera.

**Tech Stack:** Node.js 22 ESM, whatsapp-web.js runtime existente, Express canonical backend, PowerShell 7+/CMD launchers, `node:test`, npm workspaces.

**Spec:** GitHub issue #284 + EPIC #282 + contratos Hípico vigentes en `main`.

## Global Constraints

- SOURCE permanece read-only/shadow; ningún adapter o comando CLI puede enviar a SOURCE.
- LAB es el único destino de simulación/transporte permitido por adapters de prueba.
- Ningún adapter contiene clasificador, reducer, settlement, balance mutation ni escritura financiera.
- Serverless delega al backend canónico y no vuelve a implementar dominio.
- History sync siempre queda marcado y deduplicable; nunca habilita auto-send.
- Secretos/tokens/JIDs sensibles no aparecen en `--json`, stdout ni errores normalizados.
- No interceptar tráfico, no eludir autenticación/E2E, no automatizar acciones monetarias.
- No modificar tests/workflows para fabricar verde; runner sin steps/logs = `BLOCKED_INFRASTRUCTURE`.
- No merge/deploy/firma desde este plan sin autorización explícita del propietario en el turno correspondiente.

---

### Task 1: Contrato `MessagingChannel` y adapter de prueba determinista

**Files:**
- Create: `tools/hipico-whatsapp-web-bridge/src/channels/messaging-channel.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/src/channels/test-channel-adapter.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/tests/messaging-channel.test.mjs`

**Interfaces:**
- Produces `assertMessagingChannel(channel)` para validar `connect()`, `disconnect()`, `status()`, `receive(handler)` y `send(message)`.
- Produces `TestChannelAdapter` con constructor `{ role = 'lab', events = [] }`, entrega inbound determinista y `send()` fail-closed cuando `role !== 'lab'`.

- [ ] **Step 1: escribir tests RED** para contract shape, connect/disconnect idempotentes, orden de eventos, historySync preservado, `send()` permitido sólo en LAB y cero secretos en `status()`.
- [ ] **Step 2: ejecutar** `node --test tools/hipico-whatsapp-web-bridge/tests/messaging-channel.test.mjs`; esperado antes de implementación: FAIL por módulos ausentes.
- [ ] **Step 3: implementar el contrato mínimo** sin dependencias de navegador ni dominio.
- [ ] **Step 4: re-ejecutar el test** y exigir PASS.
- [ ] **Step 5: commit** `feat(hipico): add messaging channel contract and test adapter #284`.

### Task 2: Encapsular WhatsApp Web como adapter sin mover lógica de dominio al DOM

**Files:**
- Create: `tools/hipico-whatsapp-web-bridge/src/channels/whatsapp-web-adapter.mjs`
- Modify: `tools/hipico-whatsapp-web-bridge/src/index.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/tests/whatsapp-web-adapter.test.mjs`

**Interfaces:**
- Consumes el client/runtime actual mediante inyección `{ client, normalizeInbound, sourceGroupId, labGroupId }`.
- Produces las mismas cinco operaciones del contrato; `receive()` emite envelopes normalizados sin clasificación; `send()` rechaza SOURCE por identidad pinneada y sólo acepta LAB.

- [ ] **Step 1: escribir tests RED** que prueben aislamiento de DOM/client, SOURCE send rejection, LAB send, historySync tag y que el source no contiene imports de classifier/reducer/settlement.
- [ ] **Step 2: ejecutar** `node --test tools/hipico-whatsapp-web-bridge/tests/whatsapp-web-adapter.test.mjs`; esperado FAIL.
- [ ] **Step 3: implementar wrapper por composición**, dejando selectors/session/bootstrap dentro del adapter y reutilizando helpers existentes.
- [ ] **Step 4: adaptar `src/index.mjs`** para construir el adapter sin duplicar lifecycle.
- [ ] **Step 5: ejecutar tests del Bridge** (`npm test` dentro de `tools/hipico-whatsapp-web-bridge`) y syntax checks.
- [ ] **Step 6: commit** `refactor(hipico): isolate whatsapp web transport adapter #284`.

### Task 3: Ingestion adapter-only y replay/history safety

**Files:**
- Verify/modify: `frontend/api/hipico/group-bridge-ingest.js`
- Verify/modify: `backend/src/modules/hipico-bot/hipico-bridge.routes.ts`
- Test: `tests/hipico_serverless_api_277.test.mjs`
- Create: `tests/hipico_messaging_adapter_authority_284.test.mjs`

**Interfaces:**
- Serverless sólo valida/autentica/normaliza/proxy; backend compatibility route sólo captura/transfiere hacia autoridad canónica.
- History sync se incluye en replay signature y nunca concede transport/action/business effects.

- [ ] **Step 1: escribir contrato de autoridad** que rechace classifier/reducer/domain persistence en serverless/DOM adapters y compruebe `canonical-backend.js` delegation.
- [ ] **Step 2: ejecutar contrato**; sólo modificar producción si el test demuestra drift real.
- [ ] **Step 3: añadir casos history-sync/replay** para mismo external ID con distinto `historySync`, `fromMe`, media o quote depth.
- [ ] **Step 4: ejecutar source contracts + `test:hipico`**.
- [ ] **Step 5: commit** sólo si hubo cambio real de implementación/contrato.

### Task 4: CLI operativo estable y secret-free

**Files:**
- Create: `tools/hipico-whatsapp-web-bridge/src/cli/command-parser.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/src/cli/output.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/src/cli/hipico-cli.mjs`
- Create: `tools/hipico-whatsapp-web-bridge/tests/cli-contract.test.mjs`
- Modify: `tools/hipico-whatsapp-web-bridge/package.json`

**Interfaces:**
- Commands mínimos: `status`, `doctor`, `health`, `version`, `bridge status`, `channel status`, `groups`, `messages tail`, `events tail`, `trace <correlationId>`.
- Global `--json` returns envelope `{ schemaVersion: 1, ok, command, data, error }` con claves deterministas y redacción.

- [ ] **Step 1: escribir parser/output RED** incluyendo comandos inválidos, límites de `tail`, correlationId y redacción de token/JID secreto.
- [ ] **Step 2: ejecutar test**; esperado FAIL por módulos ausentes.
- [ ] **Step 3: implementar parser y envelope** sin acceder todavía a WhatsApp.
- [ ] **Step 4: implementar handlers read-only** reutilizando status/health/spool/trace existentes mediante inyección.
- [ ] **Step 5: ejecutar contrato CLI y suite Bridge**.
- [ ] **Step 6: commit** `feat(hipico): add stable operational windows cli #284`.

### Task 5: Launcher único para Windows y separación install/start

**Files:**
- Create: `tools/hipico-whatsapp-web-bridge/HIPICO.cmd`
- Create: `tools/hipico-whatsapp-web-bridge/HIPICO.ps1`
- Modify: `tools/hipico-whatsapp-web-bridge/README.md`
- Create: `tools/hipico-whatsapp-web-bridge/tests/windows-launcher-contract.test.mjs`

**Interfaces:**
- `HIPICO.cmd` delega a PowerShell/Node sin instalar dependencias.
- `HIPICO.ps1` distingue explícitamente `install` de comandos diarios y nunca ejecuta `npm ci`/browser install al consultar status/doctor/health.

- [ ] **Step 1: escribir contrato RED** sobre quoting, cwd seguro, separación install/start y propagación de exit code.
- [ ] **Step 2: implementar launchers mínimos** y documentación Windows 10/11, PowerShell 7+/CMD.
- [ ] **Step 3: validar sintaxis/contratos** sin afirmar ejecución física Windows si no existe runner.
- [ ] **Step 4: commit** `feat(hipico): add single windows launcher for bridge cli #284`.

### Task 6: Deterministic ingestion E2E con `TestChannelAdapter`

**Files:**
- Create: `tools/hipico-whatsapp-web-bridge/tests/test-channel-e2e.test.mjs`
- Modify if required: `tools/hipico-whatsapp-web-bridge/package.json`
- Modify if required: `.github/workflows/hipico-operations.yml`

**Interfaces:**
- Feed seeded inbound envelopes through TestChannelAdapter -> normalization/proxy boundary stub -> captured canonical event.
- No external WhatsApp/browser/network required.

- [ ] **Step 1: escribir E2E RED** para source message, history replay, duplicate, media, quote y LAB send.
- [ ] **Step 2: implementar únicamente el wiring faltante**.
- [ ] **Step 3: ejecutar Bridge test suite completa**.
- [ ] **Step 4: añadir el test al gate existente sólo si aún no se descubre automáticamente**.
- [ ] **Step 5: commit** `test(hipico): add deterministic channel ingestion e2e #284`.

### Task 7: QA final exact-SHA y PR

**Files:**
- Update: `docs/hipico/**` sólo si los comandos/operación cambiaron.
- No cambios funcionales salvo fallos demostrados por la verificación.

**Interfaces:**
- Candidate SHA único para source/backend/Bridge/build/runtime evidence.

- [ ] **Step 1:** ejecutar syntax + unit/contracts del Bridge, backend typecheck/test:hipico y source contracts.
- [ ] **Step 2:** ejecutar build/runtime disponible; clasificar GitHub/Vercel blockers separados de fallos de código.
- [ ] **Step 3:** comprobar scope, secretos, SOURCE read-only y `--json` estable.
- [ ] **Step 4:** abrir PR **no draft** hacia `main`, con base/final SHA, root cause, arquitectura, pruebas, bloqueos y rollback.
- [ ] **Step 5:** no mergear hasta autorización explícita y evidencia requerida del SHA final.
