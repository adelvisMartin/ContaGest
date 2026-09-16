# ContaGest VE

ContaGest VE es una plataforma ERP/CRM empresarial con operación comercial, inventario, POS, fiscal, bancos, nómina, contabilidad, reportes y verticales especializadas. El monorepo incluye además **Control Hípico**, una plataforma operativa con dominio y API canónicos, mensajería desacoplada, procesamiento documental, lifecycle de carreras, outbox, automatización Agent/Shadow y superficies PWA/Android.

> Estado de release: que una capacidad exista o esté merged no implica que esté verificada en producción. La promoción exige evidencia ligada al SHA candidato y los gates aplicables.

## Productos y workspaces

```text
ContaGest VE
├── frontend/                  React 19 + Vite + MUI, PWA y verticales
├── backend/                   Node 22 + TypeScript + Express + Prisma/PostgreSQL
├── supabase/                  SQL/migraciones y políticas de datos
├── frontend/public/hipico-control/
│   └── Control Hípico PWA
├── tools/                     CLI y adapters operativos de Hípico
├── scripts/                   QA, release, seguridad y operación
├── tests/                     contratos y regresiones de repositorio
├── qa/                        pruebas de dominio/infraestructura
└── docs/                      documentación técnica y operacional
```

El repositorio usa **npm workspaces** (`frontend`, `backend`) y requiere **Node.js 22.x**.

## Arquitectura de Control Hípico

La frontera de producto debe conservarse así:

```text
CHANNEL
  ↓
ADAPTER
  ↓
NORMALIZATION
  ↓
APPLICATION
  ↓
DOMAIN
  ↓
PERSISTENCE
  ↓
EVENTS
  ↓
PROJECTIONS
  ↓
OUTPUT ADAPTERS
```

Invariantes operativos:

- `/api/v1/hipico/*` es la API canónica del producto.
- `/api/v1/hipico-bot/*` es una frontera de integración/compatibilidad; no debe convertirse en segunda autoridad de negocio.
- PostgreSQL es la autoridad persistente de servidor.
- IndexedDB se usa para capacidades offline/proyección/outbox local, con aislamiento de tenant.
- WhatsApp es un canal/adaptador, no la autoridad del dominio.
- El Agent/LLM puede proponer o asistir, pero no tiene autoridad financiera ni debe aplicar efectos económicos directos.
- SOURCE permanece read-only; pruebas de envío y simulación deben usar LAB/destinos explícitamente autorizados.

## Stack principal

- **Runtime:** Node.js 22.x.
- **Frontend:** React 19, Vite 8, MUI 9, TypeScript.
- **Backend:** TypeScript, Express 5, Prisma 6, PostgreSQL/Supabase, Zod.
- **QA browser:** Playwright 1.63.
- **Persistencia:** PostgreSQL en servidor; almacenamiento local sólo para responsabilidades explícitamente offline.
- **Entrega:** frontend preparado para Vercel y backend Node desplegable de forma independiente según el entorno.

Las versiones efectivas están fijadas en `package-lock.json` y los `package.json` de cada workspace. No instales dependencias manualmente para “hacer pasar” un gate.

## Requisitos

1. Node.js `22.x` y npm compatible con el lockfile.
2. PostgreSQL cuando el flujo a verificar requiera persistencia real.
3. Variables de entorno del frontend/backend configuradas a partir de sus ejemplos.
4. Chromium/Firefox/WebKit y dependencias de Playwright cuando se ejecute QA browser.
5. Herramientas externas sólo cuando un runbook o script del repositorio las declare.

## Instalación reproducible

Desde la raíz:

```bash
npm ci
```

`npm ci` y `package-lock.json` son la ruta canónica de instalación. No sustituir por `npm install` en CI/release salvo que se esté actualizando deliberadamente el lockfile.

## Variables de entorno

Crea archivos locales a partir de los ejemplos versionados:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

En Windows PowerShell:

```powershell
Copy-Item frontend/.env.example frontend/.env
Copy-Item backend/.env.example backend/.env
```

No se publican credenciales por defecto en este README. Los secretos, tokens, JIDs, claves de servicio y credenciales reales deben permanecer fuera del repositorio y de los artifacts/logs. Usa los procedimientos de seed/desarrollo y los `.env.example` vigentes del repositorio.

## Ejecución local

Frontend:

```bash
npm run dev:frontend
```

Backend:

```bash
npm run dev:backend
```

El frontend de desarrollo usa el puerto `8080`. La configuración efectiva del backend y de sus integraciones depende de las variables de entorno del workspace.

Para preparar datos de desarrollo utiliza únicamente los scripts de seed versionados:

```bash
npm run seed
```

## Gates de ingeniería

Comandos raíz relevantes:

```bash
npm run typecheck
npm run lint
npm run build
npm run ci
npm run audit:prod
npm run skills:check
```

`npm run ci` ejecuta los gates definidos por el propio repositorio; no debe interpretarse como evidencia de producción si no se ejecutó sobre el SHA candidato y en el entorno requerido.

### Control Hípico

```bash
npm run test:hipico
npm run qa:hipico
npm run qa:hipico:visual
npm run test:hipico:exact-sha
npm run release:hipico:v290
npm run verify:hipico:evidence:v290
npm run report:hipico:v290
```

El release guard Hípico falla cerrado cuando el SHA candidato no coincide con el `HEAD` checkout y valida, entre otros contratos, frontera canónica, aislamiento operacional, TestChannel, cadena PostgreSQL, ausencia de bypasses prohibidos y artifacts de evidencia.

### UX/UI y accesibilidad

```bash
npm run qa:ui
npm run qa:ui:deep
npm run qa:ui:58
npm run qa:a11y
```

Los cambios visuales deben comprobar estados `loading/empty/error/success/offline/stale/permission/unavailable/not_configured/degraded`, teclado/foco, responsive, zoom y reduced motion cuando correspondan al cambio.

## PostgreSQL y datos

Los tests que prueban persistencia, concurrencia, RLS, aislamiento o efectos financieros deben usar PostgreSQL real, aislado y desechable. No uses una base compartida de desarrollo o producción para E2E.

El backend dispone de scripts Prisma/DB específicos; revisa `backend/package.json` y los runbooks antes de migrar, resetear o sembrar una base.

## WhatsApp, Bridge y CLI

La mensajería Hípico se diseña como adapter hacia el dominio canónico. Antes de promover cualquier automatización de salida deben verificarse, como mínimo:

- identidad/destino explícitos y allowlist;
- SOURCE read-only y LAB controlado;
- normalización + dedupe + replay;
- outbox e idempotencia;
- history sync sin auto-send;
- recuperación ante restart/reconnect;
- redacción de secretos/PII;
- promoción Agent basada en evidencia, no en intuición.

La CLI raíz se expone mediante:

```bash
npm run hipico -- --help
```

## Agent / Shadow

La progresión prevista es deliberadamente conservadora:

```text
DISABLED → SHADOW → ASSISTED → AUTOMATIC_LOW_RISK → AUTOMATIC
```

La promoción debe ser adjacent-only, aprobada del lado servidor y sustentada por métricas/corpus. Las capacidades automáticas no deben ejecutar SQL, shell, settlement, cambios de ledger ni otros efectos financieros.

## PWA y Android

Las superficies PWA/Android forman parte del producto y requieren paridad de identidad/build y QA específico. La evidencia física (dispositivos, background, reboot, permisos, instalación y WhatsApp real) se clasifica separadamente de los tests de código y no puede ser simulada como PASS.

## Seguridad

Principios obligatorios:

- auth + RBAC + tenant context en cada frontera que lo requiera;
- IDOR/aislamiento A→B y B→A en recursos multi-tenant;
- validación de entrada y límites de recursos;
- idempotencia y audit cuando existan efectos persistentes;
- secretos fuera de frontend, logs y artifacts;
- inputs hostiles fail-closed (PDF/MIME/SSRF/prompt/tool injection);
- dependencias bloqueadas por lockfile y revisión de supply chain.

Consulta el índice técnico en [`docs/README.md`](docs/README.md).

## Release y evidencia exact-SHA

Una release no se considera demostrada porque un PR esté merged. Debe poder relacionar el mismo SHA con los gates aplicables: CI, DB, browser, runtime/deployment y artifacts.

Para Hípico, la ruta versionada de evidencia está documentada en [`docs/RELEASE_EVIDENCE.md`](docs/RELEASE_EVIDENCE.md) y respaldada por los scripts `hipico-release-guard-v290.mjs`, `hipico-verify-evidence-v290.mjs` y `hipico-release-report-v290.mjs`.

Estados válidos al reportar evidencia:

- `PASS`: ejecutado y aprobado para el SHA indicado.
- `FAIL`: ejecutado y falló por una causa demostrada.
- `BLOCKED`: no pudo ejecutarse por un bloqueo identificado.
- `NOT_EXECUTED`: no se ejecutó; nunca equivale a PASS.

## GitHub Actions y protección de `main`

El repositorio contiene tooling específico para diagnosticar recuperación de Actions (`#134`) y para comprobar/aplicar protección de `main` (`#97`). No se deben crear workflows de prueba redundantes ni activar required checks inestables que puedan bloquear `main` sin una ruta de recuperación.

Herramientas relevantes:

```text
.github/workflows/actions-recovery-v134.yml
.github/workflows/ci-runner-probe-v134.yml
scripts/github-actions-diagnostics-v134.mjs
scripts/github-main-protection-v97.mjs
scripts/apply-main-protection-v97.ps1
```

La protección debe verificarse en GitHub después de aplicarla; la existencia de un script no demuestra que la configuración remota esté activa.

## Agents y skills

Las reglas de trabajo del repositorio están en [`AGENTS.md`](AGENTS.md). Las skills versionadas viven en `.agents/skills/` y su integridad se comprueba con:

```bash
npm run skills:check
```

No añadas skills o agentes como decoración: cada uno debe tener autoridad, invariantes, acciones prohibidas, tests y evidencia acordes a su riesgo.

## Documentación

El índice maestro está en [`docs/README.md`](docs/README.md). Debe actualizarse junto con cambios de arquitectura, seguridad, QA, operaciones o release para evitar que el código y la operación vuelvan a divergir.

## Contribución

Antes de editar:

1. lee `AGENTS.md`, el ticket y sus criterios de aceptación;
2. confirma branch/HEAD y arquitectura afectada;
3. caracteriza el comportamiento actual;
4. aplica el cambio mínimo correcto;
5. ejecuta gates proporcionales al riesgo;
6. revisa el diff y secretos;
7. publica evidencia exact-SHA;
8. separa bloqueos externos de defectos de código.

No uses `skip/only`, sleeps arbitrarios, `force`, `continue-on-error` ni cambios artificiales para fabricar verde.