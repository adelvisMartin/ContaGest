# Lote 07–10 · trazabilidad técnica y entrega incremental (2026-11-16)

**Repositorio:** `adelvisMartin/ContaGest` · **base inspeccionada:** `main@e7706f3dac3ae4c677fcdff05a662765fa6bdcc6` · **20 tickets solicitados** · **SOURCE_REUSE=NONE**.
**Estado del lote:** **PARTIAL / NO_MERGE hasta checks del SHA candidato**. Este archivo no cierra ningún issue ni convierte presencia de source en flujo probado. Los dos productos comparten monorepo pero el lote enumera dominios **ContaGest**; Control Hípico permanece fuera de cambios de runtime y debe preservarse en los gates comunes.

## Alcance ejecutado por este PR

1. `scripts/verify-provider-integration-catalog-v772.mjs`: endurece **exclusivamente** la validación de URL de *provenance/documentación*, rechazando IP literals (incluido IPv6), hostnames internos/no cualificados y nombres de parámetros de credenciales incluso codificados o en fragmentos.
2. `tests/provider_integration_catalog_v772.test.mjs`: agrega casos negativos y un caso positivo de URL documental normal. La configuración `config/provider-integration-catalog-v772.json` **no cambia**, `runtimeEnabled=false` y todos los `providers[].enabled=false`.
3. Esta matriz incluye dependencias, límites de aceptación, pasos para continuar y riesgos verificados frente a source/issue. **No** implementa adapters, nuevas APIs, pipelines financieros, clínicas, PWA ni migraciones.

**Precisión de seguridad:** el guard valida enlaces estáticos del catálogo de investigación; **no** es una defensa de SSRF para solicitudes en tiempo de ejecución. Un adapter futuro necesitará allowlist de host, resolución DNS/IP contra rangos privados en cada conexión, bloqueo de redirección, timeouts, tamaño de respuesta, HMAC en webhook, inbox/outbox durable y tenants autorizados. Ninguna de esas defensas se declara probada aquí.

## Matriz de los 20 tickets (evidencia por archivo ≠ DoD)

| Bloque | Ticket | Señal concreta en `main` | Estado defendible / mínimo faltante |
| --- | --- | --- | --- |
| 07 | #707 — inteligencia OSS | `config/competitive-benchmark-v764.json` | **PARTIAL:** existe manifest; reevaluar vigencia/licencias por release, sin copiar fuente |
| 07 | #708 — parity ERP | `config/erp-parity-gap-ownership-v708.json` | **PARTIAL:** matriz de 10 cortes; cerrar sólo con APIs/PG17/UI y efecto contable real |
| 07 | #709 — Gym | `docs/GYM_CHECKIN_ATOMIC_V746.md` | **PARTIAL:** falta deduplicación durable del check-in, E2E multi-sede, rutinas/planes y pruebas offline |
| 07 | #710 — Dental | `docs/DENTISTRY_ERP_FINANCIAL_V2051.md` | **NOT_VERIFIED E2E:** agenda multiespacio, expedientes firmados y plan→factura/ledger con consentimiento y RBAC |
| 07 | #711 — Vet | `docs/VETERINARY_IMMUNIZATION_DATES_V748.md` | **NOT_VERIFIED E2E:** clínica/vacunas/lotes/hospitalización y recorrido financiero/privacidad |
| 08 | #753 — Quote→Order | `docs/SALES_QUOTE_ORDER_TRANSITIONS_V753.md` | **PARTIAL:** persistencia, snapshot, conversión idempotente, #762 y reserva #738 |
| 08 | #754 — Delivery | `docs/DELIVERY_LIFECYCLE_INTENT_V754.md` | **PARTIAL:** asignación/consumo real, backorders, reversos y fuente única de stock |
| 08 | #755 — Location/FEFO | `docs/INVENTORY_FEFO_PREFLIGHT_V755.md` | **PARTIAL:** allocator transaccional por lote/ubicación con PG17, expiración y tenants |
| 08 | #756 — Reorder/ageing | `docs/REORDER_DERIVED_INVARIANTS_V756.md` | **PARTIAL:** reconciliation de ageing, demanda/cobertura por localización y pruebas de carga |
| 08 | #757 — Procurement | `docs/PURCHASE_RECEIPT_PREFLIGHT_V757.md` | **PARTIAL:** pedido→recepción→factura/AP, concurrencia, idempotencia y ledger |
| 09 | #765 — POS | `docs/POS_CART_POLICY_V765.md` | **PARTIAL:** checkout/caja/pagos/stock/posting; previews **no** equivalen a venta |
| 09 | #769 — documentos posteados | `docs/POSTED_DOCUMENT_TRANSITION_V769.md` | **PARTIAL:** autoridad #762, reversal append-only, créditos y periodo cerrado |
| 09 | #744 — AR/AP | `docs/OPEN_ITEM_AGEING_PROJECTION_V744.md` | **PARTIAL:** allocations persistentes, conciliación #643 y dunning outbox |
| 09 | #743 — banca | `docs/BANK_STATEMENT_CSV_STRUCTURE_V743.md` | **PARTIAL:** import/matching/reconciliation/reversal con evidencias y tenant |
| 09 | #759 — activos | `docs/STRAIGHT_LINE_DEPRECIATION_V759.md` | **PARTIAL:** registro/posting/transfer/disposal sin ledger paralelo |
| 10 | #770 — portabilidad | `docs/PORTABILITY_ISSUE_770.md` | **PARTIAL:** XLSX, mapeo, rollback, permisos sobre export clínico, PG17 |
| 10 | #771 — BI | `docs/KPI_PAGE_RECONCILIATION_V771.md` | **PARTIAL:** indicadores reconciliables con #643 y drill-down browser |
| 10 | #772 — integraciones | `config/provider-integration-catalog-v772.json` | **INCREMENTO DE ESTE PR:** hardening de URL documental; adapters no habilitados |
| 10 | #745 — colaboración | directorio `backend/src/modules/collaboration/` | **NOT_VERIFIED E2E:** portal con ownership documental, permisos cliente-contador y outbox |
| 10 | #854 — notificaciones | `docs/NOTIFICATION_PROVIDER_ACK_V854.md` | **PARTIAL:** entrega/consent/preferences/retry/observabilidad en fuente autoritativa #853 |

Las marcas de este inventario son deliberadamente conservadoras y **no** sustituyen la inspección funcional de cada ticket en un HEAD nuevo. Para #708, leer la matriz más específica `config/erp-parity-gap-ownership-v708.json`; las rutas anteriores son pistas de source, no certificaciones.

## Orden técnico de integración (sin reescribir authorities)

1. **Bloqueante**: estabilizar CI/PG17 y exact-SHA de ramas concurrentes antes de declarar producción. No incorporar a este PR los cambios de #1287/#1296/#1298–#1308 ni reclamar sus archivos.
2. **Dominio comercial**: #762 (secuencia) + #738 (reserva/stock) → #753 → #754/#755 → #757 → #765 → #769. Ningún Delivery o POS crea asiento contable directo; todo posting usa #637.
3. **Finanzas y análisis**: #743/#744 con #637/#643 → #759/#770/#771; cierres de período y reconciliación real obligatorios.
4. **Servicios transversales**: #853 (jobs/outbox) → #772 (adapters verificados) → #854 (delivery evidence), luego #745. Ningún webhook toma identidad de tenant de su propio payload.
5. **Verticales**: #709/#710/#711 consumen Core Commercial/Finance/Notifications y prueban privacy/RBAC/consent, sin acoplar Core a verticales.

## Innovaciones prioritarias (propuestas, **no implementadas aquí**)

- Operación centrada en excepciones: dashboards con *last updated*, drill-down y fuente canónica; mostrar `partial/stale/unreconciled` en vez de un KPI aparentemente exacto.
- Workflow documental con corrección `reverse→new document`, snapshots fiscales/moneda e idempotencia visible para el operador.
- Priorización FEFO con alerta explicable de lote/vencimiento, no recomendación opaca de IA ni saldo duplicado.
- Importaciones con dry-run de diferencias y rechazo por fila, siempre sin postear ni enviar comunicaciones desde la previsualización.
- Verticales mobile-first accesibles y offline **sólo** para operaciones replay-safe; no prometer checkout offline, dispensación de medicamentos o facturación sin contrato de sincronización.

## Fuentes externas y criterio de licencia

Investigación de referencia, sin extraer ni copiar código/activos de terceros:
- [ERPNext Sales Order](https://docs.frappe.io/erpnext/sales-order) y [Purchase Receipt](https://docs.frappe.io/erpnext/purchase-receipt): separan compromisos, movimiento físico y efecto de factura.
- [Frappe REST authentication](https://docs.frappe.io/framework/user/en/guides/integration/rest_api/token_based_authentication): clave/secret por usuario y roles; no guardar tokens en cliente.
- [OpenVPM](https://github.com/evangauer/openvpm): PIMS API-first/clinical workflows, **AGPL-3.0**, sólo benchmark, no copiar código.
- [OWASP ASVS 5.0](https://asvs.owasp.org/) y [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): controles de auth, webhooks y red.
- [WCAG 2.2](https://www.w3.org/TR/wcag/): teclado, foco, target size, accesibilidad.
- Las licencias de Gym/Dental y referencias adicionales deben comprobarse contra repositorio y versión exactos **antes** de reutilización, independientemente del título de cada issue. `SOURCE_REUSE=NONE`.

## Verificación y decisión

**Source verified (en baseline):** AGENTS, onboarding, provider catalog/verifier/tests, workflows `.github/workflows/provider-integration-catalog-v772.yml` y `ci.yml`, lista de issues, PR concurrentes y caminos documentales. **Local monorepo:** BLOCKED (no checkout vía GitHub DNS). **Node #772 aislado:** PASS, 17/17 tests y parser/validador en Node v22.16.0, usando archivos de fuente y pruebas idénticos byte a byte a sus Git blobs en el PR (ver sección de iteración); catálogo JSON de contenido equivalente pero reserializado para el arnés aislado. **Lint, typecheck, build monorepo, PostgreSQL17, Playwright Chromium/Firefox/WebKit, Hípico, runtime y seguridad dinámica:** NOT_EXECUTED/PENDING hasta disponer de checkout/runner del candidato exacto. Ninguna evidencia aislada se convierte en PASS del monorepo.

**Gates relevantes para este cambio sin runtime:** `node --check scripts/verify-provider-integration-catalog-v772.mjs`; `node --check tests/provider_integration_catalog_v772.test.mjs`; `node scripts/verify-provider-integration-catalog-v772.mjs`; `node --test tests/provider_integration_catalog_v772.test.mjs`, plus `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm test`, `npm run build` y el matrix CI según archivo de workflow. No inventar salidas. Ante fallas existentes, rastrear job/test/line expected/received exacto y no modificar checks para obtener verde.

**Riesgos/rollback:** enlaces legítimos con claves llamadas `token` o hosts IP se rechazarán en **catalog evidence**, no afectan proveedores activos porque están deshabilitados; si se necesitan, documentar y revisar caso sin introducir excepción general. Rollback: revertir los archivos de este PR (sin DDL ni datos). No secrets, no credenciales, no cambios de permisos/tenants.

**Decisión:** PR en **draft** con avance real, de alcance delimitado. Ninguno de los 20 tickets cumple DoD completo en virtud de este PR. No cerrar issues ni promocionar producción sin validación, revisión de diff y checks del SHA final.

## Iteración de seguridad, QA y refactor del PR #1309 (2026-11-16)

**Diagnóstico reproducido:** la validación original eliminaba exactamente un punto final del hostname; `https://api.internal../docs` y `https://localhost../docs` quedaban con un punto residual que el control de sufijo no reconocía. Node 22 reprodujo la aceptación antes del fix. El parche ahora rechaza cualquier etiqueta DNS vacía por puntos consecutivos y conserva la aceptación de documentación pública normal.

**Cambios de arquitectura/acoplamiento:** sólo el guard documental de #772. `node:net.isIP` impide IP literales (incluido IPv4 normalizado desde `127.1` e IPv6). El scanner de parámetros recorre el iterador `URLSearchParams.keys()` con retorno anticipado, sin convertir todas las claves en un arreglo; rechaza nombres sensibles codificados y, además, `auth`, `authorization`, `session_id`, `jwt`, `bearer` y `credential`. Se comprueban tanto `source` como `licenseSource` sin alterar providers, endpoints, identidad, RBAC, schema ni CI.

**Reproducción aislada verificable:** Node `v22.16.0`; `node --check` de script/test, `node scripts/verify-provider-integration-catalog-v772.mjs` y `node --test tests/provider_integration_catalog_v772.test.mjs` completaron **17/17 PASS**. El `git hash-object` local de los dos archivos ejecutados coincidió con los Git blob SHAs publicados en el PR: `8364ace5afcfb630cefeac054dac6b36984ccfcb` (script) y `83d115985811b1383c8a297e2c8e740149b8b02f` (tests). El catálogo aislado fue reserializado, no es un archivo byte-exacto: los valores JSON canónicos coincidieron con el contenido leído del repo (longitud 5557 y FNV32 `727078091`), y el archivo remoto del catálogo no se modificó. **No se cuenta esta prueba como suite CI ni como smoke de PostgreSQL/browsers**.

### FODA técnico y riesgo residual

| Aspecto | Evaluación fundamentada | Acción y estado |
| --- | --- | --- |
| Fortaleza | El catálogo mantiene `runtimeEnabled=false`, todos los providers apagados, `SOURCE_REUSE=NONE` y contrato de tenant/firmas/reintentos explícito | **VERIFIED por fuente/contrato**, no por ejecución de adapters |
| Debilidad | `validSource` sólo examina enlaces de documentos; no comprueba DNS a tiempo de conexión ni filtra credenciales incrustadas en segmentos de ruta arbitrarios | Mantener **NO_RUNTIME** y revisión manual de provenance; ninguna afirmación SSRF-safe |
| Oportunidad | Reutilizar política declarativa en futuros ports/adapters con allowlist y DNS/IP enforcement real, HMAC y dedupe persistente | **OUT_OF_SCOPE** de este PR, requiere #772/#853 y tests red/PG17 |
| Amenaza | Encodings/hosts anómalos, secretos de proveedor y fuga inter-tenant si un futuro adapter confía en payload externo | Regresiones de URL agregadas; adapter futuro seguirá **BLOCKED** sin contrato firmado/tenancy |
| Amenaza de release | GitHub Actions permanece `queued/pending` y no hay checkout local completo ni runner PostgreSQL 17/Playwright en este entorno | **BLOCKED**; ninguna edición de `continue-on-error`, skips, timeouts o matriz para pintar verde |

**Gates no sustituibles:** `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:frontend`, `npm run build:backend`, migración/integración con PostgreSQL 17 efímero, navegador Chromium/Firefox/WebKit, aislamiento tenant y revisión CI por SHA. Los workflows `ci.yml`, `pr-quality-gate-v1.yml`, `qa-browser.yml` y `provider-integration-catalog-v772.yml` permanecieron intactos; el quality gate existente emplea PostgreSQL 16 y eso **no es evidencia PostgreSQL 17**. Hípico no fue modificado, no está probado por la ejecución aislada.

**Decisión actual:** **PARTIAL / BLOCKED_RELEASE**, no fusionar, no cerrar tickets ni desplegar; en cuanto los jobs comiencen, exigir run/job exact-SHA, logs y artefactos, clasificar causas reales por test y corregir sólo regresiones demostrables. El watch automático no realiza merge ni promete PASS.
