# ContaGest + Control Hípico — FODA, riesgo residual y plan de cierre
**Corte:** 2026-11-16 · **baseline de revisión:** main e7706f3dac3ae4c677fcdff05a662765fa6bdcc6 · **Estado:** PARTIAL / NOT_RELEASE_READY.

## 1. Autoridad, límites y selección
- Monorepo: adelvisMartin/ContaGest. Dos productos y contextos de negocio independientes; Hípico no se conecta implícitamente al ledger financiero del ERP.
- Fuente: AGENTS.md v16.7, docs/PROJECT_START_HERE.md, .agents/TICKET_EXECUTION_POLICY.md, issues vivos y código del baseline. La auditoría del 15-10 es contexto histórico, no PASS actual.
- Cola canónica de cinco P0 ContaGest (#661): **#751, #785, #774, #775, #776**. La posición histórica #001 de Hípico es **#1011**, una línea independiente y además un gate de política; no se debe inventar un envío automático a Messenger.
- Este incremento sólo corrige defensas acotadas de #751/#785/#774 y caracteriza #775/#776/#1011. Ninguno de estos seis issues se cierra o se marca DONE por el PR.
- Alcance de archivos: gobernanza y tests fiscales (#751); selección y tests de perfil (#774); sync no destructivo, helper y tests del plan (#785); este informe. Con corrección acotada de sintaxis de una migración histórica #849 (requiere preflight de checksum antes del despliegue); sin cambio de tasas legales, posting fiscal nuevo, pago real, acceso a datos de producción, despliegue o automatización de WhatsApp.

## 2. Hallazgos source-grounded y cambios del incremento
| Issue | Evidencia de arquitectura actual | Incremento | Aceptación restante |
| --- | --- | --- | --- |
| #751 | FiscalLegalSource, revisión independiente, rule governance, snapshots y SQL previamente fusionados | Rechazar basis no-string sin invocar su toString; regresión hostil | Activación/supersession concurrente, intervalos, hashes, documento histórico, PG17/RLS/RBAC y UI |
| #785 | SemanticAccountRoleMapping, validación de roles y chart accounts ya implementados | Reemplazar upsert destructivo de plantilla por inserción aditiva con conflictos ignorados y auditoría atómica; regresiones de cuentas personalizadas | Conciliación posting real, transición de históricos, cuentas padre, reversos, pruebas con dos tenants y PG17 |
| #774 | TaxpayerProfileVersion y transiciones DRAFT→REVIEWED→ACTIVE con fuente/actores; DB FK existente | Exigir legalSourceId UUID en la selección pura de perfil ACTIVE, adicional al check de DB; tests negativos | Calendario/actividad/jurisdicción, snapshots emitidos, API/RBAC, competencia, PG17 y browser |
| #775 | IVA preview con regla revisada; rutas de aplicación de retención, reverso y conciliación | Revisión de autoridad; ningún nuevo flujo contable activado | Certificados, notas y documentos, base/exenciones, prueba real del balance e idempotencia, UI/API, norma vigente |
| #776 | Previews seguros de ISLR y familia de reglas existente | Caracterización, sin implementación funcional nueva | Conceptos, mínimos y beneficiarios legales, certificados, posting, rectificación, conciliación, PG17/browser |
| #1011 Hípico | Sugerencia manual con revisión/consentimiento por versión, copia explícita, sin autolectura ni autoenvío SOURCE | Se preservan restricciones y se transfiere evaluación de política al gate Hípico | Consentimiento/privacidad/QA físico, revisión oficial antes de cambiar decisión, no-go de SOURCE automático |

**Riesgo confirmado #785:** el handler anterior hacía Prisma upsert por tenant/código con update de todos los campos de plantilla; una segunda sincronización podía modificar cuentas previamente personalizadas. El nuevo camino usa createMany(skipDuplicates) en la misma transacción que AuditLog, sin modificar existentes. El campo synced conserva cantidad total de elementos de la plantilla y se añaden created/unchanged. Requiere prueba PostgreSQL y compatibilidad API.
**Riesgo #774:** el modelo SQL exige referencia legal, pero la función de dominio no la validaba antes de devolver el perfil. Ahora se exige UUID válido, sin alterar documentos existentes.
**Riesgo #751:** el parser DSL podía invocar String() de un objeto no-string no confiable antes de rechazarlo; la comprobación de tipo sucede ahora antes del lookup de vocabulario.

## 3. FODA técnico y de producto

### Fortalezas (hechos de fuente)
1. Plataforma multiempresa con boundaries para identidad, RLS/RBAC, documentos y contabilidad, en lugar de módulos completamente independientes.
2. Reglas de agentes, skills, políticas de seguridad y evidencia exact-SHA formalizadas; flujos de QA e inventario extenso de tests y suites.
3. PostgreSQL/Prisma, versionado de reglas fiscales, snapshots históricos y rol semántico de cuentas reutilizables.
4. Motor Hípico LAB, PWA/Android, mensajería/orquestación de pruebas y funciones de recuperación documentadas; las capacidades no equivalen a certificación de producción.
5. Política fiscal explícita: ninguna tasa productiva nueva sin fuente, vigencia y revisión. Fuente legal, RIF y empresa delimitados por tenant.
6. Integraciones diseñadas alrededor de authorities compartidas y principio free-first; no es obligatorio inventar costos o proveedor único.
7. Canales separados Hípico LAB y SOURCE, y bloqueo de automatización de Messenger no autorizada.

### Debilidades (hechos/riesgos pendientes de verificar en runtime)
1. Muchos issues P0/P1 abiertos y grandes épicas con aceptación incompleta; una implementación parcial no equivale a DONE.
2. Falta evidencia reciente de PostgreSQL 17 aislado, RLS de dos tenants, backup/restore 25/25, E2E 58 rutas y dispositivos físicos en el mismo candidate.
3. Workflows proliferados, checks externos inestables y dificultad de atribuir PASS a HEAD exacto; el baseline presenta Vercel failure.
4. En negocio, varias authorities están en preview/read-model o requieren conexión completa a posting, reverso, recibos, estados y UI.
5. UX a validar con teclado, focus, 360/390/430, ambos temas, estados vacíos/error, offline y lectores de pantalla.
6. Transición de migraciones/contratos de miles de pruebas y código histórico: el riesgo de romper un consumidor es alto.
7. Dependencias de política y capacidades externas para funciones Hípico; el producto no puede prometer autoenvío a Messenger normal.

### Oportunidades (propuestas, no funcionalidades existentes)
1. **Fiscal explainable by design:** cada cifra del IVA/ISLR/IGTF enlaza versión de regla, fuente/hora, base, cálculo exacto, asiento, documento y conciliación; sin declarar cumplimiento automático.
2. **Cierre contable guiado:** preflight por periodo, excepciones de balance, diferencias de tasa y certificados faltantes, con revisión humana y acciones reversibles.
3. **Copiloto de auditoría de sólo lectura:** búsqueda por documentos y reglas con provenance, citas y redacción de PII; nunca genera postings ni firma declaraciones.
4. **Inventario predictivo con explicaciones:** sugerencia de reposición y anomalías FEFO, pero aprobación humana y stocks/costos del ledger como autoridad.
5. **Operación offline resiliente:** PWA queues con idempotencia, control de conflicto y expiración de sesión; nada de persistir secretos/tokens en caché.
6. **Hípico LAB como producto de simulación seguro:** replay sintético, corpus de preguntas, trazabilidad de respuesta y panel de intervención humana; SOURCE permanece NO-GO.
7. **Cockpit de cumplimiento y recuperación:** dashboards de calidad verificable por SHA, migración, tenant-negative, backups y restores; nunca mezclar READY de hosting con release aprobado.
8. **A11y y métricas de tarea:** reducir pasos/errores con prototipos medibles sobre rutas operativas, sin reemplazar el design system aprobado.

### Amenazas (escenarios que requieren controles; no incidentes demostrados)
1. Cambios en providencias y vigencias de Venezuela o clasificación fiscal incorrecta pueden generar importes o libros erróneos.
2. Acceso entre empresas, token/sesión robados y enlaces compartibles podrían exponer operaciones, saldos y datos de terceros.
3. Asiento duplicado, pérdida de precisión, reintento o período cerrado pueden afectar integridad monetaria si se saltan transacciones.
4. Fallo de restore, degradación del proveedor free tier, lock/deadlock de DB y deriva de configuración afectan continuidad.
5. Un cliente no oficial o automatización de WhatsApp Messenger real contravendría el gate de política y arriesga cuentas/privacidad.
6. Datos personales de verticales clínicas exigen RBAC y trazabilidad especiales; no extender asistentes IA a diagnósticos.
7. Dependencias/skills externas, cambios de cadena de suministro y licencias incompatibles implican auditoría de origen.
8. Inflación del backlog/CI puede crear falsa sensación de avance por merges o checks saltados.

## 4. Backlog priorizado y dependencias

| Prioridad | Orden operativo | Owner canónico | Criterio material antes de cerrar |
| --- | --- | --- | --- |
| P0 | 1 | #751 → #774 → #775/#776/#778/#780/#781 → #782/#783 | Reglas/fuentes legales, tenant, posting + documentos/retenciones y prueba PG17 |
| P0 | 2 | #785, #637, #643 | Plan y roles reales, balance Debe/Haber, asientos inmutables, reversos, concurrencia |
| P0 | 3 | Hípico #1011, #892, #119, #120 | LAB canónico y seguro; SOURCE sin autolectura/autoenvío; QA físico y soak real |
| P0 | 4 | Hípico #1018, #842, #839 | RLS links, ledger reconciliado, rol backup, restore 25/25, GO/NO-GO exact-SHA |
| P0 | 5 | #669, #840, #841 y padres #624/#835/#837 | Candidato congelado, migraciones, seguridad, runtime servido y rollback verificable |
| P1 | 6 | #651, #979, #985, #688 y #836 | Hallazgos AppSec, contratos telemetría, PostgreSQL efímero en CI, build/provider |
| P1 | 7 | #743–#757, #765, #769, #770 | Documentos venta→entrega→inventario→subledger→bancos integrados de punta a punta |
| P1 | 8 | #849, #852, #848, #854, #772 | Catálogo, derechos, scheduling, notificaciones y adapters consumiendo core único |
| P1 | 9 | #746–#832 verticales Gym/Dental/Vet/Care | Identidades, agenda, permisos, auditoría y conciliación clínica/comercial end-to-end |
| P2 | 10 | #661, #663, #664, #665, #666, #657 | Dedupe, clean room, smoke, configuración y documentación, sin esconder deuda |
| P2 | 11 | #707/#708/#764/#773/#771 | Benchmark legal sin copiar fuentes, UX/observabilidad, dashboards reconciliables |

**No duplicar tickets ya cerrados:** #907 inbox LAB, #853 outbox, #851 session hardening y #659 functional gap audit constan cerrados en consulta viva; aplicar regresión/transferir nuevos defectos al owner activo. Las fuentes y evidencias históricas no acreditan un PASS de 2026-11-16.

## 5. Plan de innovación por fases
- **0–30 días, calidad primero:** exact-SHA pipeline estable, contratos API, QA PG17/tenant A/B, SAST/secrets, smoke funcional, restore drill, permisos de Hípico; corregir defects sin rediseño visual.
- **31–60 días, valor operativo:** completar five-P0 fiscales con norma verificable, centros de excepciones/conciliación y primer workflow entero ERP UI→API→DB→UI; medir tiempo por tarea y tasa de errores.
- **61–90 días, diferenciación:** asistente read-only con fuente, predicción explicable bajo aprobación humana, resiliencia offline y observabilidad accionable; primero threat model/RBAC/retención y pruebas de regresión.
- **Después de los gates:** expansión vertical y SEO sólo con datos no sensibles y licencia/legal revisadas; benchmarks sobre funciones observables y no sobre código privado.

## 6. Matriz de verificación y release
| Dimensión | Estado para este incremento | Evidencia requerida |
| --- | --- | --- |
| SOURCE_REVIEW | VERIFIED_SOURCE | Inspección de archivos/contratos GitHub en baseline y rama |
| LOCAL_STATIC | NOT_EXECUTED | npm run lint; npm run typecheck; agent router; skills |
| LOCAL_UNIT | PASS_FOCAL_ONLY | 12/12 pruebas en espejo aislado Node 22.16.0, siete archivos contrastados por SHA de blob; suite integral NOT_EXECUTED |
| LOCAL_INTEGRATION | NOT_EXECUTED | HTTP auth/RBAC, chart-account sync real y regla/perfil fiscal |
| LOCAL_POSTGRES | BLOCKED | PostgreSQL17 efímero; migraciones from-zero/upgrade, tenant A/B y cleanup |
| LOCAL_BUILD | BLOCKED | npm ci --no-audit --no-fund; npm run build; npm test |
| LOCAL_BROWSER_E2E | BLOCKED | Chromium como gate de PR; matrix Firefox/WebKit; Hípico QA; 58 rutas |
| REMOTE_CI | NOT_VERIFIED | Github checks sobre HEAD exacto del PR, no main previo |
| PHYSICAL_EXTERNAL | NOT_EXECUTED | Android/Windows/Messenger manual, soak 24–72h y restore real |
| REMOTE_DEPLOY | OUT_OF_SCOPE | Nunca desplegar un candidato incompleto |

**Evidencia focal real (2026-11-16):** comando ejecutado: node --experimental-strip-types --test sobre las tres suites #751/#774/#785 en /mnt/data/contagest-focal, resultado 12 PASS / 0 FAIL, exit 0. Hashes Git de los siete archivos fuente/test coincidieron con los blobs de la rama: 66f5b3a, 4b82b30, b81a423, 58895cd, 1fd2685, 3595955 y 5054b40 (prefijos de 40 hex). Se probó lógica de dominio real + dobles aislados de acceso a DB; **no se ejecutó Prisma/PostgreSQL real ni la suite contra un checkout completo**. La prueba de ruta sólo verifica cableado por fuente.

**Nota reproducibilidad:** la autoridad real del monorepo es npm workspaces + package-lock.json, por tanto npm ci, no pnpm install --frozen-lockfile sin migración aprobada. Los tests nuevos no reemplazan PostgreSQL. A falta de checkout local completo, no existe evidencia de PASS nativo; un PR permanece DRAFT y sin merge.

**Plan sugerido del runner:** npm ci → npm run agent:system:verify → npm run lint → npm test → npm run build → npm run test:ve-tax → npm run test:hipico → DB PG17 aislado + upgrade/migration → APIs RBAC/idempotencia/reconciliación → Playwright Chromium + Firefox/WebKit → diff/secrets/release exact-SHA. CI debe preservar artifacts y limpiar fixtures incluso en FAIL.

**Go/No-Go:** NO-GO de producción y de SOURCE automático; ningún ticket de estos cinco se considera completado hasta satisfacción material de sus criterios. El rollback del incremento de código es revertir los commits del PR, sin cambios de esquema ni datos de producción.

## 7. Política Messenger revisada
La revisión de fuentes oficiales el 2026-11-16 ratificó NO-GO de automatización de WhatsApp Messenger normal sin autorización expresa documentada. Las condiciones restringen auto-messaging y uso no personal no autorizado; las pautas de mensajería se actualizaron el 23-09-2026 y abarcan chats grupales. Hípico seguirá con LAB sintético y sugerencias manuales, sin lectura de SOURCE por cliente no oficial.
- https://www.whatsapp.com/legal/terms-of-service?lang=en
- https://www.whatsapp.com/legal/messaging-guidelines?lang=en
- https://faq.whatsapp.com/361005896189245/?helpref=faq_content&locale=es_LA

## 8. Registro de fuentes de proyecto
- https://github.com/adelvisMartin/ContaGest/issues/661
- https://github.com/adelvisMartin/ContaGest/issues/751
- https://github.com/adelvisMartin/ContaGest/issues/785
- https://github.com/adelvisMartin/ContaGest/issues/774
- https://github.com/adelvisMartin/ContaGest/issues/775
- https://github.com/adelvisMartin/ContaGest/issues/776
- https://github.com/adelvisMartin/ContaGest/issues/1011
- https://github.com/adelvisMartin/ContaGest/issues/842
- https://github.com/adelvisMartin/ContaGest/issues/839
- docs/audits/AUDITORIA_STAFF_CONTAGEST_CONTROL_HIPICO_2026-10-15.md


## 9. Iteración PR #1287 — causas comprobadas, refactor y control del despliegue

La evolución de este PR incorpora remediación de los primeros FAIL exact-SHA de GitHub Actions, **sin atribuirles PASS** hasta que se repitan sobre HEAD nuevo:

| Causa probada en runs del SHA inicial `19ac7c1` | Archivo y corrección acotada | Regresión/cierre |
| --- | --- | --- |
| TS2554; createLedgerEntry requería transacción | bank-reconciliation.service.ts: envolver creación de asiento en prisma.$transaction, conservar idempotencia y posting separado | Exigir DB/ledger write-off, período cerrado, retry y concurrencia |
| TS2339; invoice.exchangeRate no existe en PurchaseInvoice | fiscal-withholding-application.routes.ts: inspeccionar líneas del asiento original realmente persistido, todas VES con FX=1 y total positivo; guard puro y negativo #775 | `npm run test:ve-tax`, QA PostgreSQL de RETIVA y ledger |
| TS2345; bruto/deducciones/net tipados opcionales | payroll.routes.ts: validación explícita, variables estrechadas antes de calcular y guardar | suite nómina + 422 sin efectos, DB con tenant A/B |
| TS2322; auditoría catálogo no era Prisma JSON serializable tipado | service-catalog.service.ts: normalizar JSON antes de insertar audit en transacción | Typecheck y prueba con snapshot/audit real |
| PostgreSQL 42601/P3018, trigger #849 línea 115 | La migración source contenía `LANGUAGE plpgsql AS $` y cierre `$;`; corregido a `$$` en ambos lados; regresión de delimitadores existente en la suite #849 | Desde cero PG17, revisión de checksums por entorno, runner E2E real |
| npm audit: qs 6.16.0 vulnerable, GHSA-6pq8-jhm2-2vcw | package-lock.json fijado a qs 6.16.1, dentro del rango de Express/Body Parser, con SRI publicado | npm ci frozen, npm audit --omit=dev y smoke de HTTP |

### Preflight OBLIGATORIO para migración histórica #849

**No se ha consultado ninguna base de producción/staging. No se ha resuelto ni alterado el historial de migraciones de ellas.** El SQL anterior era sintácticamente inválido para PostgreSQL y los runners efímeros fallaron antes de aplicar #849; **eso no prueba que ninguna base persistente tenga el nombre marcado como aplicado, ni descarta bootstrap alternativo**.

Antes de ejecutar cualquier `prisma migrate deploy` fuera de PostgreSQL efímero, el owner DBA debe leer (no mutar) `public."_prisma_migrations"` en ese ambiente, específicamente `migration_name`, `checksum`, `finished_at`, `rolled_back_at`, `logs` para `20261022171000_issue_849_service_catalog_foundation`, y verificar la existencia real de sus seis tablas, trigger, políticas y permisos. Comparar checksum contra el archivo anterior y este candidato.

**Si aparece una fila aplicada, checksum inesperado, tablas creadas manualmente o deriva:** bloquear deploy; no sustituir artefactos, no usar `migrate resolve` a ciegas, no editar el historial ni eliminar datos; delegar reconciliación, backup + ruta de restore y plan forward-only al ticket #849/DBA. Corregir el archivo en Git **no** significa aprobar una migración reescrita en ambientes existentes. Si no está aplicada, probar migración desde cero y desde un upgrade sintético primero.

### Revalidación requerida tras último commit

- **Typecheck/build:** `npm ci --no-audit --no-fund && npm run typecheck && npm run build`.
- **Dominio:** `node --experimental-strip-types --test tests/chart_template_additive_sync_v785.test.mjs tests/taxpayer_profile_activation_v774.test.mjs tests/fiscal_rule_governance_policy_v751.test.mjs tests/ve_iva_withholding_source_fx_v775.test.mjs`; `node --test tests/service_catalog_schema_v849.test.mjs`.
- **Real PG17:** todos los SQL migrados desde cero, prueba de tenant A/B, RLS, immutable journal, write-off, IVA y reversos, idempotencia y limpieza garantizada.
- **Browser:** Chromium de PR, matriz Firefox/WebKit, responsive/focus/loading/empty/error; Android y WhatsApp SOURCE reales siguen sin automatización.
- **Security:** audit `qs`, consultas cross-tenant, control de URL/PII, dependencias y secretos.
- **Release:** reexaminar `main` y candidate SHA y logs de ese mismo commit. Sin resultado exact-SHA, decisión BLOCKED/NOT_EXECUTED, no DONE.

**Restricción de alcance:** estas correcciones de CI no entregan el DoD completo de #751/#774/#775/#776/#785 ni los gates físicos de Hípico. No convertir el PR en mega-refactor de todo el monorepo; futuros cambios deben estar ligados a evidencia y aceptar prueba completa.
