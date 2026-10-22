# Revisión QA P0 · ContaGest VE (#751, #785, #774, #775, #776)

**Fecha:** 2026-10-22. **Destino:** PR #1279, rama `feat/ve-tax-751-785-774-775-776-integrity-20261022`. **Veredicto actual:** PARTIAL / NOT READY TO MERGE. El HEAD debe consultarse de nuevo para cualquier evidencia exact-SHA.

## Evidencia ejecutada en esta revisión

- `node --experimental-strip-types --test tests/fiscal_rule_governance_policy_v751.test.mjs` sobre réplica local de la política pura: **4/4 PASS** con Node 22.16.0 en UTC y otras dos zonas horarias. El módulo publicado no tiene el mismo blob Git que la réplica debido a comentarios; NO usar esto como prueba exact-SHA del binario del repositorio.
- `tsc --strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/fiscal/fiscal-rule-governance-policy.ts` sobre réplica local: PASS focal. No sustituye el typecheck de workspace.
- Suite `fiscal_rule_snapshot_integrity_v751.test.mjs`: 5/5 PASS aislado de la revisión anterior; no revalidada como gate del HEAD actual.
- Verificación GitHub de branch/PR, cambios publicados, SHA y diff: VERIFIED (inspección, no ejecución de aplicación).
- Workflows remotos del SHA candidato: PENDING/QUEUED/SKIPPED al revisar, sin PASS global.
- **NOT EXECUTED**: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build:backend`, `npm run build:frontend`, PostgreSQL 17 `from-zero` y `upgrade`, API real/RLS, Playwright E2E y deployment exact-SHA. Clon completo bloqueado por DNS de github.com; sin PostgreSQL 17 disponible en la sesión. Ninguna consulta ni test se ejecutó sobre producción.

## Hallazgos y disposición

| Severidad | Ticket | Hallazgo | Estado |
| --- | --- | --- | --- |
| P0 | #751 | Regla aplicada sin LegalSource ni revisión independiente | Código nuevo: migración + API + política; **PG17 pendiente** |
| P0 | #751 | Overlap silencioso / snapshots mutables | Código endurecido en PR; pruebas PG17 pendientes |
| P0 | #775 | `sales.routes.ts` calcula IVA desde `req.body.lines[].taxRate`; posting contable no exige `ACTIVE LegalSource`, regla ni hash aplicado | **NO RESUELTO, BLOCK_MAIN** |
| P0 | #775 | `purchases.routes.ts` repite el mismo flujo de impuestos client-derived sin provenance jurídica del evento | **NO RESUELTO, BLOCK_MAIN** |
| P0 | #774 | `TaxpayerProfileVersion` sigue sólo en `DRAFT`; no hay política server-derived de activación, calendario, snapshot aplicado | **NO RESUELTO** |
| P0 | #776 | ISLR: preview puro, sin certificado real emitido/recibido, base normada por condición, anulaciones ni ledger | **NO RESUELTO** |
| P0 | #775 | IVA retenido: no existen aún certificados/reversos/versiones fiscales vinculados al posting comercial | **NO RESUELTO** |
| P1 | #785 | Resolver semántico integrado en posting de ventas/compras, pero falta PG17 multiempresa, reversos y validación contable exact-SHA del lote | Parcial existente; **NO VERIFIED** |
| P1 | #751 | El hash SHA-256 es una huella, no firma autenticada ni prueba autónoma de vigencia de la ley | Documentado; requiere revisión fuente real y control de acceso |
| P1 | #751 | La ruta legacy de captura crea borradores sin fuente legal; quedan inactivos y no sirven para emisión | **Comportamiento fail-closed intencional**, revisar migración de datos |

## Matriz mínima de regresión pendiente

1. **LegalSource / autoridad**: DRAFT sin review → 422; creator=self-review → 409; reviewer sin permiso → 403; hash incorrecto o tenant B → 422/409; reviewed source con regla malformada → 409. Rango UTC con inicio inclusivo y fin exclusivo.
2. **Activación**: reviewer y activator distintos, tres cuentas reales activas; dos activaciones concurrentes no duplican estado; overlap de dos reglas ACTIVE bajo PG advisory lock; supersession creciente sin ciclos; fuente REJECTED jamás ACTIVE.
3. **Snapshot**: emitir dos documentos con una regla validada; comparar hash legal y regla; subir versión y emitir después; lectura del documento antiguo sin reinterpretarlo; UPDATE y DELETE SQL rechazados aun cuando el caller conozca el ID.
4. **Ventas/compras IVA / ISLR**: regla ACTIVE obtenida en la misma transacción del evento; perfil ACTIVE del tenant derivado en servidor; `taxRate` enviado por UI no puede determinar posting; exact decimal / rounding, tasas cero o exento; roles AR/AP/VAT/withholding definidos por tenant y cuentas postables; balance Debe=Haber, idempotencia y crash rollback. Datos sintéticos.
5. **Certificados/reversiones**: creación por documento origen con unique/idempotencia, hash y período; 2º intento no duplica; nota de crédito/débito/reverso conserva historial y no doble efecto; period close rechaza mutaciones posteriores.
6. **Seguridad**: tenant A/B dos vías, principal sin permisos, sesión revocada/expirada, encabezado tenant manipulado, revisión de roles, RLS real con runtime no-superuser, audit trail en transacción, API y browser.
7. **Migraciones / release**: PostgreSQL17 de cero y upgrade con fixtures propios y limpieza incondicional; comparación de esquema; PR exact-SHA lint/typecheck/build/unit/E2E y checks protegidos; diferencia de bloqueo proveedor vs defecto de código.

## Autoridades existentes que no deben duplicarse

- `backend/src/modules/fiscal/fiscal.repository.ts`: regla/versiones/documento/close #629.
- `backend/src/modules/fiscal/fiscal-legal-source.repository.ts`: captura y revisión de fuentes #751.
- `backend/src/modules/accounting/accounting.service.ts` / `resolveSemanticPostingAccounts`: ledger y roles #637/#785; ventas/compras postean con transacción, pero aún falta conexión **legal-tax**.
- `FiscalDocumentRuleSnapshot`: evidencia histórica; no se reescribe ante ley futura.

## Criterio de seguridad

La revisión de una fuente capturada no valida automáticamente una alícuota; no preinstalar números del texto de una Gaceta. Se requiere comprobación de la disposición concreta, vigencia, supersession y alcance por persona, operación y jurisdicción. Hasta cerrar los hallazgos P0 y superar PostgreSQL 17 + browser + CI exact-SHA, mantener PR DRAFT y los 5 tickets OPEN en #661. Prohibido presentar el estado actual como cumplimiento SENIAT o release listo.
