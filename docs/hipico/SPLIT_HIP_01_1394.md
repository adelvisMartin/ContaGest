# SPLIT-HIP-01 — preparación de extracción (#1394)

Estado: PARTIAL / BLOCK_MAIN. Baseline: `93f5e4bac88f05c2a89e04df9f1d2d35a32e4489`; árbol `9ee8587876b4b66dc045902684a1a814b93baf04`. Repositorio destino propuesto `adelvisMartin/control-hipico`: GitHub devuelve 404; no se ha creado ni se ha probado visibilidad privada. No se ha modificado BD, conexión, código runtime, jobs ni despliegue. #1391 sigue como owner de pendientes; sección K es Hípico, secciones A/L/M incluyen dependencias compartidas que no se deben perder. PR #1396 estaba abierto para el scanner de archivos de #1391; reconciliar su SHA y dependencia antes de extraer.

## Inventario fuente

Árbol GitHub recursivo no truncado: 3888 entradas, 3473 blobs. Conteos de directorios (no son una allowlist):

| Superficie | Archivos observados | Autoridad/contrato |
|---|---:|---|
| frontend/public/hipico-control/ | 94 | /hipico-control/, manifest scope ./, SW/IndexedDB/caché propios |
| backend/src/modules/hipico/ | 105 | dominio, documentos, carreras, agente, reportes |
| backend/src/modules/hipico-bot/ | 152 | compatibilidad, bridge, webhook, operador, outbox, ledger, LAB |
| android/hipico-control-v1130/ | 11 | sync-web.mjs consume PWA y products/hipico-control/release-policy.json; APK local, NO Play Store |
| products/hipico-control/ | 6 | políticas de release, soak y QA físico |
| supabase/sql/hipico_*.sql | 27 | referencias de schema; no ejecutar DDL en producción |

Además: tools/hipico-cli, tools/hipico-whatsapp-bridge, tools/hipico-whatsapp-web-bridge; scripts y comandos HIPICO*.cmd/.ps1; tests/hipico*, qa y ops; workflows hipico-*; migraciones backend/prisma/migrations y schema.prisma compartido. Los nombres son pistas, no aprobación. La clasificación por contenido encuentra referencias que no aparecen en el nombre; no resuelve importaciones transitivas, alias, dependencias dinámicas ni consumidores externos. Requiere inspección manual de cierre.

## Dependencias cruzadas y escritores

- backend/src/app.ts: monta /api/v1/hipico/system (L89), /api/v1/hipico-bot (L94–101), /api/v1/hipico/documents y /report-shares (L105–106), /api/v1/hipico (L111–121). Mantener rate limit, CSRF, parsers, auth/errores, orden de montaje y namespace legado.
- backend/src/server.ts L4,18,21: inicia y detiene startCanonicalOutboundRunner. hipico-outbound-runner.ts usa HIPICO_OUTBOX_WORKER_ENABLED, readiness, owner, policy, transport, dispatch y observeJob compartido. No iniciar un segundo runner. El guard actual por proceso no demuestra exclusión entre despliegues.
- hipico-bridge-document.routes.ts depende de DocumentIngestionService y PostgresDocumentStore del otro módulo; preservar gate antimalware de #1391 M, revisar PR concurrente. report-share.routes.ts depende de operador de hipico-bot; mantener tokens, redacción y owner/grupo.
- Compartidos a revisar: backend/src/shared, config/env.ts y dbRuntimeGuard.ts, database, Prisma/lockfile, middleware, observabilidad, contratos API, Vercel/API ingress, generación de runtime-config y build-info. No copiar el backend ERP entero ni otorgar roles ERP a Hípico.
- vercel.json conserva redirect 308 /control-hipico → /hipico-control/, CSP/scope dedicado y /api/v1. No copiar indiscriminadamente config de deploy, workflows con schedule/dispatch, perfiles WhatsApp, sesión, credenciales, dumps o material privado. SOURCE autolectura/autoenvío permanece NO_GO; LAB sintético únicamente.

## Herramienta local

`node scripts/hipico-split-inventory-v1394.mjs inventory SHA > /ruta/privada/inventory.json`

Lee objetos Git del commit exacto, no el árbol de trabajo, y emite rutas, modo, tipo, OID y clasificación de revisión; sin leer BD ni publicar. El inventario debe permanecer local. Tras revisión archivo por archivo, crear JSON de aprobación con sourceSha y files (cada elemento path, oid y reason no vacío, tomados del inventario). Ninguna categoría se autoriza automáticamente, incluido unclassified. Rechaza paths bloqueados y symlinks/submodules; el filtro de nombres no garantiza ausencia de secretos. Para stage, usar directorio nuevo bajo un padre existente, fuera del checkout.

`node scripts/hipico-split-inventory-v1394.mjs stage SHA /ruta/privada/approval.json /ruta/privada/stage-nuevo`

Copia sólo blobs aprobados y genera split-provenance.json con SHA origen y OID por archivo. No hace push, commit, deploy, start ni rewrite de historial. Preserva procedencia del snapshot, no historial de commits. No ejecutar el stage en un directorio compartido o público. Revisar cierre de dependencias, licencias, Git LFS, datos personales, fixtures y secretos en contenido, ejecutar scanner aprobado; revisar también todo historial si se opta por filtrarlo. No subir monorepo completo ni objetos Git originales al destino. Sólo publicar después de confirmar owner, privacidad y permisos del repositorio destino y revisión completa del contenido. Esta entrega no incluye allowlist aprobada, stage real ni repositorio destino.

## Matriz de paridad y gate de aprobación

| Requisito | Prueba/evidencia requerida | Estado |
|---|---|---|
| Inventario exacto, exclusiones, provenance | node --test tests/hipico_split_inventory_v1394.test.mjs; tree GitHub; inventario completo en checkout | VERIFIED parcial: árbol y 3 tests sintéticos; inventario completo pendiente |
| Dependencias, API y rutas | npm run test:hipico, npm run test:contracts:current; comparar endpoints/status/shape/guards y consumidores por SHA | NOT VERIFIED |
| Aislamiento y auth | workflow hipico-domain-snapshot-pg17.yml; A→A, A→B/B→A, sin auth, roles, group scope, report token, RLS, sesión/caché PWA; permisos mínimos hipico_backup | NOT VERIFIED |
| Ledger/conciliación | PG17 sintético: fixtures por run/grupo/owner; comparar eventos, saldo, ledger, outbox, duplicados, reintentos y cierres; test:hipico + integraciones reales | NOT VERIFIED |
| ERP regresión | npm ci, npm run lint, npm run typecheck, npm test, npm run build, Chromium gate y matriz existente; conservar baseline 207 cuando aplique | NOT VERIFIED |
| PWA/APK | qa:hipico, matriz Chromium/Firefox/WebKit, sync-web y QA físico #119; scope, offline, reconexión, actualización | NOT VERIFIED |
| Backup/restore | npm run test:hipico:backup-preflight; restaurar copia aislada PG17, reconciliar tablas/roles/control totals, RPO/RTO y limpieza | NOT VERIFIED |
| Jobs y escritor único | inventario efectivo de cron, workers, bridge, deploy y credenciales; demostrar cero jobs/escrituras duplicadas; replay y handoff | NOT VERIFIED |
| Destino privado, extracción, revisión de secretos | repo privado confirmado, árbol revisado, escaneo y provenance, build/CI propio | BLOCKED |
| Cutover | aprobación expresa del owner tras QA, no deploy previo | BLOCKED |

Pruebas locales realizadas con Node 22.16.0 y Git 2.47.3 sobre repositorios efímeros sintéticos: node --check del script y node --test de los tres casos (3/3). No equivalen a ejecución de ContaGest ni de la BD. El checkout del repositorio real está bloqueado por DNS de GitHub; router, npm ci, lint, typecheck, build, PG17, E2E y backup real no ejecutados localmente. CI remoto se comprueba por SHA del PR; no heredar verdes anteriores.

## Staging, cutover y rollback (propuesto, no ejecutado)

1. Mantener ContaGest original como único escritor productivo por flujo. El destino no recibe variables de producción; migradores, timers, outbox, bridge, cron y SOURCE desactivados. No cambiar schema ni conexión de producción. Staging usa PG17 independiente, datos sintéticos, credenciales de prueba y salida a proveedores bloqueada.
2. Inventariar autoridades reales de schema/tablas/roles/RLS/owner, permisos y storage en copia; congelar compatibilidad de API y versión de schema durante ensayo. Verificar escrituras por flujo (jornada, ledger, documentos, outbox, reportes, import y sync) en una sola instancia con fixture y auditoría. Comparar ambos productos en corridas separadas sobre copias equivalentes, no doble escritura ni lectura de producción desde QA.
3. Probar restauración aislada y rollback con totales/constraints/identidades, fijar RPO/RTO y criterio de parada. Antes de cualquier cutover, aprobación explícita, ventana de mantenimiento, backup probado, inventario de jobs y punto de reconciliación. No retirar origen.
4. Si se aprueba después, detener y verificar drenaje de writers/jobs antiguos antes de habilitar los nuevos; conservar ruta/contratos y controlar divergencia. Si falla auth, conciliación, outbox o paridad: detener nuevo escritor, verificar cero procesos activos y reconciliar efectos antes de volver al escritor anterior. No restaurar sobre producción ni borrar datos para revertir. No activar SOURCE ni Play Store.

## Gobernanza y riesgos

Lectura de AGENTS, onboarding/auditoría, ADR de límites, reglas Hípico, TICKET_EXECUTION_POLICY, Agent System v3, SIC, orquestador, release evidence, tenant RBAC, BCP/DR y perfiles integration-contracts, dbre, qa-release, hipico-reliability. Revisión por perfiles, no agentes autónomos ejecutados. Router exacto pendiente por falta de checkout. Riesgos altos: importaciones transitivas, permisos de DB compartida, secretos históricos, doble escritor, SW/API incompatibles, y scanner de archivos concurrente. No fusionar ni cerrar #1394/#1391 hasta satisfacer los gates.
