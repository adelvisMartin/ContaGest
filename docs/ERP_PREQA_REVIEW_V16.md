# ContaGest VE — ERP Pre-QA Review v16

## Objetivo y regla de evidencia

Esta revisión prepara el ERP para la ronda de QA posterior al merge. La rama auditada es `feat/erp-preqa-polish-v16`, creada desde `main` `1b36c6e19ba0d6f78e7813ed5f2e87281542114f`.

La palabra **PASS** se reserva para una prueba realmente ejecutada con evidencia. La inspección de código se etiqueta `SOURCE_REVIEW`; las pruebas estáticas automatizadas se etiquetan `STATIC_CONTRACT`; un gate que todavía no se ejecutó se conserva como `NOT_EXECUTED`. Esta revisión no convierte una heurística de Pretesting, un tier del catálogo ni un deploy exitoso en QA funcional.

El runtime registra **58 rutas únicas** en `frontend/src/app.js`: 57 módulos del `MODULE_CATALOG` más la ruta de autenticación `login`, que deliberadamente no es un módulo licenciable. El test `erp_preqa_v16_contract.test.mjs` bloquea omisiones, duplicados o deriva entre ambos registros.

El orden contractual del ticket es: **source review → corrección/polish → contratos automatizados → PR → merge autorizado por el propietario → QA runtime/browser sobre el SHA desplegado**.

## Subtareas cerradas en v16

1. **Normativa:** migrada a primitives canónicas, sin tipografía/color hardcoded de la generación anterior; se mantiene explícito que la fuente oficial prevalece.
2. **Auditoría:** migrada a primitives canónicas; la bitácora local y sus índices quedan identificados como preflight interno, no como `AuditLog` server-side ni evidencia QA.
3. **RRHH:** migrado a `PageHeader`, `MetricGrid`, `ErpSection`, `ErpDataTable` y `ErpGrid`; exportaciones conservadas.
4. **Gym:** eliminado `style="grid-column:1/-1"`; se usa el contrato compartido `.cg-gym-wide` ya definido en `module-adapters.css`.
5. **Pretesting / Madurez:** los scores y tiers ahora indican explícitamente que son heurísticos/catalogados y **NO QA PASS**; gates no ejecutados = `NOT_EXECUTED`.
6. **Libro de Ventas:** eliminada cualquier reconstrucción de base/IVA con alícuota 16 %. Base, IVA y total deben existir explícitamente; si faltan, exportación fiscal se bloquea.
7. **Hoja de Trabajo:** ajustes etiquetados `NO POSTEADO` y `unposted_working_paper`; no crean `LedgerEntry` ni se presentan como asiento contabilizado.
8. **Plan de Cuentas:** creación/sincronización se ejecuta contra `/chart-accounts`, tenant-scoped y con permisos `accounting.view/accounting.post`; se eliminó la creación ficticia sólo en Store.
9. **Cierre Contable:** bootstrap de períodos deduplicado mediante una promesa única y `periodsLoaded` sólo se marca tras respuesta backend exitosa.
10. **Gate pre-QA:** `ci.yml` ejecuta tests + auditoría visual estricta + auditoría funcional de source sobre las 58 rutas antes de build/audit de dependencias.

## Hallazgos funcionales endurecidos durante v16

- Cierre contable persistente: el backend bloquea nuevos asientos de un período cerrado.
- Nómina con máquina de estados forward-only; `paid` y `cancelled` son terminales.
- No existe hard-delete de movimientos bancarios desde la UI; la corrección financiera deberá usar un flujo formal de reverso.
- Eliminaciones sensibles de histórico/proveedores/recibos requieren confirmación donde corresponde.
- Importación masiva continúa en **preview only** hasta implementar commit transaccional real.
- Kardex permite seleccionar producto; ya no se limita silenciosamente al primer SKU.
- QR fiscal no fabrica factura/hash de demostración.
- Scanner registra evidencia de conteo físico y no finge mutar stock.
- Cotizador fue migrado al sistema visual canónico y su acción principal de guardar cambios es un submit real.
- Modales usan un único contrato responsive/accesible.

## Matriz 58/58

`SOURCE_REVIEW` significa que la ruta forma parte del registro inspeccionado y de los auditores automatizados de source. `HARDENED_V16` identifica cambios específicos de esta rama. `QA_POST_MERGE` significa que la interacción real en navegador/dispositivo/API debe ejecutarse después del merge, por diseño del ticket.

| # | Ruta | Área | Pre-QA v16 | Gate siguiente |
|---:|---|---|---|---|
| 1 | `dashboard` | Inicio | SOURCE_REVIEW · KPI/shell bajo sistema visual canónico | QA_POST_MERGE |
| 2 | `mobile` | Inicio | SOURCE_REVIEW · contrato responsive/shell | QA_POST_MERGE |
| 3 | `login` | Runtime/Auth | SOURCE_REVIEW · ruta runtime pública, fuera del catálogo licenciable | QA_POST_MERGE |
| 4 | `ventas` | Ventas | SOURCE_REVIEW · flujo financiero protegido por backend | QA_POST_MERGE |
| 5 | `cotizacion` | Ventas | HARDENED_V16 · UI canónica + submit real | QA_POST_MERGE |
| 6 | `clientes` | Ventas | SOURCE_REVIEW · sync/RIF/confirmación destructiva | QA_POST_MERGE |
| 7 | `historial` | Ventas | HARDENED_V16 · confirmación de eliminación | QA_POST_MERGE |
| 8 | `pos-sede` | Operaciones | SOURCE_REVIEW · incluido en auditoría funcional/visual | QA_POST_MERGE |
| 9 | `pedidos` | Operaciones | SOURCE_REVIEW · incluido en auditoría funcional/visual | QA_POST_MERGE |
| 10 | `tracking-pedidos` | Operaciones | SOURCE_REVIEW · incluido en auditoría funcional/visual | QA_POST_MERGE |
| 11 | `delivery-mapa` | Operaciones | SOURCE_REVIEW · incluido en auditoría funcional/visual | QA_POST_MERGE |
| 12 | `tasks` | Operaciones | HARDENED_V16 · estados forward-only + archivo explícito | QA_POST_MERGE |
| 13 | `inventario` | Inventario | SOURCE_REVIEW · mutaciones separadas de evidencia scanner | QA_POST_MERGE |
| 14 | `inventario-scan` | Inventario | HARDENED_V16 · conteo físico honesto, sin falsa mutación | QA_POST_MERGE |
| 15 | `kardex` | Inventario | HARDENED_V16 · selector multi-producto | QA_POST_MERGE |
| 16 | `qr` | Inventario | HARDENED_V16 · QR fiscal exige hash/documento real | QA_POST_MERGE |
| 17 | `proveedores` | Compras | HARDENED_V16 · RIF + confirmación destructiva | QA_POST_MERGE |
| 18 | `compras` | Compras | SOURCE_REVIEW · flujo de compra/contabilidad sujeto a CI | QA_POST_MERGE |
| 19 | `contabilidad` | Contabilidad | HARDENED_V16 · períodos cerrados bloquean asiento nuevo | QA_POST_MERGE |
| 20 | `plan-cuentas` | Contabilidad | HARDENED_V16 · persistencia backend tenant-scoped | QA_POST_MERGE |
| 21 | `libro-mayor` | Contabilidad | SOURCE_REVIEW · lectura/reporting, sin mutación oculta | QA_POST_MERGE |
| 22 | `balance-sumas-saldos` | Contabilidad | SOURCE_REVIEW · cálculo sujeto a caracterización financiera | QA_POST_MERGE |
| 23 | `hoja-trabajo` | Contabilidad | HARDENED_V16 · ajustes marcados NO POSTEADO | QA_POST_MERGE |
| 24 | `estados-financieros` | Contabilidad | SOURCE_REVIEW · derivación desde ledger/reporting | QA_POST_MERGE |
| 25 | `cierre-contable` | Contabilidad | HARDENED_V16 · cierre persistente + carga deduplicada | QA_POST_MERGE |
| 26 | `bancos` | Contabilidad | HARDENED_V16 · hard-delete retirado de UI | QA_POST_MERGE |
| 27 | `normativa-contable` | Contabilidad | SOURCE_REVIEW · contenido referencial, validar estándar vigente | QA_POST_MERGE |
| 28 | `tributos` | Fiscal | SOURCE_REVIEW · reglas requieren vigencia/versionado | QA_POST_MERGE |
| 29 | `libro-ventas` | Fiscal | HARDENED_V16 · cero inferencia de alícuota; export bloqueable | QA_POST_MERGE |
| 30 | `normativa` | Fiscal | HARDENED_V16 · UI canónica + disclaimer oficial | QA_POST_MERGE |
| 31 | `nomina` | RRHH | HARDENED_V16 · máquina de estados terminal + delete sólo draft | QA_POST_MERGE |
| 32 | `rrhh` | RRHH | HARDENED_V16 · migración visual canónica | QA_POST_MERGE |
| 33 | `salud` | Salud | SOURCE_REVIEW · vertical clínica requiere QA privacidad/CRUD | QA_POST_MERGE |
| 34 | `veterinaria` | Salud | SOURCE_REVIEW · vertical incluida en audit gate | QA_POST_MERGE |
| 35 | `psicologia` | Salud | SOURCE_REVIEW · agenda/recordatorios con acciones explícitas | QA_POST_MERGE |
| 36 | `odontologia` | Salud | SOURCE_REVIEW · agenda/odontograma incluidos en audit gate | QA_POST_MERGE |
| 37 | `gimnasio` | Fitness | HARDENED_V16 · geometría inline eliminada | QA_POST_MERGE |
| 38 | `rutinas` | Fitness | SOURCE_REVIEW · servicio Gym compartido | QA_POST_MERGE |
| 39 | `nutricion` | Fitness | SOURCE_REVIEW · servicio Gym compartido | QA_POST_MERGE |
| 40 | `mensajes` | Comunicación | SOURCE_REVIEW · usuario confirma envío externo | QA_POST_MERGE |
| 41 | `analytics` | Analítica | SOURCE_REVIEW · visualización/telemetría bajo audit gate | QA_POST_MERGE |
| 42 | `reportes` | Analítica | SOURCE_REVIEW · exports/reporting sujetos a CI | QA_POST_MERGE |
| 43 | `auditoria` | Analítica | HARDENED_V16 · preflight local diferenciado de audit server-side | QA_POST_MERGE |
| 44 | `configuracion` | Administración | SOURCE_REVIEW · configuración incluida en audit gate | QA_POST_MERGE |
| 45 | `backend` | Administración | SOURCE_REVIEW · health/configuración incluida en audit gate | QA_POST_MERGE |
| 46 | `admin` | Administración | SOURCE_REVIEW · RBAC/multiempresa requiere matriz post-merge | QA_POST_MERGE |
| 47 | `marca` | Administración | SOURCE_REVIEW · assets/theming incluidos en audit visual | QA_POST_MERGE |
| 48 | `demo-control` | Administración | SOURCE_REVIEW · acceso demo sujeto a RBAC/licencias | QA_POST_MERGE |
| 49 | `licencias` | Administración | SOURCE_REVIEW · autorización comercial incluida en gate | QA_POST_MERGE |
| 50 | `importacion-data` | Administración | HARDENED_V16 · PREVIEW ONLY, no commit ficticio | QA_POST_MERGE |
| 51 | `reglas-negocio` | Administración | SOURCE_REVIEW · configuración no sustituye validación backend | QA_POST_MERGE |
| 52 | `modulos-madurez` | Administración | HARDENED_V16 · tier catálogo ≠ QA/madurez certificada | QA_POST_MERGE |
| 53 | `pretesting` | Administración | HARDENED_V16 · heurística explícita, NOT_EXECUTED ≠ PASS | QA_POST_MERGE |
| 54 | `vistas` | Administración | SOURCE_REVIEW · galería incluida en audit visual | QA_POST_MERGE |
| 55 | `profile` | Administración | SOURCE_REVIEW · perfil incluido en audit funcional | QA_POST_MERGE |
| 56 | `asistente-ia` | Soporte | SOURCE_REVIEW · IA no debe elevar permisos ni mutar finanzas sin gate | QA_POST_MERGE |
| 57 | `soporte` | Soporte | SOURCE_REVIEW · rutas/acciones externas explícitas | QA_POST_MERGE |
| 58 | `ayuda` | Soporte | SOURCE_REVIEW · contenido/navegación incluidos en audit visual | QA_POST_MERGE |

## FODA profundo

### Fortalezas

- Núcleo multiempresa con contexto de tenant, permisos y controles comerciales.
- Contabilidad con partida doble, `Decimal`, libro/reportes, cierres y trazabilidad creciente.
- Ventas, compras, inventario, bancos, nómina, fiscal, operaciones y verticales sobre una arquitectura modular.
- Sistema visual centralizado Light/Dark, primitives semánticas y auditores automáticos por ruta.
- Seguridad por cookies/CSRF, rate limits, CSP/headers, RBAC y separación de rutas públicas/mutables.
- PWA y estrategia offline/outbox existentes en la plataforma.
- Capacidad de especializar verticales sin cambiar el core financiero.
- En v16 se eliminan varias UI engañosas: importar sin persistir, ajustar stock sin hacerlo, QR fiscal ficticio y cierre contable sólo local.

### Debilidades

- Persisten dos generaciones de UI en algunas rutas no tocadas; el audit estricto debe seguir impulsando la convergencia.
- El alcance de 58 rutas runtime es grande respecto a la profundidad de QA necesaria para un ERP financiero.
- Importación carece todavía de commit transaccional/idempotente.
- Bancos carece todavía de workflow formal de reverso/corrección.
- Scanner no posee todavía un workflow aprobado conteo físico → ajuste de inventario.
- Idempotencia financiera no es aún universal.
- `LedgerEntry.posted` no representa todavía una máquina de estados completamente inmutable.
- Reglas fiscales/laborales requieren versionado temporal explícito y eliminación progresiva de hardcodes.
- Parte de observabilidad y evidencia runtime depende de CI/entornos externos que deben mantenerse estables.

### Oportunidades

- Diferenciación como ERP venezolano multiempresa con VES/USD/BCV y trazabilidad fiscal.
- Portal de contador/auditor con cierre, evidencias, observaciones y segregación de funciones.
- Importación asistida segura con dry-run, mapping, dedupe, transaction y rollback.
- Conciliación bancaria avanzada y reversos auditables.
- Versionado normativo por fecha efectiva para impuestos, retenciones, nómina y reportes.
- Offline-first controlado con reconciliación central y outbox idempotente.
- IA como copiloto de lectura/análisis, nunca como bypass de permisos o mutaciones financieras.
- Salud/Fitness/Operaciones como verticales licenciables sobre el core.

### Amenazas

- Una fuga cross-tenant, IDOR o escalada RBAC tendría impacto existencial.
- Corrupción de ledger, doble contabilización o cálculo fiscal silenciosamente incorrecto puede comprometer al cliente.
- Cambios regulatorios venezolanos pueden volver obsoletas reglas no versionadas.
- Dependencia de BCV, mapas, WhatsApp, correo e IA genera fallos fuera del control del ERP.
- El gran número de rutas aumenta superficie de regresión, accesibilidad y mantenimiento.
- Odoo/ERPNext y ERPs locales especializados compiten con ecosistemas y madurez más profundos.
- IA sin boundaries explícitos puede introducir acciones no autorizadas, fuga de contexto o decisiones financieras no deterministas.

## Roadmap posterior al QA

Estas prioridades son deliberadamente **post-QA** y no se presentan como implementadas por este PR:

1. Transactional bulk import.
2. Banking reversal / correction workflow.
3. Inventory adjustment workflow.
4. Universal financial idempotency.
5. Posted ledger immutability.
6. Restore drill / BCP.
7. Observability / SLO.
8. Load & capacity testing.
9. Fiscal rules versioning.
10. Cross-tenant automated matrix.

## Riesgos arquitectónicos abiertos

### Ledger

`posted` debe evolucionar hacia un lifecycle formal: draft/validated/posted/reversed con permisos, timestamps, author, idempotency key y prohibición de update/delete después de posteo. Reversar debe crear evidencia compensatoria, no reescribir historia.

### Tenant deletion / cascades

Los `onDelete: Cascade` son útiles en entornos de prueba, pero una empresa real no debería desaparecer por una operación cotidiana. Producción necesita decommissioning explícito: autorización reforzada, backup, retención legal, soft-delete/suspensión y purga controlada cuando proceda.

### Evidencia posterior al merge

El QA de aceptación debe cubrir, como mínimo: Light/Dark; desktop/tablet/mobile; zoom 125/150; navegación de las 58 rutas; botones/submit; loading/empty/error; permisos por rol/tenant; operaciones financieras; exports; PWA/offline/update; consola sin errores; accessibility/keyboard; y contraste visual. El SHA probado debe coincidir con el SHA desplegado.
