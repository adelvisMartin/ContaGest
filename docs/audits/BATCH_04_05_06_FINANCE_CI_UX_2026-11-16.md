# Lote 04–06 · autorización, CI y modernización medible (2026-11-16)

> **Evidencia del candidato: PARTIAL / NO_MERGE.** Esta auditoría documenta cambios reales, fronteras no tocadas y verificaciones aún obligatorias. No se cierran los 15 tickets ni se anuncian capacidades de producción inexistentes.

## Baseline y límites

- Repositorio: `adelvisMartin/ContaGest`.
- Baseline de `main` observado: `e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`.
- Rama exclusiva de este lote: `feat/04-05-06-atomic-crud-quality-20261116`.
- SHA del candidato: **consultar el HEAD de PR al validar**; cada commit invalida el estado del anterior.
- Productos: ContaGest ERP y Control Hípico comparten monorepo, **no** auth, navegación, cache, permiso de negocio ni release.
- No se realizan migraciones, cambios de fuentes fiscales, ajustes de tasa, envíos WhatsApp SOURCE, cambios de configuración Vercel ni escrituras a producción. `SOURCE_REUSE=NONE`.
- Arquitectura y skills revisadas por fuente: `AGENTS.md`, `.agents/TICKET_EXECUTION_POLICY.md`, `docs/PROJECT_START_HERE.md`, `contagest-erp-orchestrator`, `contagest-accounting-integrity`, `contagest-tenant-isolation-rbac`, `contagest-ci-triage`, `contagest-ui-audit` y `contagest-release-evidence`. **Router `node scripts/agent-ticket-router.mjs gates --base main --type audit` no ejecutado**: no existe checkout local.
- Conflictos: #637 tiene PR específico #1299; correcciones concurrentes #1298/#1301/#1303/#1305 y consolidación CI consultiva #1306; preservar sus claims y no cherry-pick sin revisión/merge serial. PR #1296 posee cambios PWA/WhatsApp LAB de otro lote y no se fusiona dentro de éste.

## Cambios implementados

### #638 · #1288 · #1289 — CRUD y auditoría con autoridad transaccional

**Defecto:** la factory tenant-scoped ya aplicaba allowlists de cinco modelos y validaba permisos, pero `create/update/delete` confirmaban la mutación **antes** de llamar a `writeAudit()`, que ignoraba fallos con `.catch(() => null)`. Una caída de AuditLog dejaba cambios persistentes sin evidencia. El alcance de esta corrección son exclusivamente `client/supplier/product/bankAccount/taxPeriod`, **no** los comandos de ledger, fiscal o nómina que pertenecen a servicios de dominio.

- `backend/src/modules/crud.factory.ts`: las tres mutaciones usan una sola `prisma.$transaction(async tx => ...)` para Prisma delegate + `writeAudit(..., tx)` y devuelven éxito sólo tras confirmar ambos efectos. Actualización/eliminación conservan filtros de identidad `{id,tenantId}`; la allowlist y `requireTenant/requirePermission` no cambian. Lecturas mantienen su recorrido previo.
- `backend/src/shared/services/audit.service.ts`: parámetro opcional `Prisma.TransactionClient`. **Si se proporciona transacción, el error de auditoría se propaga** y provoca rollback. Las otras llamadas legadas conservan su compatibilidad best-effort. Habilitar transacción no confiere permisos ni crea un ledger alternativo.
- `qa/crud-audit-atomicity-v638.test.ts`: tres negativos reales en PostgreSQL — fallo FK de AuditLog mediante usuario sintético inexistente, rollback de create/update/delete; control positivo de cliente+auditoría en una transacción. Se limpian filas y sesiones incluso al fallar. **CÓDIGO DE PRUEBA AGREGADO; PG17 AÚN NO EJECUTADO**.
- `qa/erp-operational-crud-v664.test.ts`: no acepta spoof de `tenantId`; exige exactamente un evento por create/update/delete; usuario activo sin permiso devuelve 403; tras revocar `UserSession` se exige 401 con JWT aún firmado. Se eliminó el duplicado parcial del negativo de auditoría, ahora cubierto por la suite dedicada.
- `qa/crud-factory-security-v638.spec.mjs`: revisa búsqueda cruzada de tenant sin RIF filtrado y lectura anónima denegada, además de sus anteriores negativos IDOR/mass-assignment.
- `qa/support/real-backend-harness.ts`: imports faltantes de `randomUUID/randomBytes` y salvaguarda antes de fixtures: `NODE_ENV=test`, destino PostgreSQL **loopback**, nombre real de BD con sufijo `_e2e/_drill/_restore`. Mensaje genérico sin revelar URL/secretos.
- El existente workflow `.github/workflows/e2e-commercial-v23.yml` con `postgres:17-alpine`, seed/migraciones y DB exclusiva ejecutará la nueva suite y el flujo CRUD. Se conservan todos sus demás gates y artifacts.

**Límites:** `writeAudit()` sigue best-effort para otros consumidores, sin modificar implícitamente sus reglas ni afirmar cierre de #637; no se ha verificado dos-tenant×tres-roles en todos los exports/jobs/async de #1288 ni replay/concurrencia de comandos monetarios de #1289. Estos criterios **siguen abiertos**.

### #773 · #1293 · #1294 — inventario derivado de 60 rutas

- `scripts/route-quality-baseline-v1294.mjs` deriva de `PAGE_REGISTRY` y `MODULE_VISUAL_CATALOG`, **sin crear segunda autoridad ni CSS**. Comprueba 60 rutas, coincidencia con registry, paths seguros a páginas reales, familias/riesgo y viewports 360/390/430/768/1024/1440; serializa JSON en `artifacts/qa/route-quality-v1294/<SHA>/baseline.json`.
- Cada registro incluye `sourcePage/pageExport`, prioridad y contrato browser existente, pero mantiene explícitos `refactorOwner/debt=NOT_REVIEWED`, `browserE2e/authorization/functionalJourney/performanceStatus=NOT_EXECUTED` y métricas `null`. El valor `SOURCE_PRESENT` **no significa que la UI funcione**.
- Objetivos de referencia p75 para cuando haya mediciones reales: LCP ≤2500ms, INP ≤200ms, CLS ≤0.1; no son SLA demostrados. Atribución: https://web.dev/articles/defining-core-web-vitals-thresholds.
- `tests/route_quality_inventory_v1294.test.mjs` valida presencia, deriva y rechazo de rutas duplicadas, ausentes o rutas de traversal. `.github/workflows/pr-quality-gate-v1.yml` añade el gate y artifact, fijando sólo el checkout del job estático al SHA de PR para impedir etiquetar un merge sintético con el head original.
- **No** se añadió una superficie UI clonada ni una optimización de bundle/API no medida. UX/modernización pendiente: ejecutar workflows contable e Hípico sobre datos sintéticos; comprobar estados loading/empty/error/success/disabled/permission, foco/teclado, contraste y reduced motion, dark/light, 200% zoom, métricas por ruta antes/después y LGPD/privacidad que aplique. Referencia WCAG 2.2: https://www.w3.org/TR/wcag/.

## Estado comprobado por ticket (no cierre automático)

| Ticket | Estado de este PR | Evidencia y límite |
|---|---|---|
| #638 | PARTIAL | CRUD+audit transaccional, negative PG17 añadido; typecheck/PG17 pendientes |
| #637 | OWNED_ELSEWHERE | PR #1299 mantiene autoridad del cierre contable; **no duplicado** |
| #1288 | PARTIAL | tenant spoof, lectura/listado, usuario restringido y sesión revocada; faltan matriz completa 2 tenants × 3 roles × endpoints/jobs/exports/cache |
| #1289 | PARTIAL | rollback auditable de CRUD; replay financiero, idempotencia, cierre/reversos y concurrencia sin demostrar |
| #979 | SOURCE_ALREADY_ALIGNED | main verifica Problem Details v2 y censura `password=[REDACTED]`; requiere CI exact-SHA antes de cerrar |
| #985 | SOURCE_ALREADY_ALIGNED | main OPS usa `contagest_ops_v566_drill` y guarda allowlist; falta drill PG17 exact-SHA |
| #656 | EXISTING_AUTHORITY / FOLLOW_UP | governance/lock/license source presente; clean install, auditoría advisories y cobertura SBOM sin revalidar |
| #657 | PARTIAL | eliminado test redundante del slice; sin consumer proof global para dead-code final |
| #665 | EXISTING_AUTHORITY / FOLLOW_UP | config manifest y tests presentes; runtime Docker/secret bundle aún no revalidado |
| #666 | EXISTING_AUTHORITY / FOLLOW_UP | integrity gate documental presente; sin ejecución completa ni supuestos sobre links viejos |
| #773 | PARTIAL | matriz derivada para auditar UI; no se modifica Cg*, sin browser/a11y |
| #1293 | PARTIAL | presupuesto y slots de medición; **0 mediciones** LCP/INP/CLS y PG p95 |
| #1294 | PARTIAL | 60 rutas con source owner derivado y estado de verificación; refactor funcional individual pendiente |
| #836 | FOLLOW_UP | anti-duplicación observada en este slice, aceptación de toda la expansión #835 pendiente |
| #764 | EXISTING_AUTHORITY / FOLLOW_UP | benchmark OSS/source governance con scripts existentes; licencias de terceros sin copiar; matriz completa sin recertificar |

## Evidencia, pruebas y bloqueos

**SOURCE VERIFIED:**
- 60 rutas con archivos de página en GitHub (60/60).
- cinco consumers tipados de factory, auditoría PostgreSQL con FK, runtime tenant proxy y safety guard en SQL de base efímera.
- #979/#985 ya implementaron sus correcciones en `main`, por lectura de los archivos fuente. **No significa DONE por CI**.
- no se han introducido permisos ad hoc, migraciones de producción, nuevos CSS owners ni dependencias externas.

**EJECUTADO PARCIAL (sintético, no gate):** el test de contrato de transacciones fue invocado sobre fuentes actuales en V8 con `read/assert` simulados; las tres pruebas del nuevo inventario se ejecutaron en V8 con existencia de archivo simulada. **No equiparar** a `node --test`, PG17 real, `npm ci`, build, Playwright o CI.

**LOCAL BLOCKED:** el runner disponible dispone de Node 22, `git` y `tsc`, pero **no hay checkout del repositorio** ni DNS de github.com, ni ejecutable PostgreSQL, ni Docker. `git ls-remote` falla con `Could not resolve host: github.com`. La ejecución de `npm ci`/lint/typecheck/tests/build, PG17/E2E y Playwright reales sigue `NOT_EXECUTED/BLOCKED`.

**Comandos por ejecutar sobre checkout real** (base exclusiva PG17 configurada según `.github/workflows/e2e-commercial-v23.yml`, jamás contra credenciales del usuario/producción):

```bash
npm ci --no-audit --no-fund
node scripts/agent-ticket-router.mjs gates --base main --type audit
npm run typecheck
npm run lint
npm test
npm run build
node --test tests/crud_factory_hardening_issue_638.test.mjs tests/route_quality_inventory_v1294.test.mjs
CANDIDATE_SHA="$(git rev-parse HEAD)" node scripts/route-quality-baseline-v1294.mjs --check
npm --workspace backend exec -- tsx --test ../qa/crud-audit-atomicity-v638.test.ts ../qa/erp-operational-crud-v664.test.ts
npm run qa:browser:routes:full
npm run qa:browser:routes:firefox
npm run qa:browser:routes:webkit
```

Los últimos tres comandos de navegador dependen de servidor/browser y fixture ya preparados; no basta con ejecutarlos sobre recursos no configurados. La prueba PG17 exige `NODE_ENV=test`, host loopback y sufijo efímero por contrato. Los workflows son fuente operativa para migraciones y seed; no correr migraciones en BD real.

## FODA técnico (parcial, vinculado a evidencias)

- **Fortalezas:** factory de cinco consumidores con strict fields/tenant/RBAC preexistentes; la transacción agregada une operación y AuditLog; fixtures sintéticos y control de base efímera, 60 rutas indexadas desde una autoridad.
- **Oportunidades:** extender atomicidad a owners financieros **sólo** bajo #637 con idempotencia/period lock, perf antes/después y PG17; priorizar UI densa, acciones accesibles y métricas verificables sin clonar Cg*.
- **Debilidades:** sin checkout de repo no se ejecutó suite Node, typecheck/build, PostgreSQL ni Playwright; el mapa UX tiene datos de presencia, **no** evidencia de operación; cinco modelos CRUD no equivalen a todo el ERP.
- **Amenazas:** un fallo persistente de AuditLog pasará ahora a bloquear correctamente la mutación; una matriz tenant/jobbing/exports incompleta puede ocultar BOLA/BOPLA; CI en cola y ramas concurrentes pueden dar falsa seguridad si se mezclan SHAs.

## Seguridad, performance, rollback y gate de promoción

- **Afecta transacciones**: el nuevo contrato fail-closed puede convertir una solicitud que antes daba éxito sin audit trail en un error explícito con rollback. Es deseado desde seguridad; requiere comprobar todos los 5 consumidores y los errores estables de API antes de merge.
- **Performance**: un commit por CRUD request ahora incluye escritura de auditoría; medir latencia p50/p95 y tiempos en DB antes/después, no atribuir mejora de velocidad sin datos. El inventario de vistas es read-only y sólo genera artifacts QA.
- **Privacidad**: no registrar la URL de BD ni valores de token. Las pruebas crean identidades/IDs falsos dentro de BD efímera. La revisión de secrets por patrones nunca sustituye una revisión completa.
- **Rollback**: revertir los commits de esta rama con validación exact-SHA y sin cambiar migraciones. Si se introduce actividad durante despliegue, no revertir históricamente auditable sin conciliación.
- **No merge** hasta lint/typecheck/build, PostgreSQL17 con negative+positive, tests monetarios y E2E navegadores requeridos, más diff/secret review y checks del HEAD final, todos con evidencia real. Los tests o workers en cola no son PASS.

**Clasificación de entrega:** `PARTIAL`. `main` intacto. Los tickets abiertos continúan abiertos, salvo que exista evidencia independiente verificable y autorización de su owner.
