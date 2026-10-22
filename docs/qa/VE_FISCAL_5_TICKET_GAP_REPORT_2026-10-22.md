# Revisión QA P0 · ContaGest VE (#751, #785, #774, #775, #776)

**Fecha:** 2026-10-22. **Destino:** PR #1279, rama `feat/ve-tax-751-785-774-775-776-integrity-20261022`. **Veredicto actual:** PARTIAL / NOT READY TO MERGE. El HEAD debe consultarse de nuevo para cualquier evidencia exact-SHA.

## Evidencia ejecutada en esta revisión

- `node --experimental-strip-types --test tests/fiscal_rule_governance_policy_v751.test.mjs` sobre copia local exacta de los dos blobs Git publicados (`f380d62b2440bfcd78ec6a1307f3bf514baeabca` módulo y `062fcff6c82dc796f49fb749516de6609e15a8ae` test): **4/4 PASS** con Node 22.16.0, comprobado en distintas zonas horarias. Es evidencia **focal exact-blob**, no QA del backend/DB del commit completo.
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

## Ampliación 2026-10-22: #774 / #775 / #776 / #785

### Código implementado en el mismo PR

- Perfil #774: migración nueva `20261022190000_issue_774_taxpayer_profile_activation` sobre tabla existente, actores distintos DRAFT→REVIEWED→ACTIVE, fuente y RIF server-derived, prohibición PostgreSQL UPDATE/DELETE de evidencia histórica y períodos ACTIVE superpuestos; endpoint `/fiscal/taxpayer-profiles/:id/review|activate`. Emisión `module=iva|islr|retiva` o `kind=withholding` exige perfil activo; almacena snapshot/hash en `FiscalDocument` dentro de la misma transacción; consulta histórica `/fiscal/documents/:id/taxpayer-profile`.
- Familias #775/#776: `fiscal-event-rule-family.ts` prohíbe aplicar ruleKey de otro tributo, períodos discordantes y fechas no explícitas en eventos fiscales regulados. IVA e ISLR permanecen sin tasas prefijadas.
- Plan fiscal `ve-tax-posting-plan.ts`: determinación *NON_POSTING*, semántica de roles, precisión BigInt por unidades menores, redondeo mitad-arriba, IVA/exento/no-sujeto, retención de IVA sobre IVA, ISLR simple sobre base y reverso de líneas originales. `/fiscal/tax-events/preview` exige fuente y regla ACTIVE, perfil ACTIVE de RIF real, cuentas de tenant postables y balance de diario. **No contabiliza ni emite certificado**.
- #785: nuevo rol `withholding_receivable` naturaleza normal deudora (migración aditiva de CHECK) y `withholding_payable` preexistente para retenciones por pagar. Códigos reales se obtienen del plan de cuentas del tenant; cero fallback.
- UI: vista de fuentes, regla activa, revisión perfil, controles reviewer/activator y simulación de Debe/Haber con casos de denegación. No se exponen privilegios financieros nuevos al cliente.
- Matriz legal [`VE_TAX_LEGAL_MATRIX_2026.md`](../architecture/VE_TAX_LEGAL_MATRIX_2026.md): 2025 SNAT/2025/000054 derogó 2015/0049; Decreto 1808 ISLR exige familias/beneficiario/sustraendo/UT. Enlaces de apoyo no reemplazan capturas oficiales/hashes reales.

### Evidencias focales realmente ejecutadas

Comando en copia local construida con archivos cuyos blobs SHA se compararon en GitHub:
`node --experimental-strip-types --test tests/fiscal_rule_governance_policy_v751.test.mjs tests/fiscal_rule_snapshot_integrity_v751.test.mjs tests/fiscal_rule_snapshot_integrity_contract_v751.test.mjs tests/taxpayer_profile_activation_v774.test.mjs tests/ve_tax_posting_plan_v775_v776.test.mjs tests/fiscal_event_rule_family_v775_v776.test.mjs`.

Resultado: **PASS 23/23**, 0 fallos, Node 22.16.0. Para resolver el import TS→JS del módulo `ve-tax-posting-plan.ts` en este entorno local sin `tsx` se utilizó únicamente un enlace de desarrollo `.js→.ts` en la copia aislada; **no forma parte del PR**. En CI ese test corre con `tsx` después de `npm ci`. Esto prueba la lógica focal, NO el workflow GitHub ni el backend compilado.

TypeScript focal estricto: **PASS**, con `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --typeRoots /usr/local/slides_js/node_modules/@types --types node` sobre los cinco módulos TS puros. Un primer chequeo sin los tipos Node disponibles falló por `node:crypto`/`Buffer`; se corrigió la invocación del entorno, no se silenció el error.

SHA Git verificados (comparando `git hash-object` local con `fetch_file` remoto):
- perfil política `7225ddc298a559f47d0377914ad2328908b5d5d5`
- perfil test `fd07eb2c674a5bb8da19b82c9d2dabf27a088b08`
- plan financiero `24e581670d29b1c37ba647dc2bcf7855e49cfb12`
- plan test `918b5806b2b878c0818ee5a93ef419282baed4cc`
- familia fiscal política `542d3b7f75adce538e60ccb8bee79e863e388a44`
- familia test `83d47694167ddcfe93ac04552a81f1db0a628429`

### Bloqueos P0 restantes (BLOCK_MAIN=yes)

1. **#775/#776**: los endpoints `sales.routes.ts` y `purchases.routes.ts` siguen tomando `taxRate` de líneas solicitadas por el cliente para registrar sus asientos actuales. El nuevo preview no sustituye posting real. Todavía falta determinación normativa desde documento + beneficiario/proveedor + pago, certificado inmutable con idempotencia, reversos auditados, reconciliación y retención por período.
2. **#776**: el DSL actual soporta razón simple; NO sustraendos, límites en UT, clasificaciones completas o acumulación ISLR. Exigir revisión jurídica humana por concepto y normas vigentes. No fingir completitud.
3. **#774**: falta calendario/obligaciones municipal/SENIAT y distinción estructurada auditada ordinario/especial, notificación de agente, persona/beneficiario; los campos de categoría siguen siendo humanos/propuestos. La activación implementada necesita PG17 y browser real.
4. **#751/#785**: migraciones de cero y upgrade PG17, runtime RLS A/B y autorizaciones/carrera/advisory locks, browser, build y contraste de tipos del monorepo: **NOT_EXECUTED** debido a checkout remoto/dns inaccesible y ausencia de PostgreSQL en este entorno. No false PASS.
5. Reconciliar rama con `main` (avanzó durante ejecución), volver a ejecutar los gates en **nuevo SHA exacto** y resolver conflictos si aparecen; el estado `mergeable=true` de GitHub no demuestra calidad ni DoD.

**Decisión: PR DRAFT / NOT_READY** hasta resolver bloqueo funcional #775/#776 y pruebas integrales. Nada tocó producción. No cerrar #751 #785 #774 #775 #776 ni quitar del backlog #661.
