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

## Iteración II — seguridad de evidencia exact-SHA, alias PostgreSQL y rollback auditable

**Fecha:** 2026-11-16 · **PR:** #1310, único PR del lote 04–06. **HEAD de implementación verificado en fuente:** `6e102080a934a40e3236ccd896f447d4855a13fe` antes de este commit documental; los checks posteriores requieren el nuevo SHA completo. No hay autorización de merge.

### Hallazgos adicionales y causa raíz

1. **False positive en regresiones PostgreSQL:** `qa/crud-audit-atomicity-v638.test.ts` rechazaba *cualquier* error dentro de un `assert.rejects()`. Ahora verifica que la mutación llegó a `writeAudit()`, que la excepción tiene código Prisma `P2003` o PostgreSQL `23503`, y que el estado antes/después confirma rollback; además prueba que la falta de `tenantId` en auditoría transaccional revierte CREATE. Un fallo de conexión, fixture o query previa ya no podrá recibir PASS sólo por lanzar una excepción.
2. **Ausencia de tenant durante audit con transacción:** `writeAudit(input,tx)` devolvía `null` si faltaba `tenantId`, incluso con `tx`, permitiendo confirmar un cambio sin provenance si un caller futuro relajaba el contexto. Ahora lanza `AUDIT_TRANSACTION_TENANT_REQUIRED` cuando hay `tx`; los callers históricos sin `tx` conservan exactamente su comportamiento original. No hay migraciones ni cambios de permisos.
3. **Fuga de sesiones QA en setup:** el harness insertaba una fila `UserSession` antes de firmar el token. Si fallaba `signAccessToken()`, no se ejecutaba la limpieza. La creación de token ahora está protegida por `try/catch` con limpieza de sesiones antes de relanzar. El hook `t.after` sigue limpiando las identidades propias al finalizar.
4. **Base QA aparente vs efectiva:** `backend/src/database/prisma.ts` prefiere `DATABASE_RUNTIME_URL` a `DATABASE_URL`, y herramientas de migración usan `DIRECT_DATABASE_URL`. Un preflight que sólo miraba la segunda podía autorizar una conexión efectiva remota o distinta. Se extrajo `qa/support/disposable-database-guard-v1288.mjs`, sin dependencias, que exige `NODE_ENV=test`, no Vercel, URLs PostgreSQL exclusivamente loopback, mismo host/puerto/nombre para todos los alias definidos, sufijo `_e2e/_drill/_restore`; después el harness contrasta `SELECT current_database()` con ese nombre *antes* de crear cualquier sesión/fixture. La excepción no divulga credenciales. Regresiones en `tests/qa_disposable_database_guard_v1288.test.mjs` ejecutadas obligatoriamente desde `scripts/run-authoritative-contracts.mjs`.
5. **Evidencia CI atribuida incorrectamente:** `pr-quality-gate-v1.yml` etiquetaba artefactos con `CANDIDATE_SHA` del PR pero PostgreSQL, browser y seguridad podían correr sobre el merge sintético de `pull_request`. Sus **cuatro** jobs ahora hacen checkout explícito al `CANDIDATE_SHA` y comprueban `git rev-parse HEAD` antes de ejecutar pasos. El workflow existente `e2e-commercial-v23.yml` también usa ese HEAD, verifica checkout y adjunta `e2e-commercial-v23-provenance.txt` al artifact con run/attempt/estado. No se agregó ningún skip ni relajación de tests.
6. **Gate de matriz de 60 rutas:** se detectó que `scripts/route-quality-baseline-v1294.mjs` rechazaba el `--check` requerido por CI. Se corrigió con `assertRouteQualityCliArgs` (sólo sin args o exactamente `--check`) y prueba explícita de argumentos inválidos. Una revisión de la rama detectó que un cambio concurrente había revertido la corrección; se restauró y volvió a comprobar en el HEAD de código. Vigilar cualquier nuevo cambio paralelo por SHA.

### Validaciones ejecutadas (sin atribuir resultados ajenos)

- **VERIFIED Node 22 real / 4 PASS, 0 FAIL:** `node --test` ejecutó exactamente las fuentes de `qa/support/disposable-database-guard-v1288.mjs` y `tests/qa_disposable_database_guard_v1288.test.mjs` en una carpeta aislada, **sin** acceso a BD. Se verificó igualdad byte a byte por hash Git blob: guard `57b3c4b6b677fa2891885f248c68776517fffc69`, test `4d424fbbebaad34c28074e22ad1bf716c1d1979a`, coincidentes con GitHub para el HEAD del candidato. Casos: alias local positivo, runtime/migration con host/puerto/nombre divergente, entornos/DB no efímeros, mensajes sin secretos. Es un test de fuente real en aislamiento, **no una suite completa de repo**.
- **EJECUTADO sintético V8 / 7 PASS, 0 FAIL:** callbacks de contrato `tests/crud_factory_hardening_issue_638.test.mjs` (auditoría transaccional, guard QA y pin de CI) y `tests/route_quality_inventory_v1294.test.mjs` (60 rutas, métricas sin inventar, drift y CLI) evaluados sobre fuente obtenida del SHA `6e102080...` con sustitutos en memoria de `read` y `fs.existsSync`. **No equivale** a `node --test` del repositorio.
- **EJECUTADO sintético V8, 5 PASS en SHA anterior de código:** `writeAudit` extraído de fuente real con sustitutos de Prisma demostró: caller legacy sin tenant devuelve null; transacción sin tenant lanza; caller legacy conserva best-effort ante fallo; transacción propaga error de inserción; escritura válida usa delegate del `tx`. No acredita generación Prisma ni PostgreSQL real.
- **SOURCE VERIFIED:** se comprobó que el modelo `AuditLog.userId` tiene FK a `UserProfile`, y que `tenant-prisma-proxy` liga runtime tenant al contexto de transacción. Estas relaciones justifican la prueba negativa; **no son prueba ejecutada de migraciones/RLS**.
- **LOCAL BLOCKED:** `git ls-remote https://github.com/adelvisMartin/ContaGest.git HEAD` continúa fallando `Could not resolve host: github.com`; sin checkout completo, `npm ci`, TypeScript/build, PostgreSQL17 real, Playwright Chromium/Firefox/WebKit, Windows/Android, 60 rutas en runtime y LCP/INP/CLS no ejecutados.
- **REMOTE_CI:** consultar estados del **SHA final después de este commit**. Runs previos del PR #1310 estaban `queued/pending/skipped`; ningún PASS heredado. El gate comercial PG17 y Quality Gate son los certificados faltantes.

### Riesgos, reversibilidad y follow-ups

- El timeout y coste de la transacción CRUD, la composición de eventos de auditoría, errores HTTP de FK en API y concurrencia multi-tenant siguen sin latencia ni prueba real PG17.
- `writeAudit` permanece best-effort para clientes de dominio no migrados; sus garantías no se reclaman en este PR.
- Validaciones del inventario UX no implican que las 60 vistas se hayan abierto o refactorizado. No se clonaron assets ni sistema Cg*. #637 tiene PR #1299 y no se ha duplicado.
- Rollback por revertir commits propios y revalidar HEAD; no se revierten contabilidades ni se ejecutan migraciones.
- **Entrega: PARTIAL / BLOCKED CI / NO MERGE**. La corrección aumenta la calidad del candidato, pero todavía no satisface todos los DoD de los 15 issues.

## Iteración III — integridad HTTP del rastro de auditoría y nombres de BD efímera

**Contexto de ejecución (2026-11-16):** PR #1310, rama `feat/04-05-06-atomic-crud-quality-20261116`. Baseline de `main`: `e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`. Concurrencia y SHA del PR deben verificarse después de cada nuevo commit.

### Nueva revisión FODA, causa raíz y modificación mínima

- **Amenaza — pruebas de integridad insuficientes:** `qa/erp-operational-crud-v664.test.ts` comprobaba número de eventos create/update/delete pero no `userId`, `tenantId` ni la exactitud de `before/after`. Un rastro mal atribuido podría pasar. **Solución:** aserciones sobre identidad del actor firmado, tenant real, entidad persistida, estado anterior y posterior en create/update/delete, preservando el flujo HTTP real y sin nuevos endpoints. Se añade negativa PUT con `tenantId` falsificado que debe devolver 422, no modificar nombre ni crear audit adicional. Para POST sin permiso se usa RIF sintético único por ejecución y se comprueba que el conteo de filas sea cero.
- **Amenaza — nombre efímero ambiguo:** el preflight `assertQaDisposableDatabaseConfig` reconocía cualquier cadena terminada en `_e2e`, `_drill` o `_restore`, incluso `shared%2Fother_e2e` tras decodificar (separadores o caracteres de control). **Solución:** aceptar sólo identificadores `[A-Za-z0-9_]` con sufijo efímero explícito, manteniendo los nombres legítimos `contagest_e2e` y `harness_drill`. Se añaden negativos de slash, backslash, NUL, newline y puntos codificados.
- **Fortaleza:** ninguna mutación de negocio adicional, migración de SQL, permiso nuevo, dependencia externa, modificación de Control Hípico o CSS.
- **Debilidad residual:** la nueva prueba de audit provenance aún necesita ejecución con PostgreSQL real/Express/Prisma y datos aislados. La comparación de URL, nombre y host loopback por sí sola **no demuestra** que un túnel local no apunte a otro clúster: el aprovisionamiento del CI debe garantizar que la base sea realmente efímera.
- **Oportunidad (fuera de alcance):** medir la latencia de inserción AuditLog y rechazos de permisos antes de cualquier refactor del servicio o separación de dominios.

### Evidencia de la iteración

1. **VERIFIED, Node 22 nativo:** ejecución `node --test tests/qa_disposable_database_guard_v1288.test.mjs` sobre dos archivos exactos, aislados del repositorio completo. **4/4 PASS; 0 FAIL.** Antes de ejecutarlos, `git hash-object` local coincidió byte a byte con GitHub: guard `e63689e011a335aa818f21db3258b0b47bdf89dd`, test `2c5b57208844fb492e826353419a927011f79980`. Prueba el parser y rechazo de alias/nombres de BD, **no** un PostgreSQL conectado.
2. **SOURCE SYNTHETIC, V8:** **7/7 callbacks** de contratos de atomicidad, harness, pin de HEAD del CI y 60 rutas sobre código real del HEAD `2ca5a2cf6d9a4cf4e58bafda0d4aa30952eff65e` con lectura y filesystem simulados. No equivale a `node --test` del repo, `tsc` o Browser E2E.
3. **LOCAL BLOCKED:** falta checkout de repositorio y no hay Docker/PostgreSQL ni Playwright. No se ejecutaron `npm ci`, lint, typecheck, build ni integración HTTP real.
4. **REMOTE CI:** al inicio de esta iteración, para `6116218a4bfd67bbf141cdd42afa41fbbc245efa` había 43 checks: 36 `queued`, 7 `skipped`, ningún PASS/FAIL material. Los runs no pertenecen al nuevo SHA; no deben usarse como veredicto. Se consultaron los tags reales `v7` de `actions/checkout`, `actions/setup-node` y `actions/upload-artifact`; todos existen, **por lo que no se atribuye el bloqueo de runners a esos tags**.

**Criterio de salida:** un solo PR en borrador, sin merge y sin cerrar #638/#1288/#1289/#773/#1293/#1294 ni el resto del lote hasta demostrar Postgres17 real, suite exact-SHA, E2E Chromium/Firefox/WebKit, métricas y regresiones de seguridad.
